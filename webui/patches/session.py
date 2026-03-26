"""[Session] patches — extend session lifecycle for WebUI-initiated deletion."""

from __future__ import annotations
import json
from pathlib import Path


def _last_message_preview(path: Path) -> str | None:
    """Read the last user/assistant message from a session JSONL file for sidebar preview."""
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            chunk = min(4096, size)
            f.seek(max(0, size - chunk))
            tail = f.read().decode("utf-8", errors="ignore")
        for line in reversed(tail.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                if data.get("role") in ("user", "assistant"):
                    content = data.get("content") or ""
                    if isinstance(content, str):
                        text = content.strip()
                        if text and text != "[Background task progress]" and not text.startswith("<think>") and not text.startswith("[SubAgent completed]") and not text.startswith("[Subagent '"):
                            return text[:80] + ("\u2026" if len(text) > 80 else "")
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return None


def apply() -> None:
    """Patch 3: SessionManager.delete — evicts the entry from the in-memory cache
    and removes the persisted file from disk.

    Also patches Session.get_history() to remap the custom "sub_tool" role (used to
    store SubAgent tool-call chains for display) back to the LLM-valid roles
    ("assistant" for tool_call declarations, "tool" for tool results) before the
    history is fed to any LLM provider.
    """
    from nanobot.session import manager as _session_manager

    def _session_delete(self, key: str) -> None:
        self._cache.pop(key, None)
        path = self._get_session_path(key)
        if path.exists():
            path.unlink()

    _session_manager.SessionManager.delete = _session_delete  # type: ignore[attr-defined]

    # --- list_sessions with last_message preview --------------------------
    # The installed nanobot-ai package's list_sessions does not include
    # last_message.  Wrap it to append the preview computed from disk.
    _orig_list_sessions = _session_manager.SessionManager.list_sessions

    def _list_sessions_patched(self):  # type: ignore[override]
        sessions = _orig_list_sessions(self)
        for s in sessions:
            if "last_message" not in s or s["last_message"] is None:
                path = Path(s["path"]) if "path" in s else self._get_session_path(s["key"])
                s["last_message"] = _last_message_preview(path)
        return sessions

    _session_manager.SessionManager.list_sessions = _list_sessions_patched  # type: ignore[method-assign]

    # --- sub_tool filter --------------------------------------------------
    # "sub_tool" is a synthetic role stored in session JSONL purely for UI
    # display (SubAgent tool-call chains).  The LLM only needs the final
    # assistant result — sub_tool entries are dropped from get_history().
    # The "system" bridge message is kept so there is no consecutive-
    # assistant sequence (main agent ends with assistant, SubAgent result
    # is also assistant — the system line separates them).
    _orig_get_history = _session_manager.Session.get_history

    def _get_history_patched(self, max_messages: int = 500):  # type: ignore[override]
        history = _orig_get_history(self, max_messages)
        return [m for m in history if m.get("role") != "sub_tool"]

    _session_manager.Session.get_history = _get_history_patched  # type: ignore[method-assign]
