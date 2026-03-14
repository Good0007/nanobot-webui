# [AI:FILE] tool=copilot date=2026-03-12 author=chenweikang
"""Webui-managed per-provider metadata (models list, etc.).

Delegates to the unified webui_config store (webui_config.json).
This module is kept for backward-compatibility with existing import paths.
"""

from __future__ import annotations

from webui.utils.webui_config import get_provider_models, set_provider_models

__all__ = ["get_provider_models", "set_provider_models"]
