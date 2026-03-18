"""[SubAgent] patches — push SubAgent tool-call progress to WebUI / external channels.

Strategy
────────
SubagentManager._run_subagent() runs as a background asyncio.Task with no link
back to any WebSocket or on_progress callback.

Two patches are applied:

1. _run_subagent → emit progress before every tool call:
   • channel == "web"   → _progress_registry[chat_key](text, tool_hint=True)
                          ws.py sends WS frame {type: "subagent_progress", ...}
   • channel != "web"   → bus.publish_outbound(_progress=True, _tool_hint=True)
                          ChannelManager forwards to Telegram / DingTalk / etc.

2. _announce_result (final SubAgent result):
   • channel == "web"   → _announce_registry[chat_key](result_text)
                          ws.py sends WS frame {type: "done", ...}  (new bubble)
                          *** skips bus.publish_inbound to avoid Unknown channel:web ***
   • channel != "web"   → original behaviour (bus → main agent → channel.send)

Public API (used by webui/api/routes/ws.py)
───────────────────────────────────────────
  register_progress(chat_key, callback)   — SubAgent tool-hint stream
  unregister_progress(chat_key)
  register_announce(chat_key, callback)   — SubAgent final result
  unregister_announce(chat_key)
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from loguru import logger

# chat_key ("web:{user_id}") → callback(text, *, tool_hint=True)
_progress_registry: dict[str, Callable[..., Awaitable[None]]] = {}

# chat_key ("web:{user_id}") → callback(result_text: str)
_announce_registry: dict[str, Callable[[str], Awaitable[None]]] = {}

# chat_key ("web:{user_id}") → callback(all_messages: list)
# Called with the full SubAgent messages list (including tool_calls + results + final
# assistant message) so ws.py can persist them via AgentLoop._save_turn.
_save_turn_registry: dict[str, Callable[[list], Awaitable[None]]] = {}


def register_progress(chat_key: str, callback: Callable[..., Awaitable[None]]) -> None:
    """Register a SubAgent tool-hint progress callback for the given chat key."""
    _progress_registry[chat_key] = callback


def unregister_progress(chat_key: str) -> None:
    _progress_registry.pop(chat_key, None)


def register_announce(chat_key: str, callback: Callable[[str], Awaitable[None]]) -> None:
    """Register a callback to receive the SubAgent's final result for the given chat key."""
    _announce_registry[chat_key] = callback


def unregister_announce(chat_key: str) -> None:
    _announce_registry.pop(chat_key, None)


def register_save_turn(chat_key: str, callback: Callable[[list], Awaitable[None]]) -> None:
    """Register a callback to persist the SubAgent's full messages list to the session."""
    _save_turn_registry[chat_key] = callback


def unregister_save_turn(chat_key: str) -> None:
    _save_turn_registry.pop(chat_key, None)


async def _save_sub_tool_to_session(
    subagent_mgr: Any,
    session_key: str,
    messages: list,
) -> None:
    """Save SubAgent tool-call chain to session as sub_tool messages.

    Used for non-web channels (Feishu, Telegram, etc.) where no WebSocket
    callback is registered.  Requires _session_manager to be injected onto
    the SubagentManager instance by the AgentLoop patch below.
    """
    from datetime import datetime

    session_mgr = getattr(subagent_mgr, "_session_manager", None)
    if session_mgr is None:
        return
    try:
        _TRUNCATE = 500
        session = session_mgr.get_or_create(session_key)
        session.messages.append({
            "role": "system",
            "content": "[Background task progress]",
            "timestamp": datetime.now().isoformat(),
        })
        now = datetime.now().isoformat()
        for m in messages[2:]:  # skip SubAgent system prompt + user task
            role = m.get("role", "")
            content = m.get("content") or ""
            if role == "assistant" and m.get("tool_calls"):
                session.messages.append({
                    "role": "sub_tool",
                    "content": content,
                    "tool_calls": m["tool_calls"],
                    "timestamp": now,
                })
            elif role == "tool":
                if isinstance(content, str) and len(content) > _TRUNCATE:
                    content = content[:_TRUNCATE] + "\n... (truncated)"
                session.messages.append({
                    "role": "sub_tool",
                    "content": content,
                    "tool_call_id": m.get("tool_call_id", ""),
                    "name": m.get("name", ""),
                    "timestamp": now,
                })
            elif role == "assistant":
                if not content:
                    continue
                session.messages.append({
                    "role": "assistant",
                    "content": content,
                    "timestamp": now,
                })
        session.updated_at = datetime.now()
        session_mgr.save(session)
        logger.debug("SubAgent sub_tool messages saved to session {}", session_key)
    except Exception as exc:
        logger.warning("Failed to save SubAgent messages to session {}: {}", session_key, exc)


def apply() -> None:
    """Monkey-patch SubagentManager._run_subagent to emit progress events."""
    from nanobot.agent.subagent import SubagentManager
    from nanobot.bus.events import OutboundMessage

    async def _run_subagent_patched(
        self: SubagentManager,
        task_id: str,
        task: str,
        label: str,
        origin: dict[str, str],
    ) -> None:
        """Augmented _run_subagent: identical logic + progress push per tool call."""
        channel = origin.get("channel", "")
        chat_id = str(origin.get("chat_id", ""))
        chat_key = f"{channel}:{chat_id}"

        async def _emit_progress(hint: str) -> None:
            """Push a tool-hint progress event via the appropriate path."""
            text = f"[↳ {label}] {hint}"
            if channel == "web":
                cb = _progress_registry.get(chat_key)
                if cb:
                    try:
                        await cb(text, tool_hint=True)
                    except Exception:
                        pass
            else:
                try:
                    await self.bus.publish_outbound(OutboundMessage(
                        channel=channel,
                        chat_id=chat_id,
                        content=text,
                        metadata={"_progress": True, "_tool_hint": True, "_subagent_hint": True},
                    ))
                except Exception:
                    pass

        logger.info("Subagent [{}] starting task: {}", task_id, label)

        try:
            from nanobot.agent.skills import BUILTIN_SKILLS_DIR
            from nanobot.agent.tools.filesystem import (
                EditFileTool, ListDirTool, ReadFileTool, WriteFileTool,
            )
            from nanobot.agent.tools.registry import ToolRegistry
            from nanobot.agent.tools.shell import ExecTool
            from nanobot.agent.tools.web import WebFetchTool, WebSearchTool

            tools = ToolRegistry()
            allowed_dir = self.workspace if self.restrict_to_workspace else None
            extra_read = [BUILTIN_SKILLS_DIR] if allowed_dir else None
            tools.register(ReadFileTool(workspace=self.workspace, allowed_dir=allowed_dir, extra_allowed_dirs=extra_read))
            tools.register(WriteFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(EditFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(ListDirTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(ExecTool(
                working_dir=str(self.workspace),
                timeout=self.exec_config.timeout,
                restrict_to_workspace=self.restrict_to_workspace,
                path_append=self.exec_config.path_append,
            ))
            tools.register(WebSearchTool(config=self.web_search_config, proxy=self.web_proxy))
            tools.register(WebFetchTool(proxy=self.web_proxy))

            system_prompt = self._build_subagent_prompt()
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": task},
            ]

            max_iterations = 15
            iteration = 0
            final_result: str | None = None

            while iteration < max_iterations:
                iteration += 1

                response = await self.provider.chat_with_retry(
                    messages=messages,
                    tools=tools.get_definitions(),
                    model=self.model,
                )

                if response.has_tool_calls:
                    # Emit progress hint before executing tools
                    def _tool_hint(tool_calls: list) -> str:
                        def _fmt(tc: Any) -> str:
                            args = (tc.arguments[0] if isinstance(tc.arguments, list) else tc.arguments) or {}
                            val = next(iter(args.values()), None) if isinstance(args, dict) else None
                            if not isinstance(val, str):
                                return tc.name
                            return f'{tc.name}("{val[:40]}…")' if len(val) > 40 else f'{tc.name}("{val}")'
                        return ", ".join(_fmt(tc) for tc in tool_calls)

                    await _emit_progress(_tool_hint(response.tool_calls))

                    tool_call_dicts = [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                            },
                        }
                        for tc in response.tool_calls
                    ]
                    messages.append({
                        "role": "assistant",
                        "content": response.content or "",
                        "tool_calls": tool_call_dicts,
                    })

                    for tool_call in response.tool_calls:
                        args_str = json.dumps(tool_call.arguments, ensure_ascii=False)
                        logger.debug(
                            "Subagent [{}] executing: {} with arguments: {}",
                            task_id, tool_call.name, args_str,
                        )
                        result = await tools.execute(tool_call.name, tool_call.arguments)
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_call.name,
                            "content": result,
                        })
                else:
                    final_result = response.content
                    break

            if final_result is None:
                final_result = "Task completed but no final response was generated."

            # Append the final assistant message so _save_turn captures it in the chain.
            # (SubAgent loop breaks without appending it, unlike the main agent loop.)
            messages.append({"role": "assistant", "content": final_result})

            logger.info("Subagent [{}] completed successfully", task_id)
            # Persist full tool-call sequence to main session before announcing.
            if channel == "web":
                save_cb = _save_turn_registry.get(chat_key)
                if save_cb:
                    try:
                        await save_cb(messages)
                    except Exception:
                        pass
            else:
                await _save_sub_tool_to_session(self, chat_key, messages)
            await self._announce_result(task_id, label, task, final_result, origin, "ok")

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            logger.error("Subagent [{}] failed: {}", task_id, e)
            messages.append({"role": "assistant", "content": error_msg})
            if channel == "web":
                save_cb = _save_turn_registry.get(chat_key)
                if save_cb:
                    try:
                        await save_cb(messages)
                    except Exception:
                        pass
            else:
                await _save_sub_tool_to_session(self, chat_key, messages)
            await self._announce_result(task_id, label, task, error_msg, origin, "error")

    # -----------------------------------------------------------------------
    # Patch 2: _announce_result — for web channel, bypass the bus (which
    # goes through main agent → OutboundMessage(channel="web") → Unknown
    # channel) and push the result directly to the registered callback.
    # -----------------------------------------------------------------------
    _original_announce = SubagentManager._announce_result

    async def _announce_result_patched(
        self: SubagentManager,
        task_id: str,
        label: str,
        task: str,
        result: str,
        origin: dict[str, str],
        status: str,
    ) -> None:
        channel = origin.get("channel", "")
        chat_id = str(origin.get("chat_id", ""))
        chat_key = f"{channel}:{chat_id}"

        if channel == "web":
            cb = _announce_registry.get(chat_key)
            if cb:
                status_icon = "✅" if status == "ok" else "❌"
                content = f"{status_icon} **[{label}]**\n\n{result}"
                try:
                    await cb(content)
                    logger.debug(
                        "Subagent [{}] result pushed directly to WebSocket for {}",
                        task_id, chat_key,
                    )
                    return  # Skip bus path entirely for web channel
                except Exception as exc:
                    logger.warning("Subagent announce to WebSocket failed: {}", exc)
            # Fallback: if no callback registered, use original path (will warn Unknown channel)
            await _original_announce(self, task_id, label, task, result, origin, status)
        else:
            # Non-web channels: publish result directly to channel with _subagent_result metadata
            # so channel patches can render a rich card.
            status_icon = "✅" if status == "ok" else "❌"
            content = f"{status_icon} **SubAgent: {label}**\n\n{result}"
            try:
                await self.bus.publish_outbound(OutboundMessage(
                    channel=channel,
                    chat_id=chat_id,
                    content=content,
                    metadata={"_subagent_result": True},
                ))
            except Exception as exc:
                logger.warning("Subagent result publish to channel failed: {}", exc)
                # Fallback: use original announce path (main agent summarises)
                await _original_announce(self, task_id, label, task, result, origin, status)

    SubagentManager._run_subagent = _run_subagent_patched  # type: ignore[method-assign]
    SubagentManager._announce_result = _announce_result_patched  # type: ignore[method-assign]
    logger.debug("SubagentManager patched: _run_subagent + _announce_result")

    # -----------------------------------------------------------------------
    # Patch 3: AgentLoop.__init__ — inject self.sessions into the SubagentManager
    # so _run_subagent_patched can save sub_tool messages for non-web channels.
    # -----------------------------------------------------------------------
    try:
        from nanobot.agent.loop import AgentLoop
        _original_loop_init = AgentLoop.__init__

        def _agent_loop_init_patched(self, *args, **kwargs) -> None:  # type: ignore[override]
            _original_loop_init(self, *args, **kwargs)
            self.subagents._session_manager = self.sessions  # type: ignore[attr-defined]

        AgentLoop.__init__ = _agent_loop_init_patched  # type: ignore[method-assign]
        logger.debug("AgentLoop.__init__ patched: _session_manager injected into SubagentManager")
    except Exception as exc:
        logger.warning("Failed to patch AgentLoop.__init__: {}", exc)
