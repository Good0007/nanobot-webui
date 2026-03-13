"""[Session] patches — extend session lifecycle for WebUI-initiated deletion."""

from __future__ import annotations


def apply() -> None:
    """Patch 3: SessionManager.delete — evicts the entry from the in-memory cache
    and removes the persisted file from disk.
    """
    from nanobot.session import manager as _session_manager

    def _session_delete(self, key: str) -> None:
        self._cache.pop(key, None)
        path = self._get_session_path(key)
        if path.exists():
            path.unlink()

    _session_manager.SessionManager.delete = _session_delete  # type: ignore[attr-defined]
