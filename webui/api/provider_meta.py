# [AI:FILE] tool=copilot date=2026-03-12 author=chenweikang
"""Webui-managed per-provider metadata (models list, etc.).

Stored in ~/.nanobot/webui_provider_meta.json separately from nanobot's
config.json so that nanobot source code does not need to be modified.
"""

from __future__ import annotations

import json
from pathlib import Path

_META_PATH = Path.home() / ".nanobot" / "webui_provider_meta.json"


def _load() -> dict:
    if _META_PATH.exists():
        try:
            return json.loads(_META_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save(meta: dict) -> None:
    _META_PATH.parent.mkdir(parents=True, exist_ok=True)
    _META_PATH.write_text(
        json.dumps(meta, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def get_provider_models(name: str) -> list[str]:
    """Return the user-defined model list for a provider (may be empty)."""
    return _load().get(name, {}).get("models", [])


def set_provider_models(name: str, models: list[str]) -> None:
    """Persist the model list for a provider."""
    meta = _load()
    meta.setdefault(name, {})["models"] = models
    _save(meta)
