"""Config routes: agent settings and gateway config."""

from __future__ import annotations

import datetime
import io
import json
import mimetypes
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse

from webui.api.deps import get_services, require_admin
from webui.api.gateway import ServiceContainer
from webui.api.models import (
    AgentSettingsRequest,
    AgentSettingsResponse,
    GatewayConfigRequest,
    GatewayConfigResponse,
    HeartbeatConfigModel,
    S3ConfigRequest,
    S3ConfigResponse,
)
from nanobot.config.schema import Config

router = APIRouter()

# Workspace markdown files that are allowed to be read/written via the API
_WORKSPACE_FILES = {"AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"}


def _mask(value: str) -> str:
    """Mask an API key, showing only the last 4 characters."""
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


@router.get("/agent", response_model=AgentSettingsResponse)
async def get_agent_settings(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> AgentSettingsResponse:
    d = svc.config.agents.defaults
    t = svc.config.tools
    ch = svc.config.channels
    return AgentSettingsResponse(
        model=d.model,
        provider=d.provider,
        max_tokens=d.max_tokens,
        temperature=d.temperature,
        max_iterations=d.max_tool_iterations,
        context_window_tokens=d.context_window_tokens,
        reasoning_effort=d.reasoning_effort,
        workspace=d.workspace,
        restrict_to_workspace=t.restrict_to_workspace,
        exec_timeout=t.exec.timeout,
        path_append=t.exec.path_append,
        web_search_api_key=_mask(t.web.search.api_key),
        web_proxy=t.web.proxy,
        send_progress=ch.send_progress,
        send_tool_hints=ch.send_tool_hints,
    )


@router.patch("/agent", response_model=AgentSettingsResponse)
async def update_agent_settings(
    body: AgentSettingsRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> AgentSettingsResponse:
    from nanobot.config.loader import save_config

    d = svc.config.agents.defaults
    t = svc.config.tools
    ch = svc.config.channels

    if body.model is not None:
        d.model = body.model
    if body.provider is not None:
        d.provider = body.provider
    if body.max_tokens is not None:
        d.max_tokens = body.max_tokens
    if body.temperature is not None:
        d.temperature = body.temperature
    if body.max_iterations is not None:
        d.max_tool_iterations = body.max_iterations
    if body.context_window_tokens is not None:
        d.context_window_tokens = body.context_window_tokens
    if body.reasoning_effort is not None:
        d.reasoning_effort = body.reasoning_effort
    if body.workspace is not None:
        d.workspace = body.workspace
    if body.restrict_to_workspace is not None:
        t.restrict_to_workspace = body.restrict_to_workspace
    if body.exec_timeout is not None:
        t.exec.timeout = body.exec_timeout
    if body.path_append is not None:
        t.exec.path_append = body.path_append
    if body.web_search_api_key is not None:
        t.web.search.api_key = body.web_search_api_key
    if body.web_proxy is not None:
        t.web.proxy = body.web_proxy or None
    if body.send_progress is not None:
        ch.send_progress = body.send_progress
    if body.send_tool_hints is not None:
        ch.send_tool_hints = body.send_tool_hints

    save_config(svc.config)
    svc.reload_provider()
    return await get_agent_settings(_admin, svc)


@router.get("/gateway", response_model=GatewayConfigResponse)
async def get_gateway_config(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> GatewayConfigResponse:
    g = svc.config.gateway
    return GatewayConfigResponse(
        host=g.host,
        port=g.port,
        heartbeat=HeartbeatConfigModel(
            enabled=g.heartbeat.enabled,
            interval_s=g.heartbeat.interval_s,
        ),
    )


@router.patch("/gateway", response_model=GatewayConfigResponse)
async def update_gateway_config(
    body: GatewayConfigRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> GatewayConfigResponse:
    from nanobot.config.loader import save_config

    g = svc.config.gateway
    if body.host is not None:
        g.host = body.host
    if body.port is not None:
        g.port = body.port
    if body.heartbeat_enabled is not None:
        g.heartbeat.enabled = body.heartbeat_enabled
    if body.heartbeat_interval_s is not None:
        g.heartbeat.interval_s = body.heartbeat_interval_s

    save_config(svc.config)
    return await get_gateway_config(_admin, svc)


@router.get("/workspace-file/{name}")
async def get_workspace_file(
    name: str,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    if name not in _WORKSPACE_FILES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"File '{name}' not allowed")
    workspace = Path(svc.config.agents.defaults.workspace).expanduser()
    path = workspace / name
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    return {"name": name, "content": content}


@router.put("/workspace-file/{name}")
async def put_workspace_file(
    name: str,
    body: dict,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    if name not in _WORKSPACE_FILES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"File '{name}' not allowed")
    content: str = body.get("content", "")
    workspace = Path(svc.config.agents.defaults.workspace).expanduser()
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / name).write_text(content, encoding="utf-8")
    return {"name": name, "content": content}


@router.get("/workspace/export")
async def export_workspace(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> StreamingResponse:
    """Package the entire .nanobot directory as a ZIP for download."""
    from nanobot.config.loader import get_config_path

    nanobot_dir = get_config_path().parent
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if nanobot_dir.exists():
            for f in sorted(nanobot_dir.rglob("*")):
                if f.is_file():
                    zf.write(f, f.relative_to(nanobot_dir))
    buf.seek(0)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"nanobot_backup_{ts}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/workspace/import")
async def import_workspace(
    file: Annotated[UploadFile, File()],
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    """Import a .nanobot backup ZIP. Auto-backs up the current .nanobot dir first."""
    from nanobot.config.loader import get_config_path

    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only .zip files are accepted")

    nanobot_dir = get_config_path().parent
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path: str | None = None

    # Back up the current .nanobot directory before overwriting
    if nanobot_dir.exists() and any(nanobot_dir.iterdir()):
        backup_dir = nanobot_dir.parent / f".nanobot_backup_{ts}"
        shutil.copytree(nanobot_dir, backup_dir)
        backup_path = str(backup_dir)

    # Extract the uploaded zip
    data = await file.read()
    buf = io.BytesIO(data)
    nanobot_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(buf, "r") as zf:
        # Security: reject paths that escape the target directory
        for member in zf.namelist():
            target = (nanobot_dir / member).resolve()
            if not str(target).startswith(str(nanobot_dir.resolve())):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Invalid path in archive: {member}",
                )
        zf.extractall(nanobot_dir)

    return {"ok": True, "backup": backup_path}


@router.get("/raw")
async def get_raw_config(
    _admin: Annotated[dict, Depends(require_admin)],
    _svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    """Return the raw config.json content as a string."""
    from nanobot.config.loader import get_config_path

    path = get_config_path()
    if not path.exists():
        return {"content": "{}"}
    return {"content": path.read_text(encoding="utf-8")}


@router.put("/raw")
async def put_raw_config(
    body: dict,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    """Validate and write raw config.json content."""
    from nanobot.config.loader import get_config_path

    content: str = body.get("content", "")
    # Validate JSON syntax first
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid JSON: {exc}") from exc
    # Validate against schema
    try:
        new_config = Config.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Schema validation error: {exc}") from exc

    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

    # Sync in-memory config so all other routes (e.g. channels) see the new values
    svc.config.__dict__.update(new_config.__dict__)

    return {"ok": True, "content": content}


# ---------------------------------------------------------------------------
# S3 / OSS Storage config
# ---------------------------------------------------------------------------

def _load_s3() -> dict:
    from webui.utils.webui_config import get_s3
    return get_s3()


def _save_s3(cfg: dict) -> None:
    from webui.utils.webui_config import set_s3
    set_s3(cfg)


@router.get("/s3", response_model=S3ConfigResponse)
async def get_s3_config(
    _admin: Annotated[dict, Depends(require_admin)],
) -> S3ConfigResponse:
    cfg = _load_s3()
    return S3ConfigResponse(
        enabled=cfg.get("enabled", False),
        endpoint_url=cfg.get("endpoint_url", ""),
        access_key_id=cfg.get("access_key_id", ""),
        secret_access_key=_mask(cfg.get("secret_access_key", "")),
        bucket=cfg.get("bucket", ""),
        region=cfg.get("region", ""),
        public_base_url=cfg.get("public_base_url", ""),
    )


@router.put("/s3", response_model=S3ConfigResponse)
async def put_s3_config(
    body: S3ConfigRequest,
    _admin: Annotated[dict, Depends(require_admin)],
) -> S3ConfigResponse:
    cfg = _load_s3()
    if body.enabled is not None:
        cfg["enabled"] = body.enabled
    if body.endpoint_url is not None:
        cfg["endpoint_url"] = body.endpoint_url
    if body.access_key_id is not None:
        cfg["access_key_id"] = body.access_key_id
    # Only update secret if a non-empty value is provided
    if body.secret_access_key:
        cfg["secret_access_key"] = body.secret_access_key
    if body.bucket is not None:
        cfg["bucket"] = body.bucket
    if body.region is not None:
        cfg["region"] = body.region
    if body.public_base_url is not None:
        cfg["public_base_url"] = body.public_base_url
    _save_s3(cfg)
    return await get_s3_config(_admin)


@router.post("/s3/upload")
async def upload_to_s3(
    file: Annotated[UploadFile, File()],
    _admin: Annotated[dict, Depends(require_admin)],
) -> dict:
    """Upload a file to the configured S3/OSS bucket and return its public URL."""
    cfg = _load_s3()
    if not cfg.get("enabled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "S3 storage is not enabled")
    if not cfg.get("bucket"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "S3 bucket is not configured")

    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "boto3 is not installed; run: pip install boto3",
        ) from exc

    endpoint_url: str | None = cfg.get("endpoint_url") or None
    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=cfg.get("access_key_id") or None,
        aws_secret_access_key=cfg.get("secret_access_key") or None,
        region_name=cfg.get("region") or None,
    )

    data = await file.read()
    original_name = file.filename or "upload"
    safe_name = Path(original_name).name
    uid = uuid.uuid4().hex[:8]
    today = datetime.date.today().strftime("%Y-%m")
    key = f"uploads/{today}/{uid}_{safe_name}"

    content_type = (
        file.content_type
        or mimetypes.guess_type(safe_name)[0]
        or "application/octet-stream"
    )

    try:
        client.put_object(
            Bucket=cfg["bucket"],
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Upload failed: {exc}",
        ) from exc

    public_base = (cfg.get("public_base_url") or "").rstrip("/")
    if public_base:
        url = f"{public_base}/{key}"
    elif endpoint_url:
        url = f"{endpoint_url.rstrip('/')}/{cfg['bucket']}/{key}"
    else:
        url = f"https://{cfg['bucket']}.s3.amazonaws.com/{key}"

    return {"url": url, "key": key, "filename": safe_name}
