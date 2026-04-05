"""[Channel] patches — relax access-control restrictions managed by the WebUI."""

from __future__ import annotations


def apply() -> None:
    """Patch 1: BaseChannel.is_allowed  — empty allow_from list → allow all (same as ["*"]).
    Patch 2: ChannelManager._validate_allow_from — no-op; WebUI manages this via UI.
    Patch 3: DingTalkChannel.send() — rich card title for SubAgent results.
    Patch 4: FeishuChannel.send() — indigo header card for SubAgent results.
    Patch 5: Telegram polling conflict — stop channel cleanly on duplicate getUpdates.

    Note: The old Patch 3 (_dispatch_outbound override) has been removed.
    nanobot v0.1.4.post6 ships its own _dispatch_outbound with streaming delta
    coalescing, per-send retry, and the same _tool_hint / send_tool_hints /
    send_progress logic our patch used to add manually.
    """
    import asyncio
    import json

    from loguru import logger
    from nanobot.channels import base as _base
    from nanobot.channels import manager as _manager

    # ── Patch 1 & 2: access control ──────────────────────────────────────────

    def _is_allowed_patched(self, sender_id: str) -> bool:
        allow_list = getattr(self.config, "allow_from", [])
        if not allow_list or "*" in allow_list:
            return True
        return str(sender_id) in allow_list

    _base.BaseChannel.is_allowed = _is_allowed_patched  # type: ignore[method-assign]
    _manager.ChannelManager._validate_allow_from = lambda self: None  # type: ignore[method-assign]

    # ── Patch 3: DingTalk — rich card title for SubAgent results ─────────────

    try:
        from nanobot.channels.dingtalk import DingTalkChannel
        _original_dt_send = DingTalkChannel.send

        async def _dingtalk_send_patched(self, msg) -> None:  # type: ignore[override]
            if msg.metadata.get("_subagent_result") and msg.content and msg.content.strip():
                token = await self._get_access_token()
                if token:
                    status_icon = "✅" if "✅" in msg.content else "❌"
                    title = f"{status_icon} SubAgent Task Complete"
                    await self._send_batch_message(
                        token,
                        msg.chat_id,
                        "sampleMarkdown",
                        {"text": msg.content.strip(), "title": title},
                    )
                    for media_ref in msg.media or []:
                        await self._send_media_ref(token, msg.chat_id, media_ref)
                return
            await _original_dt_send(self, msg)

        DingTalkChannel.send = _dingtalk_send_patched  # type: ignore[method-assign]
        logger.debug("DingTalkChannel.send patched for SubAgent cards")
    except ImportError:
        pass

    # ── Patch 5: Feishu — indigo header card for SubAgent results ────────────

    try:
        from nanobot.channels.feishu import FeishuChannel
        _original_fs_send = FeishuChannel.send

        async def _feishu_send_patched(self, msg) -> None:  # type: ignore[override]
            if msg.metadata.get("_subagent_result") and msg.content and msg.content.strip():
                if not self._client:
                    logger.warning("Feishu client not initialized")
                    return
                try:
                    loop = asyncio.get_running_loop()
                    receive_id_type = "chat_id" if msg.chat_id.startswith("oc_") else "open_id"
                    status_ok = "✅" in msg.content
                    header_text = "SubAgent Task Complete" if status_ok else "SubAgent Task Failed"
                    elements = self._build_card_elements(msg.content)
                    for chunk in self._split_elements_by_table_limit(elements):
                        card = {
                            "config": {"wide_screen_mode": True},
                            "header": {
                                "title": {"tag": "plain_text", "content": header_text},
                                "template": "indigo" if status_ok else "red",
                            },
                            "elements": chunk,
                        }
                        await loop.run_in_executor(
                            None, self._send_message_sync,
                            receive_id_type, msg.chat_id, "interactive",
                            json.dumps(card, ensure_ascii=False),
                        )
                    return
                except Exception as e:
                    logger.error("Feishu SubAgent card send failed: {}", e)
            await _original_fs_send(self, msg)

        FeishuChannel.send = _feishu_send_patched  # type: ignore[method-assign]
        logger.debug("FeishuChannel.send patched for SubAgent cards")
    except ImportError:
        pass

    # ── Patch 6: Telegram — stop cleanly on polling Conflict ─────────────────

    try:
        from telegram.error import Conflict
        from telegram.ext import Updater
        from nanobot.channels.telegram import TelegramChannel

        if not getattr(TelegramChannel, "_webui_conflict_patch_applied", False):
            _active_tg_channel = None
            _original_tg_start = TelegramChannel.start
            _original_updater_start_polling = Updater.start_polling

            def _stop_channel_on_conflict(channel: TelegramChannel) -> None:
                if getattr(channel, "_stopping_due_to_conflict", False):
                    return
                setattr(channel, "_stopping_due_to_conflict", True)
                logger.error(
                    "Telegram polling conflict: another bot instance is using this token. "
                    "Stopping Telegram channel in this process."
                )
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(channel.stop())
                except RuntimeError:
                    channel._running = False  # type: ignore[attr-defined]

            async def _updater_start_polling_patched(self, *args, **kwargs):
                if "error_callback" not in kwargs and _active_tg_channel is not None:
                    channel = _active_tg_channel

                    def _error_callback(error):
                        if isinstance(error, Conflict):
                            _stop_channel_on_conflict(channel)

                    kwargs["error_callback"] = _error_callback
                return await _original_updater_start_polling(self, *args, **kwargs)

            async def _telegram_start_patched(self):
                nonlocal _active_tg_channel
                setattr(self, "_stopping_due_to_conflict", False)
                _active_tg_channel = self
                try:
                    return await _original_tg_start(self)
                finally:
                    if _active_tg_channel is self:
                        _active_tg_channel = None

            Updater.start_polling = _updater_start_polling_patched  # type: ignore[method-assign]
            TelegramChannel.start = _telegram_start_patched  # type: ignore[method-assign]
            setattr(TelegramChannel, "_webui_conflict_patch_applied", True)
            logger.debug("Telegram polling conflict patch applied")
    except ImportError:
        pass
