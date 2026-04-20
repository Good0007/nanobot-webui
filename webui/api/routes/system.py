"""System information and update routes."""

from __future__ import annotations

import asyncio
import shutil
import sys
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

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


@router.get("/version")
async def get_version(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Return current installed and latest PyPI versions of nanobot and nanobot-webui."""
    webui_current = _get_installed_version("nanobot-webui")
    nanobot_current = _get_installed_version("nanobot-ai")

    # Fetch latest versions from PyPI concurrently
    webui_latest, nanobot_latest = await asyncio.gather(
        _fetch_pypi_version("nanobot-webui"),
        _fetch_pypi_version("nanobot-ai"),
    )

    return {
        "nanobot_webui": {
            "current": webui_current,
            "latest": webui_latest,
        },
        "nanobot": {
            "current": nanobot_current,
            "latest": nanobot_latest,
        },
    }


@router.post("/update")
async def update_packages(
    admin: Annotated[dict, Depends(require_admin)],
) -> dict:
    """Upgrade nanobot and nanobot-webui to their latest PyPI versions (admin only).

    Tries multiple install strategies in order:
    1. python -m pip install --upgrade  (standard pip)
    2. uv pip install --upgrade         (uv-managed venv without pip module)
    """
    packages = ["nanobot-ai", "nanobot-webui"]

    async def _run(*cmd: str) -> tuple[int, str]:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=180)
        output = stdout.decode(errors="replace") if stdout else ""
        return proc.returncode, output

    strategies: list[list[str]] = [
        [sys.executable, "-m", "pip", "install", "--upgrade", *packages],
    ]
    # If uv is available, add it as a fallback (install into the current venv)
    uv_bin = shutil.which("uv")
    if uv_bin:
        strategies.append([uv_bin, "pip", "install", "--upgrade",
                            "--python", sys.executable, *packages])

    last_output = ""
    for cmd in strategies:
        try:
            code, output = await _run(*cmd)
            last_output = output
            if code == 0:
                return {"success": True, "output": output[-1000:]}
            # If pip module is missing, try next strategy
            if "No module named pip" in output:
                continue
            # Other non-zero exit: surface immediately
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"Update failed (exit {code}): {output[-600:]}",
            )
        except asyncio.TimeoutError:
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Update timed out after 180 s")

    raise HTTPException(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        f"No working package manager found. Last output: {last_output[-400:]}",
    )
