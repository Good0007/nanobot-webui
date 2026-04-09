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
    webui_only: bool = False

    def reload_provider(self) -> None:
        """Hot-swap the LLM provider and all runtime settings on agent and heartbeat."""
        from nanobot.providers.base import GenerationSettings
        d = self.config.agents.defaults
        t = self.config.tools
        new_provider = self.make_provider(self.config)
        if new_provider is not None:
            self.agent.provider = new_provider
            # AgentLoop delegates actual LLM calls to an internal AgentRunner instance;
            # its .provider must also be updated, otherwise the old provider stays in use.
            if hasattr(self.agent, "runner") and self.agent.runner is not None:
                self.agent.runner.provider = new_provider
            # SubagentManager also holds its own provider + AgentRunner references.
            if hasattr(self.agent, "subagents") and self.agent.subagents is not None:
                self.agent.subagents.provider = new_provider
                if hasattr(self.agent.subagents, "runner") and self.agent.subagents.runner is not None:
                    self.agent.subagents.runner.provider = new_provider
            # Dream memory consolidation also holds provider + AgentRunner references.
            if hasattr(self.agent, "dream") and self.agent.dream is not None:
                self.agent.dream.provider = new_provider
                if hasattr(self.agent.dream, "_runner") and self.agent.dream._runner is not None:
                    self.agent.dream._runner.provider = new_provider
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
        # Sync subagents model so new sub-tasks use the updated model.
        if hasattr(self.agent, "subagents") and self.agent.subagents is not None:
            self.agent.subagents.model = d.model
        # Re-register tools so exec/web enable toggles and scalar settings
        # (timeout, sandbox, path_append, restrict_to_workspace) take effect immediately.
        self.agent.exec_config = t.exec
        self.agent.web_config = t.web
        self.agent.restrict_to_workspace = t.restrict_to_workspace
        if hasattr(self.agent, "_register_default_tools"):
            self.agent.tools._tools.clear()
            self.agent._register_default_tools()


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
