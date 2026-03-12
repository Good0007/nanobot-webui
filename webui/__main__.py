"""Entry point: ``python -m webui``

Starts nanobot gateway + FastAPI WebUI in a single asyncio process.
Zero modifications to any nanobot source files.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path


def _apply_patches() -> None:
    """Monkey-patch nanobot behaviours that the webui overrides.

    Rules:
    - Empty allow_from → allow all (webui manages access via the UI;
      blocking startup on an empty list is too aggressive for a GUI tool).
    - The startup ValidationError in ChannelManager is suppressed the same way.
    """
    from nanobot.channels import base as _base
    from nanobot.channels import manager as _manager

    # Patch 1: is_allowed — treat empty list as "allow all" (same as ["*"])
    def _is_allowed_patched(self, sender_id: str) -> bool:
        allow_list = getattr(self.config, "allow_from", [])
        if not allow_list or "*" in allow_list:
            return True
        return str(sender_id) in allow_list

    _base.BaseChannel.is_allowed = _is_allowed_patched  # type: ignore[method-assign]

    # Patch 2: _validate_allow_from — no-op (webui users configure via UI)
    _manager.ChannelManager._validate_allow_from = lambda self: None  # type: ignore[method-assign]

    # Patch 3: SessionManager.delete — remove session from disk and cache
    from nanobot.session import manager as _session_manager

    def _session_delete(self, key: str) -> None:
        self._cache.pop(key, None)
        path = self._get_session_path(key)
        if path.exists():
            path.unlink()

    _session_manager.SessionManager.delete = _session_delete  # type: ignore[attr-defined]

    # Patch 4: Auto-retry with Responses API when /v1/chat/completions is rejected.
    # OpenAI new models (gpt-5.x etc.) require /v1/responses instead of /v1/chat/completions.
    # We detect the error on the first call and transparently switch, then cache the decision so
    # all subsequent calls for this api_base go directly to the right endpoint.
    _patch_responses_api_fallback()


def _patch_responses_api_fallback() -> None:
    """Monkey-patch CustomProvider and LiteLLMProvider to auto-fall-back to Responses API."""
    import json
    import uuid
    import httpx
    from nanobot.providers.custom_provider import CustomProvider
    from nanobot.providers.litellm_provider import LiteLLMProvider
    from nanobot.providers.base import LLMResponse, ToolCallRequest

    # Per-process cache: set of api_base strings confirmed to need Responses API.
    _responses_api_bases: set[str] = set()
    _LEGACY_MARKERS = ("unsupported legacy protocol", "/v1/chat/completions is not supported")

    async def _call_responses_api(
        provider,
        messages: list,
        tools: list | None,
        model: str | None,
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        """Call OpenAI Responses API (/v1/responses) and return an LLMResponse."""
        target_model = model or getattr(provider, "default_model", "")
        base = (provider.api_base or "https://api.openai.com").rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]
        target_url = f"{base}/v1/responses"

        # --- Convert messages ---
        system_parts: list[str] = []
        input_items: list[dict] = []
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content")
            if role == "system":
                text = content if isinstance(content, str) else " ".join(
                    b.get("text", "") for b in (content or []) if isinstance(b, dict)
                )
                if text:
                    system_parts.append(text)
            elif role == "tool":
                output_str = content if isinstance(content, str) else json.dumps(content or "")
                input_items.append({
                    "type": "function_call_output",
                    "call_id": msg.get("tool_call_id", ""),
                    "output": output_str or "(empty)",
                })
            elif role == "assistant":
                tcs = msg.get("tool_calls") or []
                if tcs:
                    if content:
                        input_items.append({"role": "assistant", "content": content})
                    for tc in tcs:
                        fn = tc.get("function", {})
                        input_items.append({
                            "type": "function_call",
                            "call_id": tc.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                            "name": fn.get("name", ""),
                            "arguments": fn.get("arguments", "{}"),
                        })
                elif content is not None:
                    input_items.append({"role": "assistant", "content": content or "(empty)"})
            else:
                input_items.append({"role": role, "content": content})

        # Drop items with null/empty content to avoid 400 validation errors.
        # assistant entries that only contain tool_calls have no content field, keep those.
        def _is_valid_item(item: dict) -> bool:
            itype = item.get("type")
            if itype in ("function_call", "function_call_output"):
                return True
            content = item.get("content")
            return content not in (None, "", [])

        input_items = [it for it in input_items if _is_valid_item(it)]

        body: dict = {
            "model": target_model,
            "input": input_items,
            "max_output_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        if system_parts:
            body["instructions"] = "\n\n".join(system_parts)
        if tools:
            converted_tools = []
            for t in tools:
                if t.get("type") == "function":
                    fn = t.get("function", {})
                    converted_tools.append({
                        "type": "function",
                        "name": fn.get("name", ""),
                        "description": fn.get("description", ""),
                        "parameters": fn.get("parameters", {}),
                    })
                else:
                    converted_tools.append(t)
            body["tools"] = converted_tools
            body["tool_choice"] = "auto"

        from loguru import logger as _logger

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    target_url,
                    json=body,
                    headers={
                        "Authorization": f"Bearer {provider.api_key or 'no-key'}",
                        "Content-Type": "application/json",
                    },
                )
                if not resp.is_success:
                    # Include the actual API error body so users can see what went wrong.
                    try:
                        err_detail = resp.json()
                    except Exception:
                        err_detail = resp.text
                    _logger.error("Responses API error {}: {}", resp.status_code, err_detail)
                    return LLMResponse(
                        content=f"Error calling Responses API ({resp.status_code}): {err_detail}",
                        finish_reason="error",
                    )
                data = resp.json()
        except Exception as exc:
            return LLMResponse(content=f"Error calling Responses API: {exc}", finish_reason="error")

        # --- Parse response ---
        output_items = data.get("output", [])
        content_text: str | None = None
        parsed_tool_calls: list[ToolCallRequest] = []
        finish_reason = "stop"
        for item in output_items:
            itype = item.get("type")
            if itype == "message":
                raw = item.get("content", [])
                if isinstance(raw, list):
                    content_text = "".join(
                        c.get("text", "")
                        for c in raw
                        if isinstance(c, dict) and c.get("type") in ("text", "output_text")
                    ) or None
                elif isinstance(raw, str):
                    content_text = raw or None
            elif itype == "function_call":
                finish_reason = "tool_calls"
                args = item.get("arguments", "{}")
                parsed_tool_calls.append(ToolCallRequest(
                    id=item.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                    name=item.get("name", ""),
                    arguments=json.loads(args) if isinstance(args, str) else args,
                ))

        usage = data.get("usage", {})
        return LLMResponse(
            content=content_text,
            tool_calls=parsed_tool_calls,
            finish_reason=finish_reason,
            usage={
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            },
        )

    def _make_patched_chat(original_chat):
        async def _patched_chat(self, messages, tools=None, model=None,
                                max_tokens=4096, temperature=0.7, reasoning_effort=None):
            # Fast path: already confirmed this base needs Responses API.
            if self.api_base in _responses_api_bases:
                return await _call_responses_api(self, messages, tools, model, max_tokens, temperature)

            result: LLMResponse = await original_chat(
                self, messages, tools, model, max_tokens, temperature, reasoning_effort
            )

            # Detect legacy-protocol rejection and auto-switch.
            if (result.finish_reason == "error" and result.content and
                    any(m in result.content.lower() for m in _LEGACY_MARKERS)):
                _responses_api_bases.add(self.api_base)
                return await _call_responses_api(self, messages, tools, model, max_tokens, temperature)

            return result
        return _patched_chat

    CustomProvider.chat = _make_patched_chat(CustomProvider.chat)      # type: ignore[method-assign]
    LiteLLMProvider.chat = _make_patched_chat(LiteLLMProvider.chat)    # type: ignore[method-assign]


_apply_patches()



def _make_provider(config):
    """Replicate nanobot's _make_provider logic without importing the private helper."""
    from nanobot.providers.registry import find_by_name

    model: str = config.agents.defaults.model
    provider_name: str = config.get_provider_name(model)
    p = config.get_provider(model)

    if provider_name == "openai_codex" or model.startswith("openai-codex/"):
        from nanobot.providers.openai_codex_provider import OpenAICodexProvider
        return OpenAICodexProvider(default_model=model)

    if provider_name == "custom":
        from nanobot.providers.custom_provider import CustomProvider
        return CustomProvider(
            api_key=p.api_key if p else "no-key",
            api_base=config.get_api_base(model) or "http://localhost:8000/v1",
            default_model=model,
        )

    if provider_name == "azure_openai":
        from nanobot.providers.azure_openai_provider import AzureOpenAIProvider
        if not p or not p.api_key or not p.api_base:
            print(
                "Warning: Azure OpenAI requires api_key and api_base. "
                "Set them in Settings → Providers.",
                file=sys.stderr,
            )
        else:
            return AzureOpenAIProvider(
                api_key=p.api_key,
                api_base=p.api_base,
                default_model=model,
            )

    from nanobot.providers.litellm_provider import LiteLLMProvider
    spec = find_by_name(provider_name)
    if not model.startswith("bedrock/") and not (p and p.api_key) and not (spec and spec.is_oauth):
        print(
            "Warning: No API key configured. "
            "Start the WebUI and set one in Settings → Providers.",
            file=sys.stderr,
        )

    return LiteLLMProvider(
        api_key=p.api_key if p else None,
        api_base=config.get_api_base(model),
        default_model=model,
        extra_headers=p.extra_headers if p else None,
        provider_name=provider_name,
    )


async def main(
    web_port: int = 8080,
    gateway_port: int | None = None,
    web_host: str = "0.0.0.0",
    workspace: str | None = None,
) -> None:
    from loguru import logger

    from nanobot.agent.loop import AgentLoop
    from nanobot.bus.queue import MessageBus
    from nanobot.bus.events import OutboundMessage
    from nanobot.config.loader import load_config
    from nanobot.config.paths import get_cron_dir
    from nanobot.cron.service import CronService
    from nanobot.cron.types import CronJob
    from nanobot.heartbeat.service import HeartbeatService
    from nanobot.session.manager import SessionManager
    from nanobot.utils.helpers import sync_workspace_templates

    from webui.api.channel_ext import ExtendedChannelManager
    from webui.api.gateway import ServiceContainer, start_api_server

    config = load_config()
    if workspace:
        config.agents.defaults.workspace = workspace
    if gateway_port is not None:
        config.gateway.port = gateway_port
    sync_workspace_templates(config.workspace_path)

    bus = MessageBus()
    provider = _make_provider(config)
    session_manager = SessionManager(config.workspace_path)

    cron_store_path = get_cron_dir() / "jobs.json"
    cron = CronService(cron_store_path)

    agent = AgentLoop(
        bus=bus,
        provider=provider,
        workspace=config.workspace_path,
        model=config.agents.defaults.model,
        temperature=config.agents.defaults.temperature,
        max_tokens=config.agents.defaults.max_tokens,
        max_iterations=config.agents.defaults.max_tool_iterations,
        memory_window=config.agents.defaults.memory_window,
        reasoning_effort=config.agents.defaults.reasoning_effort,
        brave_api_key=config.tools.web.search.api_key or None,
        web_proxy=config.tools.web.proxy or None,
        exec_config=config.tools.exec,
        cron_service=cron,
        restrict_to_workspace=config.tools.restrict_to_workspace,
        session_manager=session_manager,
        mcp_servers=config.tools.mcp_servers,
        channels_config=config.channels,
    )

    # ------------------------------------------------------------------ cron
    async def on_cron_job(job: CronJob) -> str | None:
        from nanobot.agent.tools.cron import CronTool
        from nanobot.agent.tools.message import MessageTool

        reminder_note = (
            "[Scheduled Task] Timer finished.\n\n"
            f"Task '{job.name}' has been triggered.\n"
            f"Scheduled instruction: {job.payload.message}"
        )
        cron_tool = agent.tools.get("cron")
        cron_token = None
        if isinstance(cron_tool, CronTool):
            cron_token = cron_tool.set_cron_context(True)
        try:
            response = await agent.process_direct(
                reminder_note,
                session_key=f"cron:{job.id}",
                channel=job.payload.channel or "cli",
                chat_id=job.payload.to or "direct",
            )
        finally:
            if isinstance(cron_tool, CronTool) and cron_token is not None:
                cron_tool.reset_cron_context(cron_token)

        message_tool = agent.tools.get("message")
        if isinstance(message_tool, MessageTool) and message_tool._sent_in_turn:
            return response

        if job.payload.deliver and job.payload.to and response:
            await bus.publish_outbound(OutboundMessage(
                channel=job.payload.channel or "cli",
                chat_id=job.payload.to,
                content=response,
            ))
        return response

    cron.on_job = on_cron_job

    # --------------------------------------------------------------- channels
    channels = ExtendedChannelManager(config, bus)

    def _pick_heartbeat_target() -> tuple[str, str]:
        enabled = set(channels.enabled_channels)
        for item in session_manager.list_sessions():
            key = item.get("key") or ""
            if ":" not in key:
                continue
            channel, chat_id = key.split(":", 1)
            if channel in {"cli", "system", "web"}:
                continue
            if channel in enabled and chat_id:
                return channel, chat_id
        return "cli", "direct"

    # ------------------------------------------------------------- heartbeat
    async def on_heartbeat_execute(tasks: str) -> str:
        channel, chat_id = _pick_heartbeat_target()

        async def _silent(*_args: object, **_kwargs: object) -> None:
            pass

        return await agent.process_direct(
            tasks,
            session_key="heartbeat",
            channel=channel,
            chat_id=chat_id,
            on_progress=_silent,
        )

    async def on_heartbeat_notify(response: str) -> None:
        channel, chat_id = _pick_heartbeat_target()
        if channel == "cli":
            return
        await bus.publish_outbound(OutboundMessage(channel=channel, chat_id=chat_id, content=response))

    hb_cfg = config.gateway.heartbeat
    heartbeat = HeartbeatService(
        workspace=config.workspace_path,
        provider=provider,
        model=agent.model,
        on_execute=on_heartbeat_execute,
        on_notify=on_heartbeat_notify,
        interval_s=hb_cfg.interval_s,
        enabled=hb_cfg.enabled,
    )

    container = ServiceContainer(
        config=config,
        bus=bus,
        agent=agent,
        channels=channels,
        session_manager=session_manager,
        cron=cron,
        heartbeat=heartbeat,
        make_provider=_make_provider,
    )

    if channels.enabled_channels:
        logger.info("Channels enabled: {}", ", ".join(channels.enabled_channels))
    else:
        logger.warning("No IM channels enabled")

    logger.info("Starting nanobot webui on http://{}:{}", web_host, web_port)

    async def run() -> None:
        try:
            await cron.start()
            await heartbeat.start()
            await asyncio.gather(
                agent.run(),
                channels.start_all(),
                start_api_server(container, host=web_host, port=web_port),
            )
        except KeyboardInterrupt:
            logger.info("Shutting down…")
        finally:
            await agent.close_mcp()
            heartbeat.stop()
            cron.stop()
            agent.stop()
            await channels.stop_all()

    await run()


def main_cli() -> None:
    """Entry point for the ``nanobot-webui`` console script."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="nanobot-webui",
        description="nanobot WebUI — start WebUI + gateway in one process",
    )
    parser.add_argument("--port", type=int, default=8080, help="WebUI port (default: 8080)")
    parser.add_argument("--gateway-port", type=int, default=None, dest="gateway_port",
                        help="nanobot gateway port (default: from config)")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    parser.add_argument("--workspace", default=None, help="Override workspace directory")
    parser.add_argument("--config", default=None, dest="config_path",
                        help="Path to config file")
    parser.add_argument("--daemon", "-d", action="store_true", default=False,
                        help="Run in the background (PID → ~/.nanobot/webui.pid)")
    args = parser.parse_args()

    if args.daemon:
        from webui.cli import _start_daemon
        _start_daemon(
            port=args.port,
            gateway_port=args.gateway_port,
            host=args.host,
            workspace=args.workspace,
            config_path=args.config_path,
            no_gateway=False,
        )
        return

    if args.config_path:
        from nanobot.config.loader import set_config_path
        set_config_path(Path(args.config_path).expanduser().resolve())

    asyncio.run(main(
        web_port=args.port,
        gateway_port=args.gateway_port,
        web_host=args.host,
        workspace=args.workspace,
    ))


if __name__ == "__main__":
    main_cli()
