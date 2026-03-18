"""Channels routes: list, update config, hot-reload."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from webui.api.deps import get_services, require_admin
from webui.api.gateway import ServiceContainer
from webui.api.models import ChannelStatus, UpdateChannelRequest

router = APIRouter()

# Maps channel name → config attribute on ChannelsConfig
_CHANNEL_NAMES = [
    "telegram", "whatsapp", "discord", "feishu", "dingtalk",
    "email", "slack", "qq", "matrix", "mochat",
]


def _channel_config_dict(name: str, svc: ServiceContainer) -> dict[str, Any]:
    """Return the channel config as a dict (camelCase keys, secrets masked)."""
    cfg = getattr(svc.config.channels, name, None)
    if cfg is None:
        return {}
    raw: dict[str, Any] = cfg if isinstance(cfg, dict) else cfg.model_dump(by_alias=True)
    raw = dict(raw)  # ensure mutable copy
    # Mask common secret fields
    for key in ("token", "appSecret", "secret", "imapPassword", "smtpPassword",
                "bridgeToken", "accessToken", "appToken", "botToken",
                "app_secret", "imap_password", "smtp_password", "bridge_token",
                "access_token", "app_token", "bot_token"):
        if key in raw and raw[key]:
            raw[key] = f"••••{str(raw[key])[-4:]}"
    return raw


def _ch_enabled(ch_cfg: Any) -> bool:
    """Return the enabled flag from a channel config (dict or Pydantic model)."""
    if isinstance(ch_cfg, dict):
        return bool(ch_cfg.get("enabled", ch_cfg.get("Enabled", False)))
    return bool(getattr(ch_cfg, "enabled", False))


@router.get("", response_model=list[ChannelStatus])
async def list_channels(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> list[ChannelStatus]:
    result = []
    status_map = svc.channels.get_status()

    for name in _CHANNEL_NAMES:
        ch_cfg = getattr(svc.config.channels, name, None)
        if ch_cfg is None:
            continue
        running_info = status_map.get(name, {})
        result.append(
            ChannelStatus(
                name=name,
                enabled=_ch_enabled(ch_cfg),
                running=running_info.get("running", False),
                config=_channel_config_dict(name, svc),
            )
        )
    return result


@router.patch("/{name}", response_model=ChannelStatus)
async def update_channel(
    name: str,
    body: UpdateChannelRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> ChannelStatus:
    from nanobot.config.loader import save_config

    ch_cfg = getattr(svc.config.channels, name, None)
    if ch_cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Channel '{name}' not found")

    # Only update fields that are provided and don't contain mask placeholders.
    # Use by_alias=True (camelCase) so that merging camelCase payload keys from
    # the frontend never produces duplicate snake_case + camelCase entries for
    # the same field, which would cause Pydantic v2 to raise a ValidationError.
    updated = dict(ch_cfg) if isinstance(ch_cfg, dict) else ch_cfg.model_dump(by_alias=True)
    # Handle top-level enabled toggle
    if body.enabled is not None:
        updated["enabled"] = body.enabled
    for k, v in body.config.items():
        if isinstance(v, str) and v.startswith("••••"):
            continue  # skip masked sentinel values
        # Coerce string booleans sent by the frontend back to Python bool
        if v == "true":
            v = True
        elif v == "false":
            v = False
        elif k == "allowFrom" or k == "allow_from":
            if isinstance(v, str):
                v = [x.strip() for x in v.split(",") if x.strip()]
        updated[k] = v

    try:
        if isinstance(ch_cfg, dict):
            new_cfg = updated
        else:
            new_cfg = type(ch_cfg).model_validate(updated)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    setattr(svc.config.channels, name, new_cfg)
    save_config(svc.config)

    status_map = svc.channels.get_status()
    running_info = status_map.get(name, {})
    return ChannelStatus(
        name=name,
        enabled=_ch_enabled(new_cfg),
        running=running_info.get("running", False),
        config=_channel_config_dict(name, svc),
    )


@router.post("/{name}/reload", response_model=ChannelStatus)
async def reload_channel(
    name: str,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> ChannelStatus:
    if name not in _CHANNEL_NAMES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Channel '{name}' not found")

    await svc.channels.reload_channel(name)

    status_map = svc.channels.get_status()
    ch_cfg = getattr(svc.config.channels, name)
    running_info = status_map.get(name, {})
    return ChannelStatus(
        name=name,
        enabled=_ch_enabled(ch_cfg),
        running=running_info.get("running", False),
        config=_channel_config_dict(name, svc),
    )


@router.post("/reload-all", status_code=204)
async def reload_all_channels(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> None:
    await svc.channels.reload_all(svc.config)
