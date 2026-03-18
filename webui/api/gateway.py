"""Service container and API server coroutine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from nanobot.agent.loop import AgentLoop
from nanobot.bus.queue import MessageBus
from nanobot.config.schema import Config
from nanobot.cron.service import CronService
from nanobot.heartbeat.service import HeartbeatService
from nanobot.session.manager import SessionManager

from webui.api.channel_ext import ExtendedChannelManager


@dataclass
class ServiceContainer:
    """All live nanobot services, shared with FastAPI route handlers."""

    config: Config
    bus: MessageBus
    agent: AgentLoop
    channels: ExtendedChannelManager
    session_manager: SessionManager
    cron: CronService
    heartbeat: HeartbeatService
    make_provider: Callable = field(default=lambda cfg: None)

    def reload_provider(self) -> None:
        """Hot-swap the LLM provider and all runtime settings on agent and heartbeat."""
        from nanobot.providers.base import GenerationSettings
        d = self.config.agents.defaults
        new_provider = self.make_provider(self.config)
        if new_provider is not None:
            self.agent.provider = new_provider
            self.heartbeat.provider = new_provider
        # Always sync model and other mutable settings
        self.agent.model = d.model
        self.agent.max_iterations = d.max_tool_iterations
        self.agent.context_window_tokens = d.context_window_tokens
        gen = GenerationSettings(
            temperature=d.temperature,
            max_tokens=d.max_tokens,
            reasoning_effort=d.reasoning_effort,
        )
        self.agent.provider.generation = gen
        self.heartbeat.provider.generation = gen


async def start_api_server(
    container: ServiceContainer,
    host: str = "0.0.0.0",
    port: int = 8080,
) -> None:
    """Start the FastAPI / uvicorn server as an asyncio coroutine.

    Designed to run inside ``asyncio.gather()`` alongside the nanobot
    channel tasks so everything shares the same event loop.
    """
    import uvicorn

    from webui.api.server import create_app

    app = create_app(container)
    server_cfg = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(server_cfg)
    await server.serve()
