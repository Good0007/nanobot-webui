"""[Channel] patches — relax access-control restrictions managed by the WebUI."""

from __future__ import annotations


def apply() -> None:
    """Patch 1: BaseChannel.is_allowed  — empty allow_from list → allow all (same as ["*"]).
    Patch 2: ChannelManager._validate_allow_from — no-op; WebUI manages this via UI.
    """
    from nanobot.channels import base as _base
    from nanobot.channels import manager as _manager

    def _is_allowed_patched(self, sender_id: str) -> bool:
        allow_list = getattr(self.config, "allow_from", [])
        if not allow_list or "*" in allow_list:
            return True
        return str(sender_id) in allow_list

    _base.BaseChannel.is_allowed = _is_allowed_patched  # type: ignore[method-assign]
    _manager.ChannelManager._validate_allow_from = lambda self: None  # type: ignore[method-assign]
