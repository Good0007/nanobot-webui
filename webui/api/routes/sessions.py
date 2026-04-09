"""Sessions routes."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from webui.api.deps import get_services, get_current_user
from webui.api.gateway import ServiceContainer
from webui.api.models import MessageInfo, SessionInfo

router = APIRouter()


def _is_own_session(key: str, user: dict) -> bool:
    """Users can only access their own ``web:<user_id>`` sessions.
    Admins can access all sessions.
    """
    if user.get("role") == "admin":
        return True
    return key.startswith(f"web:{user['id']}")


@router.get("", response_model=list[SessionInfo])
async def list_sessions(
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> list[SessionInfo]:
    sessions = svc.session_manager.list_sessions()
    visible = [
        s for s in sessions
        if _is_own_session(s.get("key", ""), current_user)
    ]
    return [
        SessionInfo(
            key=s["key"],
            created_at=s.get("created_at"),
            updated_at=s.get("updated_at"),
            last_message=s.get("last_message"),
        )
        for s in visible
    ]


@router.get("/{key:path}/messages", response_model=list[MessageInfo])
async def get_session_messages(
    key: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> list[MessageInfo]:
    if not _is_own_session(key, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

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


@router.get("/{key:path}/memory", response_model=dict)
async def get_session_memory(
    key: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    if not _is_own_session(key, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    workspace = svc.config.workspace_path
    memory_file = workspace / "MEMORY.md"
    history_file = workspace / "HISTORY.md"

    return {
        "memory": memory_file.read_text(encoding="utf-8") if memory_file.exists() else "",
        "history": history_file.read_text(encoding="utf-8") if history_file.exists() else "",
    }


@router.delete("/{key:path}/messages/{index}", status_code=200)
async def revoke_message(
    key: str,
    index: int,
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    """Revoke (delete) a message by index.

    If the target is a user message, also remove the subsequent assistant/tool
    response messages that form the reply pair.
    """
    if not _is_own_session(key, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    session = svc.session_manager.get_or_create(key)
    if index < 0 or index >= len(session.messages):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid message index")

    # Remove the target message and all subsequent messages
    count = len(session.messages) - index
    del session.messages[index:]

    from datetime import datetime
    session.updated_at = datetime.now()
    svc.session_manager.save(session)
    return {"removed": count}


@router.delete("/{key:path}", status_code=204)
async def delete_session(
    key: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> None:
    if not _is_own_session(key, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    svc.session_manager.delete(key)
