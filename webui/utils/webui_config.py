"""webui_config — unified WebUI configuration store.

All WebUI-specific settings that live outside nanobot's core ``config.json``
are persisted in a single file: ``~/.nanobot/webui_config.json``.

Top-level schema (all sections optional, defaults shown):

    {
        // Skills
        "disabled_skills": [],

        // MCP server toggles  (true = enabled, absence = enabled)
        "mcp_enabled": {},

        // S3 / OSS storage
        "s3": {
            "enabled": false,
            "endpoint_url": "",
            "access_key_id": "",
            "secret_access_key": "",
            "bucket": "",
            "region": "",
            "public_base_url": ""
        },

        // Per-provider extra metadata (models lists, etc.)
        "provider_meta": {},

        // Users (bcrypt-hashed passwords)
        "users": [],

        // Custom Providers (user-defined custom OpenAI-compatible providers)
        "custom_providers": {},

        // Exec environment variables
        // exec_env: static key-value pairs injected into every ExecTool run
        // exec_env_passthrough: env-var names read from parent process at exec time
        "exec_env": {},
        "exec_env_passthrough": []
    }

Usage
-----
    from webui.utils.webui_config import cfg

    # read
    cfg.get_disabled_skills()
    cfg.is_mcp_server_enabled("my-server")
    cfg.get_s3()
    cfg.get_provider_models("openai")
    cfg.get_users()
    cfg.get_custom_providers()

    # write
    cfg.set_disabled_skills({"weather"})
    cfg.set_mcp_server_enabled("my-server", False)
    cfg.set_s3({...})
    cfg.set_provider_models("openai", ["gpt-4o"])
    cfg.save_users([...])
    cfg.set_custom_provider("my_openai", {"api_key": "sk-...", "api_base": "..."})

Thread-safety: relies on Python's GIL for simple dict updates and atomic
``replace()`` for file writes (POSIX-atomic, best-effort on Windows).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_FILENAME = "webui_config.json"

_S3_DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "endpoint_url": "",
    "access_key_id": "",
    "secret_access_key": "",
    "bucket": "",
    "region": "",
    "public_base_url": "",
}

_DEFAULTS: dict[str, Any] = {
    "disabled_skills": [],
    "mcp_enabled": {},
    "s3": _S3_DEFAULTS,
    "provider_meta": {},
    "users": [],
    "exec_env": {},
    "exec_env_passthrough": [],
}


def _config_path() -> Path:
    from nanobot.config.loader import get_config_path
    return get_config_path().parent / _FILENAME


# ---------------------------------------------------------------------------
# Migration from legacy per-file storage
# ---------------------------------------------------------------------------

def _migrate(nanobot_dir: Path) -> dict[str, Any]:
    """Read legacy separate config files and merge into a single dict.

    Called only when webui_config.json does not yet exist.
    Migrated files are left in place (not deleted) so a downgrade is safe.
    """
    merged: dict[str, Any] = dict(_DEFAULTS)

    # webui_state.json  →  disabled_skills + mcp_enabled
    state_file = nanobot_dir / "webui_state.json"
    if state_file.exists():
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
            if state.get("disabled_skills"):
                merged["disabled_skills"] = state["disabled_skills"]
            if state.get("mcp_enabled"):
                merged["mcp_enabled"] = state["mcp_enabled"]
        except Exception:
            pass

    # webui_provider_meta.json  →  provider_meta
    meta_file = nanobot_dir / "webui_provider_meta.json"
    if meta_file.exists():
        try:
            merged["provider_meta"] = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    # webui_users.json  →  users
    users_file = nanobot_dir / "webui_users.json"
    if users_file.exists():
        try:
            data = json.loads(users_file.read_text(encoding="utf-8"))
            # legacy format: {"users": [...]}
            merged["users"] = data.get("users", data) if isinstance(data, dict) else data
        except Exception:
            pass

    # s3_config.json  →  s3
    s3_file = nanobot_dir / "s3_config.json"
    if s3_file.exists():
        try:
            merged["s3"] = {**_S3_DEFAULTS, **json.loads(s3_file.read_text(encoding="utf-8"))}
        except Exception:
            pass

    return merged


# ---------------------------------------------------------------------------
# Low-level I/O
# ---------------------------------------------------------------------------

def load() -> dict[str, Any]:
    """Return the full config dict merged with defaults for missing keys."""
    p = _config_path()
    if not p.exists():
        # First run: attempt migration from legacy files.
        data = _migrate(p.parent)
        # Persist immediately so migration only runs once.
        save(data)
        return data
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    return {**_DEFAULTS, **data}


def save(state: dict[str, Any]) -> None:
    """Atomically write the full config dict."""
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

def get_disabled_skills() -> set[str]:
    return set(load().get("disabled_skills", []))


def set_disabled_skills(disabled: set[str]) -> None:
    state = load()
    state["disabled_skills"] = sorted(disabled)
    save(state)


# ---------------------------------------------------------------------------
# MCP server toggles
# ---------------------------------------------------------------------------

def get_mcp_enabled() -> dict[str, bool]:
    """Return the per-server enabled map. Missing entries default to True."""
    return dict(load().get("mcp_enabled", {}))


def is_mcp_server_enabled(name: str) -> bool:
    return get_mcp_enabled().get(name, True)


def set_mcp_server_enabled(name: str, enabled: bool) -> None:
    state = load()
    mapping: dict[str, bool] = state.get("mcp_enabled", {})
    if enabled:
        mapping.pop(name, None)   # absence == enabled, keeps file clean
    else:
        mapping[name] = False
    state["mcp_enabled"] = mapping
    save(state)


# ---------------------------------------------------------------------------
# S3 / OSS Storage
# ---------------------------------------------------------------------------

def get_s3() -> dict[str, Any]:
    """Return the S3 config section, merged with defaults."""
    return {**_S3_DEFAULTS, **load().get("s3", {})}


def set_s3(cfg: dict[str, Any]) -> None:
    state = load()
    existing = {**_S3_DEFAULTS, **state.get("s3", {})}
    existing.update(cfg)
    state["s3"] = existing
    save(state)


# ---------------------------------------------------------------------------
# Provider metadata (models lists, etc.)
# ---------------------------------------------------------------------------

def get_provider_models(name: str) -> list[str]:
    """Return the user-defined model list for a provider (may be empty)."""
    return load().get("provider_meta", {}).get(name, {}).get("models", [])


def set_provider_models(name: str, models: list[str]) -> None:
    state = load()
    meta: dict = state.get("provider_meta", {})
    meta.setdefault(name, {})["models"] = models
    state["provider_meta"] = meta
    save(state)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_users() -> list[dict[str, Any]]:
    return list(load().get("users", []))


def save_users(users: list[dict[str, Any]]) -> None:
    state = load()
    state["users"] = users
    save(state)


# ---------------------------------------------------------------------------
# Custom Providers
# ---------------------------------------------------------------------------

def get_custom_providers() -> dict[str, dict]:
    """Return all custom providers. Format: { name: { api_key: str, api_base: str, extra_headers: dict } }."""
    return load().get("custom_providers", {})


def set_custom_provider(name: str, config_dict: dict) -> None:
    """Add or update a custom provider."""
    state = load()
    providers: dict = state.get("custom_providers", {})
    providers[name] = config_dict
    state["custom_providers"] = providers
    save(state)


def delete_custom_provider(name: str) -> bool:
    """Delete a custom provider. Returns True if deleted, False if not found."""
    state = load()
    providers: dict = state.get("custom_providers", {})
    if name in providers:
        del providers[name]
        state["custom_providers"] = providers
        save(state)
        return True
    return False


# ---------------------------------------------------------------------------
# Exec environment variables
# ---------------------------------------------------------------------------

# [AI:START] tool=copilot date=2026-04-20 author=chenweikang
def get_exec_env() -> dict[str, str]:
    """Return static env-var key-value pairs to inject into ExecTool runs."""
    return dict(load().get("exec_env", {}))


def set_exec_env(env: dict[str, str]) -> None:
    """Persist static exec env vars.  Pass an empty dict to clear."""
    state = load()
    state["exec_env"] = dict(env)
    save(state)


def get_exec_env_passthrough() -> list[str]:
    """Return the list of parent-process env-var names to pass through to ExecTool."""
    return list(load().get("exec_env_passthrough", []))


def set_exec_env_passthrough(names: list[str]) -> None:
    """Persist the exec env passthrough allowlist.  Pass an empty list to clear."""
    state = load()
    state["exec_env_passthrough"] = list(names)
    save(state)
# [AI:END]
