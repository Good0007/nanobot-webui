"""[MCPDynamic] patch — per-server AsyncExitStack for dynamic MCP load/unload.

Replaces the single shared _mcp_stack with a per-server dict so individual
servers can be connected/disconnected without tearing down the entire agent.

New method added to AgentLoop:
    async toggle_mcp_server(name, cfg, enabled) -> None
"""

from __future__ import annotations


def apply() -> None:
    import asyncio
    import inspect
    from contextlib import AsyncExitStack

    from nanobot.agent.loop import AgentLoop
    from nanobot.agent.tools.mcp import connect_mcp_servers

    _connect_uses_stack = len(inspect.signature(connect_mcp_servers).parameters) >= 3

    async def _connect_subset(servers: dict, registry):
        """Compatibility shim for nanobot MCP connector signature changes."""
        if not _connect_uses_stack:
            return await connect_mcp_servers(servers, registry)

        # Legacy signature: connect_mcp_servers(servers, registry, stack)
        connected: dict[str, AsyncExitStack] = {}
        for name, cfg in servers.items():
            stack = AsyncExitStack()
            await stack.__aenter__()
            try:
                await connect_mcp_servers({name: cfg}, registry, stack)
                connected[name] = stack
            except Exception:
                try:
                    await stack.aclose()
                except Exception:
                    pass
                raise
        return connected

    # ------------------------------------------------------------------
    # _connect_mcp: connect each enabled server into its own stack
    # ------------------------------------------------------------------
    async def _connect_mcp_patched(self) -> None:
        from webui.utils.webui_config import is_mcp_server_enabled

        if self._mcp_connected or self._mcp_connecting or not self._mcp_servers:
            return
        self._mcp_connecting = True
        try:
            for name, cfg in self._mcp_servers.items():
                if not is_mcp_server_enabled(name):
                    continue
                if name in self._mcp_stacks:
                    continue  # already connected
                try:
                    self._mcp_stacks.update(await _connect_subset({name: cfg}, self.tools))
                except Exception:
                    continue
            self._mcp_connected = True
        finally:
            self._mcp_connecting = False

    # ------------------------------------------------------------------
    # close_mcp: close all per-server stacks
    # ------------------------------------------------------------------
    async def _close_mcp_patched(self) -> None:
        if self._background_tasks:
            await asyncio.gather(*self._background_tasks, return_exceptions=True)
            self._background_tasks.clear()
        for stack in list(self._mcp_stacks.values()):
            try:
                await stack.aclose()
            except (RuntimeError, BaseExceptionGroup):
                pass
        self._mcp_stacks.clear()
        self._mcp_connected = False

    # ------------------------------------------------------------------
    # toggle_mcp_server: load or unload a single server at runtime
    # ------------------------------------------------------------------
    async def _toggle_mcp_server(self, name: str, cfg, enabled: bool) -> None:
        """Load or unload a single MCP server's tools without touching others."""
        prefix = f"mcp_{name}_"

        if not enabled:
            # Unregister all tools for this server from the registry
            to_remove = [k for k in self.tools._tools if k.startswith(prefix)]
            for k in to_remove:
                self.tools.unregister(k)
            # Close and discard the server's stack
            stack = self._mcp_stacks.pop(name, None)
            if stack:
                try:
                    await stack.aclose()
                except (RuntimeError, BaseExceptionGroup):
                    pass
        else:
            # Don't double-connect
            if name in self._mcp_stacks:
                return
            try:
                self._mcp_stacks.update(await _connect_subset({name: cfg}, self.tools))
            except Exception:
                raise

    AgentLoop._connect_mcp = _connect_mcp_patched  # type: ignore[method-assign]
    AgentLoop.close_mcp = _close_mcp_patched  # type: ignore[method-assign]
    AgentLoop.toggle_mcp_server = _toggle_mcp_server  # type: ignore[attr-defined]
