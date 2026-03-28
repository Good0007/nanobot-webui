"""Channels routes: list, update config, hot-reload."""

from __future__ import annotations

import base64
import io
import json
import os
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from webui.api.deps import get_services, require_admin
from webui.api.gateway import ServiceContainer
from webui.api.models import ChannelStatus, UpdateChannelRequest

router = APIRouter()

# weixin is first — it's the primary Chinese messaging channel
_CHANNEL_NAMES = [
    "weixin", "wecom",
    "telegram", "whatsapp", "discord", "feishu", "dingtalk",
    "email", "slack", "qq", "matrix", "mochat",
]


# ---------------------------------------------------------------------------
# WeChat (weixin) helpers
# ---------------------------------------------------------------------------

def _weixin_state_file() -> Path:
    from nanobot.config.paths import get_runtime_subdir
    d = get_runtime_subdir("weixin")
    d.mkdir(parents=True, exist_ok=True)
    return d / "account.json"


def _weixin_logged_in() -> bool:
    f = _weixin_state_file()
    if not f.exists():
        return False
    try:
        return bool(json.loads(f.read_text()).get("token"))
    except Exception:
        return False


def _weixin_default_config() -> dict[str, Any]:
    from nanobot.channels.weixin import WeixinConfig
    return WeixinConfig().model_dump(by_alias=True)


def _wecom_default_config() -> dict[str, Any]:
    from nanobot.channels.wecom import WecomConfig
    return WecomConfig().model_dump(by_alias=True)


def _ilink_headers(*, auth_token: str | None = None) -> dict[str, str]:
    """Build per-request iLink API headers (random UIN, matching weixin.py)."""
    uint32 = int.from_bytes(os.urandom(4), "big")
    wechat_uin = base64.b64encode(str(uint32).encode()).decode()
    h: dict[str, str] = {
        "X-WECHAT-UIN": wechat_uin,
        "Content-Type": "application/json",
        "AuthorizationType": "ilink_bot_token",
    }
    if auth_token:
        h["Authorization"] = f"Bearer {auth_token}"
    return h


class WeixinQrStartResponse(BaseModel):
    qrcode_id: str
    qr_image: str  # data:image/png;base64,...
    scan_url: str  # fallback URL if qrcode lib unavailable


class WeixinQrStatusResponse(BaseModel):
    status: str  # wait | scaned | confirmed | expired


def _channel_config_dict(name: str, svc: ServiceContainer) -> dict[str, Any]:
    """Return the channel config as a dict (camelCase keys, secrets masked)."""
    cfg = getattr(svc.config.channels, name, None)
    if cfg is None:
        if name == "weixin":
            raw: dict[str, Any] = _weixin_default_config()
        elif name == "wecom":
            raw = _wecom_default_config()
        else:
            return {}
    else:
        raw = cfg if isinstance(cfg, dict) else cfg.model_dump(by_alias=True)
        raw = dict(raw)  # ensure mutable copy
    # Mask common secret fields
    for key in ("token", "appSecret", "secret", "imapPassword", "smtpPassword",
                "bridgeToken", "accessToken", "appToken", "botToken",
                "app_secret", "imap_password", "smtp_password", "bridge_token",
                "access_token", "app_token", "bot_token"):
        if key in raw and raw[key]:
            raw[key] = f"••••{str(raw[key])[-4:]}"
    # Inject weixin login state so the frontend can show QR login button
    if name == "weixin":
        raw["loggedIn"] = _weixin_logged_in()
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
        running_info = status_map.get(name, {})
        result.append(
            ChannelStatus(
                name=name,
                enabled=_ch_enabled(ch_cfg) if ch_cfg is not None else False,
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
        if name == "weixin":
            # weixin may not be in config yet — bootstrap with defaults
            ch_cfg = _weixin_default_config()
        elif name == "wecom":
            # wecom may not be in config yet — bootstrap with defaults
            ch_cfg = _wecom_default_config()
        else:
            # Bootstrap unknown channel with empty dict so it can be patched
            ch_cfg = {}

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
    ch_cfg = getattr(svc.config.channels, name, None)
    running_info = status_map.get(name, {})
    return ChannelStatus(
        name=name,
        enabled=_ch_enabled(ch_cfg) if ch_cfg is not None else False,
        running=running_info.get("running", False),
        config=_channel_config_dict(name, svc),
    )


@router.post("/reload-all", status_code=204)
async def reload_all_channels(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> None:
    await svc.channels.reload_all(svc.config)


# ---------------------------------------------------------------------------
# WeChat QR code login endpoints
# ---------------------------------------------------------------------------

@router.post("/weixin/qr/start", response_model=WeixinQrStartResponse)
async def weixin_qr_start(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],  # noqa: ARG001
) -> WeixinQrStartResponse:
    """Start a WeChat QR code login session.

    Calls the iLink API to obtain a QR code, then returns the qrcode_id
    (used for polling) and a base64-encoded PNG image for display.
    """
    import httpx

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode",
            params={"bot_type": "3"},
            headers=_ilink_headers(),
        )
        resp.raise_for_status()
        data = resp.json()

    qrcode_id: str = data.get("qrcode", "")
    scan_url: str = data.get("qrcode_img_content") or qrcode_id

    if not qrcode_id:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Failed to obtain QR code from WeChat API")

    # Generate QR code PNG with Python qrcode library (installed via [weixin] extra)
    qr_image = ""
    try:
        import qrcode  # type: ignore[import]

        qr = qrcode.QRCode(border=1)
        qr.add_data(scan_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        qr_image = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        pass  # frontend will fall back to displaying scan_url as text

    return WeixinQrStartResponse(qrcode_id=qrcode_id, qr_image=qr_image, scan_url=scan_url)


@router.get("/weixin/qr/status", response_model=WeixinQrStatusResponse)
async def weixin_qr_status(
    qrcode_id: Annotated[str, Query(...)],
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> WeixinQrStatusResponse:
    """Poll WeChat QR code login status.

    On "confirmed": saves token to account.json, enables weixin in config,
    and triggers a channel reload so the channel connects immediately.
    """
    import httpx
    from nanobot.config.loader import save_config

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status",
            params={"qrcode": qrcode_id},
            headers={**_ilink_headers(), "iLink-App-ClientVersion": "1"},
        )
        resp.raise_for_status()
        data = resp.json()

    qr_status: str = data.get("status", "wait")

    if qr_status == "confirmed":
        token: str = data.get("bot_token", "")
        bot_baseurl: str = data.get("baseurl", "https://ilinkai.weixin.qq.com")
        if token:
            # Persist token to account.json (weixin channel reads this on start)
            state_data = {
                "token": token,
                "get_updates_buf": "",
                "base_url": bot_baseurl,
            }
            _weixin_state_file().write_text(json.dumps(state_data, ensure_ascii=False))

            # Enable weixin in nanobot config and persist
            ch_cfg = getattr(svc.config.channels, "weixin", None)
            if ch_cfg is None:
                new_cfg: dict[str, Any] = _weixin_default_config()
            elif isinstance(ch_cfg, dict):
                new_cfg = dict(ch_cfg)
            else:
                new_cfg = ch_cfg.model_dump(by_alias=True)
            new_cfg["enabled"] = True
            setattr(svc.config.channels, "weixin", new_cfg)
            save_config(svc.config)

            # Reload channel so it starts immediately with the new token
            await svc.channels.reload_channel("weixin")

    return WeixinQrStatusResponse(status=qr_status)
