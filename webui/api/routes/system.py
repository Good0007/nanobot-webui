"""System information and update routes."""

from __future__ import annotations

import asyncio
import json as _json
import shutil
import sys
from typing import Annotated, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from webui.api.deps import get_current_user, require_admin

router = APIRouter()


def _get_installed_version(package: str) -> str:
    try:
        from importlib.metadata import version
        return version(package)
    except Exception:
        return "unknown"


async def _fetch_pypi_version(package: str) -> str | None:
    """Fetch the latest release version from PyPI (runs in thread pool)."""
    import json
    import urllib.request

    def _fetch() -> str | None:
        try:
            url = f"https://pypi.org/pypi/{package}/json"
            with urllib.request.urlopen(url, timeout=8) as resp:  # noqa: S310
                data = json.loads(resp.read())
                return data["info"]["version"]
        except Exception:
            return None

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch)


def _get_nanobot_required_version() -> str:
    """Read the nanobot-ai version required by the installed nanobot-webui."""
    try:
        from importlib.metadata import requires
        deps = requires("nanobot-webui") or []
        for dep in deps:
            if dep.lower().startswith("nanobot-ai"):
                # e.g. "nanobot-ai==0.1.5.post1"
                return dep.split("==")[-1].strip()
        return "unknown"
    except Exception:
        return "unknown"


@router.get("/version")
async def get_version(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Return current installed and latest PyPI versions.

    nanobot-ai version is determined by the nanobot-webui dependency spec;
    only nanobot-webui is checked against PyPI for updates.
    """
    webui_current = _get_installed_version("nanobot-webui")
    nanobot_current = _get_installed_version("nanobot-ai")
    nanobot_required = _get_nanobot_required_version()

    webui_latest = await _fetch_pypi_version("nanobot-webui")

    return {
        "nanobot_webui": {
            "current": webui_current,
            "latest": webui_latest,
        },
        "nanobot": {
            "current": nanobot_current,
            # Show the version bundled with the latest nanobot-webui, not independently tracked
            "latest": nanobot_required,
        },
    }


def _sse(event: str, data: str) -> str:
    """Format a single SSE message."""
    payload = _json.dumps({"event": event, "data": data})
    return f"data: {payload}\n\n"


async def _stream_upgrade() -> AsyncIterator[str]:
    """Run pip/uv upgrade for nanobot-webui (nanobot-ai follows as a dependency)."""
    packages = ["nanobot-webui"]

    strategies: list[list[str]] = [
        [sys.executable, "-m", "pip", "install", "--upgrade", *packages],
    ]
    uv_bin = shutil.which("uv")
    if uv_bin:
        strategies.append([uv_bin, "pip", "install", "--upgrade",
                            "--python", sys.executable, *packages])

    for idx, cmd in enumerate(strategies):
        yield _sse("log", f"$ {' '.join(cmd)}")
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            assert proc.stdout is not None
            no_pip = False
            async for raw in proc.stdout:
                line = raw.decode(errors="replace").rstrip()
                if line:
                    yield _sse("log", line)
                    if "No module named pip" in line:
                        no_pip = True

            await asyncio.wait_for(proc.wait(), timeout=180)
            if proc.returncode == 0:
                yield _sse("done", "Update completed successfully.")
                return
            if no_pip and idx < len(strategies) - 1:
                yield _sse("log", "pip not available, trying next strategy...")
                continue
            yield _sse("error", f"Update failed (exit {proc.returncode}).")
            return
        except asyncio.TimeoutError:
            yield _sse("error", "Update timed out after 180 s.")
            return

    yield _sse("error", "No working package manager found.")


@router.post("/update")
async def update_packages(
    admin: Annotated[dict, Depends(require_admin)],
) -> StreamingResponse:
    """Stream upgrade progress via SSE (admin only)."""
    return StreamingResponse(
        _stream_upgrade(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
