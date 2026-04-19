"""Workspace file serving — safe, auth-gated access to the agent's workspace."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from webui.api.deps import get_services, get_current_user
from webui.api.gateway import ServiceContainer

router = APIRouter()


def _resolve_safe(workspace: Path, path: str) -> Path:
    """Resolve *path* to an absolute Path that must lie inside *workspace*.

    Accepts both absolute paths (e.g. ``/home/user/.nanobot/workspace/out.html``)
    and relative paths (e.g. ``out.html`` or ``subdir/report.md``).

    Raises HTTP 403 if the resolved path escapes the workspace root.
    """
    candidate = Path(path)
    if candidate.is_absolute():
        full = candidate.resolve()
    else:
        full = (workspace / path).resolve()

    workspace_resolved = workspace.resolve()
    try:
        full.relative_to(workspace_resolved)
    except ValueError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied: path outside workspace")

    return full


@router.get("/file")
async def serve_workspace_file(
    path: Annotated[str, Query(..., description="Relative or absolute file path within the workspace")],
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> FileResponse:
    """Serve a single file from the agent workspace.

    The resolved path must lie inside ``workspace_path``.  Both relative and
    absolute paths are accepted so that paths straight from ``write_file``
    tool-call arguments (which may be absolute) work without client-side
    normalisation.
    """
    workspace = svc.config.workspace_path
    full = _resolve_safe(workspace, path)

    if not full.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    if not full.is_file():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Path is not a file")

    media_type, _ = mimetypes.guess_type(str(full))
    return FileResponse(
        str(full),
        media_type=media_type or "application/octet-stream",
        filename=full.name,
    )


@router.get("/files")
async def list_workspace_files(
    current_user: Annotated[dict, Depends(get_current_user)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
    subdir: Annotated[str, Query()] = "",
) -> list[dict]:
    """List files in the workspace (or a sub-directory).

    Returns a flat list of ``{name, path, size, modified}`` dicts.
    Only files are listed; directories are not expanded recursively.
    """
    workspace = svc.config.workspace_path
    if subdir:
        base = _resolve_safe(workspace, subdir)
        if not base.is_dir():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a directory")
    else:
        base = workspace.resolve()

    result = []
    for item in sorted(base.iterdir()):
        if item.is_file():
            stat = item.stat()
            result.append({
                "name": item.name,
                "path": str(item.relative_to(workspace.resolve())),
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
    return result
