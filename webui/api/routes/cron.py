"""Cron jobs routes (CRUD) + execution history."""

from __future__ import annotations

import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from webui.api.deps import get_services, require_admin
from webui.api.gateway import ServiceContainer
from webui.api.models import (
    CronJobInfo,
    CronJobRequest,
    CronScheduleModel,
    CronStateModel,
    CronPayloadModel,
    MessageInfo,
    SessionInfo,
)

router = APIRouter()


def _to_info(job) -> CronJobInfo:
    return CronJobInfo(
        id=job.id,
        name=job.name,
        enabled=job.enabled,
        schedule=CronScheduleModel(
            kind=job.schedule.kind,
            at_ms=job.schedule.at_ms,
            every_ms=job.schedule.every_ms,
            expr=job.schedule.expr,
            tz=job.schedule.tz,
        ),
        payload=CronPayloadModel(
            message=job.payload.message,
            deliver=job.payload.deliver,
            channel=job.payload.channel,
            to=job.payload.to,
        ),
        state=CronStateModel(
            next_run_at_ms=job.state.next_run_at_ms,
            last_run_at_ms=job.state.last_run_at_ms,
            last_status=job.state.last_status,
            last_error=job.state.last_error,
        ),
        delete_after_run=job.delete_after_run,
        created_at_ms=job.created_at_ms,
        updated_at_ms=job.updated_at_ms,
    )


@router.get("/jobs", response_model=list[CronJobInfo])
async def list_jobs(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> list[CronJobInfo]:
    return [_to_info(j) for j in svc.cron.list_jobs(include_disabled=True)]


@router.post("/jobs", response_model=CronJobInfo, status_code=201)
async def create_job(
    body: CronJobRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> CronJobInfo:
    from nanobot.cron.types import CronSchedule

    try:
        job = svc.cron.add_job(
            name=body.name,
            schedule=CronSchedule(
                kind=body.schedule.kind,
                at_ms=body.schedule.at_ms,
                every_ms=body.schedule.every_ms,
                expr=body.schedule.expr,
                tz=body.schedule.tz,
            ),
            message=body.payload.message,
            deliver=body.payload.deliver,
            channel=body.payload.channel,
            to=body.payload.to,
            delete_after_run=body.delete_after_run,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    if not body.enabled:
        svc.cron.enable_job(job.id, False)
        job = next((j for j in svc.cron.list_jobs(include_disabled=True) if j.id == job.id), job)

    return _to_info(job)


@router.put("/jobs/{job_id}", response_model=CronJobInfo)
async def update_job(
    job_id: str,
    body: CronJobRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> CronJobInfo:
    """Update a job by replacing schedule/payload in-place via store access."""
    from nanobot.cron.types import CronPayload, CronSchedule

    store = svc.cron._load_store()
    job = next((j for j in store.jobs if j.id == job_id), None)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Job '{job_id}' not found")

    job.name = body.name
    job.enabled = body.enabled
    job.delete_after_run = body.delete_after_run
    job.schedule = CronSchedule(
        kind=body.schedule.kind,
        at_ms=body.schedule.at_ms,
        every_ms=body.schedule.every_ms,
        expr=body.schedule.expr,
        tz=body.schedule.tz,
    )
    job.payload = CronPayload(
        kind="agent_turn",
        message=body.payload.message,
        deliver=body.payload.deliver,
        channel=body.payload.channel,
        to=body.payload.to,
    )
    job.updated_at_ms = int(time.time() * 1000)

    # Recompute next run
    from nanobot.cron.service import _compute_next_run
    if job.enabled:
        job.state.next_run_at_ms = _compute_next_run(job.schedule, int(time.time() * 1000))
    else:
        job.state.next_run_at_ms = None

    svc.cron._save_store()
    svc.cron._arm_timer()
    return _to_info(job)


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: str,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> None:
    removed = svc.cron.remove_job(job_id)
    if not removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Job '{job_id}' not found")


# ---------------------------------------------------------------------------
# Cron execution history (session viewer)
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=list[SessionInfo])
async def list_cron_sessions(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
    job_id: str | None = Query(None, description="Filter sessions by job ID"),
    search: str | None = Query(None, description="Search sessions by key or last message"),
) -> list[SessionInfo]:
    """List all sessions with a ``cron:`` prefix — these are created by cron job executions."""
    all_sessions = svc.session_manager.list_sessions()
    cron_sessions = [s for s in all_sessions if s.get("key", "").startswith("cron")]

    # Filter by job_id: matches both "cron:<job_id>" (legacy) and "cron:<job_id>:<ts>" (new)
    if job_id:
        cron_sessions = [
            s for s in cron_sessions
            if _session_belongs_to_job(s.get("key", ""), job_id)
        ]

    # Free-text search on key and last_message
    if search:
        q = search.lower()
        cron_sessions = [
            s for s in cron_sessions
            if q in s.get("key", "").lower() or q in (s.get("last_message") or "").lower()
        ]

    return [
        SessionInfo(
            key=s["key"],
            created_at=s.get("created_at"),
            updated_at=s.get("updated_at"),
            last_message=s.get("last_message"),
        )
        for s in sorted(cron_sessions, key=lambda s: s.get("updated_at", ""), reverse=True)
    ]


def _session_belongs_to_job(session_key: str, job_id: str) -> bool:
    """Check if a session key belongs to a given job ID.

    Supports both legacy format ``cron:<job_id>`` and new format ``cron:<job_id>:<ts>``.
    """
    # Strip the "cron:" prefix
    rest = session_key[5:] if session_key.startswith("cron:") else session_key
    # Exact match (legacy single-session) or starts with job_id followed by ":"
    return rest == job_id or rest.startswith(f"{job_id}:")


@router.get("/sessions/{key:path}/messages", response_model=list[MessageInfo])
async def get_cron_session_messages(
    key: str,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> list[MessageInfo]:
    """Get messages for a specific cron session."""
    if not key.startswith("cron"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a cron session")

    session = svc.session_manager.get_or_create(key)
    return [
        MessageInfo(
            role=m.get("role", "unknown"),
            content=m.get("content"),
            timestamp=m.get("timestamp"),
            tool_calls=m.get("tool_calls"),
            tool_call_id=m.get("tool_call_id"),
            name=m.get("name"),
        )
        for m in session.messages
    ]
