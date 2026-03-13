"""Entry point: ``python -m webui``

Starts nanobot gateway + FastAPI WebUI in a single asyncio process.
Zero modifications to any nanobot source files.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from webui.patches import apply_all as _apply_all_patches

_apply_all_patches()



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
