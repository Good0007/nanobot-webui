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
    label: str = "SubAgent",
) -> None:
    """Save a brief SubAgent summary to the session (not the full tool chain).

    Stored as ``role: "sub_tool"`` so the WebUI renders them with the
    distinctive indigo SubAgent card instead of a regular user bubble.
    The ``name`` field carries the SubAgent label (e.g. "正方一辩").

    ``sub_tool`` entries are automatically stripped from the LLM history by
    the ``session.py`` ``get_history()`` patch, so they never reach the
    provider and cannot cause "invalid role" 400 errors.
    """
    from datetime import datetime

    session_mgr = getattr(subagent_mgr, "_session_manager", None)
    if session_mgr is None:
        return
    try:
        session = session_mgr.get_or_create(session_key)
        # Extract only the final assistant message as a brief summary.
        final_text = ""
        tools_called: list[str] = []
        for m in messages:
            if m.get("role") == "assistant" and m.get("content"):
                final_text = m["content"]
            if m.get("role") == "tool":
                tools_called.append(m.get("name", "?"))

        summary = f"[SubAgent completed] Tools: {', '.join(tools_called[-6:])}."
        if final_text:
            snippet = final_text[:200] + ("…" if len(final_text) > 200 else "")
            summary += f"\nResult: {snippet}"

        # Save as "sub_tool" role — filtered from LLM history by session patch,
        # but rendered as a SubAgent card in the WebUI.
        session.messages.append({
            "role": "sub_tool",
            "content": summary,
            "name": label,
            "timestamp": datetime.now().isoformat(),
        })
        session.updated_at = datetime.now()
        session_mgr.save(session)
        logger.debug("SubAgent summary saved to session {}", session_key)
    except Exception as exc:
        logger.warning("Failed to save SubAgent summary to session {}: {}", session_key, exc)


def _extract_interaction_log(messages: list) -> str:
    """Extract inter-agent communication from a subagent's message history.

    Looks for:
    - send_to_agent tool calls (outgoing messages)
    - [Message from agent ...] user messages (incoming messages)

    Returns a formatted log string, or "" if no interactions found.
    """
    entries: list[str] = []
    for m in messages:
        role = m.get("role", "")
        content = m.get("content", "")

        # Incoming messages from other agents
        if role == "user" and isinstance(content, str) and content.startswith("[Message from agent "):
            entries.append(f"📨 收到: {content}")

        # Outgoing send_to_agent tool calls
        if role == "assistant" and m.get("tool_calls"):
            for tc in m["tool_calls"]:
                func = tc.get("function", {})
                if func.get("name") == "send_to_agent":
                    try:
                        args = func.get("arguments", "")
                        if isinstance(args, str):
                            import json as _json
                            args = _json.loads(args)
                        msg_content = args.get("content", "")
                        recipient = args.get("recipient", "?")
                        entries.append(f"📤 发送给 {recipient}: {msg_content}")
                    except Exception:
                        entries.append("📤 发送消息 (解析失败)")

    if not entries:
        return ""

    return "**💬 Agent 交流记录：**\n" + "\n".join(entries)


def apply() -> None:
    """Monkey-patch SubagentManager to emit progress events.

    Targets nanobot ≥ 0.1.5 which has:
    - ``_announce_result`` (not ``_announce``)
    - ``_run_subagent(self, task_id, task, label, origin)``
    - ``AgentRunner`` + ``AgentRunSpec`` for the execution loop
    - GlobTool / GrepTool, exec_config.enable / sandbox, web_config.enable
    """
    from nanobot.agent.subagent import SubagentManager
    from nanobot.bus.events import OutboundMessage

    _original_announce_result = SubagentManager._announce_result

    # -----------------------------------------------------------------------
    # Patch 1: _run_subagent — delegate to v0.1.5 AgentRunner with a progress
    # hook that pushes tool-hint events to the WebUI / external channels.
    # -----------------------------------------------------------------------
    async def _run_subagent_patched(
        self: SubagentManager,
        task_id: str,
        task: str,
        label: str,
        origin: dict[str, str],
    ) -> None:
        """Augmented _run_subagent: uses AgentRunner + hook for progress push."""
        from nanobot.agent.hook import AgentHook, AgentHookContext
        from nanobot.agent.runner import AgentRunSpec
        from nanobot.agent.skills import BUILTIN_SKILLS_DIR
        from nanobot.agent.tools.filesystem import EditFileTool, ListDirTool, ReadFileTool, WriteFileTool
        from nanobot.agent.tools.registry import ToolRegistry
        from nanobot.agent.tools.search import GlobTool, GrepTool
        from nanobot.agent.tools.shell import ExecTool
        from nanobot.agent.tools.web import WebFetchTool, WebSearchTool

        channel = origin.get("channel", "")
        chat_id = str(origin.get("chat_id", ""))
        chat_key = f"{channel}:{chat_id}"
        # For cron sessions, origin["session_key"] may differ from chat_key;
        # persist sub-agent messages to the correct session when available.
        save_session_key = origin.get("session_key") or chat_key

        async def _emit_progress(hint: str) -> None:
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

        class _ProgressHook(AgentHook):
            """Emit WebUI/channel progress hints before each tool-call batch."""

            async def before_execute_tools(self_hook, context: AgentHookContext) -> None:
                for tc in context.tool_calls:
                    args = tc.arguments
                    if isinstance(args, list):
                        args = args[0] if args else {}
                    val = next(iter(args.values()), None) if isinstance(args, dict) else None
                    if isinstance(val, str):
                        hint = f'{tc.name}("{val[:40]}…")' if len(val) > 40 else f'{tc.name}("{val}")'
                    else:
                        hint = tc.name
                    await _emit_progress(hint)
                    # Extra progress for inter-agent messages
                    if tc.name == "send_to_agent" and isinstance(args, dict):
                        recip = args.get("recipient", "?")
                        msg_content = args.get("content", "")
                        await _emit_progress(f"📤 向 agent {recip} 发送: {msg_content[:80]}")

        logger.info("Subagent [{}] starting task: {}", task_id, label)

        try:
            # Build tools — mirrors v0.1.5 _run_subagent exactly
            tools = ToolRegistry()
            allowed_dir = self.workspace if (self.restrict_to_workspace or self.exec_config.sandbox) else None
            extra_read = [BUILTIN_SKILLS_DIR] if allowed_dir else None
            tools.register(ReadFileTool(workspace=self.workspace, allowed_dir=allowed_dir, extra_allowed_dirs=extra_read))
            tools.register(WriteFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(EditFileTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(ListDirTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(GlobTool(workspace=self.workspace, allowed_dir=allowed_dir))
            tools.register(GrepTool(workspace=self.workspace, allowed_dir=allowed_dir))
            if self.exec_config.enable:
                tools.register(ExecTool(
                    working_dir=str(self.workspace),
                    timeout=self.exec_config.timeout,
                    restrict_to_workspace=self.restrict_to_workspace,
                    sandbox=self.exec_config.sandbox,
                    path_append=self.exec_config.path_append,
                ))
            if self.web_config.enable:
                tools.register(WebSearchTool(config=self.web_config.search, proxy=self.web_config.proxy))
                tools.register(WebFetchTool(proxy=self.web_config.proxy))

            system_prompt = self._build_subagent_prompt()
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": task},
            ]

            result = await self.runner.run(AgentRunSpec(
                initial_messages=messages,
                tools=tools,
                model=self.model,
                max_iterations=15,
                max_tool_result_chars=self.max_tool_result_chars,
                hook=_ProgressHook(),
                max_iterations_message="Task completed but no final response was generated.",
                error_message=None,
                fail_on_tool_error=True,
            ))

            # Handle tool_error stop (partial progress)
            if result.stop_reason == "tool_error":
                error_result = self._format_partial_progress(result)
                if channel == "web":
                    save_cb = _save_turn_registry.get(chat_key)
                    if save_cb:
                        try:
                            await save_cb(result.messages)
                        except Exception:
                            pass
                await self._announce_result(task_id, label, task, error_result, origin, "error")
                return

            # Handle generic runner error
            if result.stop_reason == "error":
                error_msg = result.error or "Error: subagent execution failed."
                if channel == "web":
                    save_cb = _save_turn_registry.get(chat_key)
                    if save_cb:
                        try:
                            await save_cb(result.messages)
                        except Exception:
                            pass
                await self._announce_result(task_id, label, task, error_msg, origin, "error")
                return

            final_result = result.final_content or "Task completed but no final response was generated."
            logger.info("Subagent [{}] completed successfully", task_id)

            # Extract inter-agent communication log from full message history
            interaction_log = _extract_interaction_log(result.messages)
            enriched_result = final_result
            if interaction_log:
                enriched_result = f"{interaction_log}\n\n---\n\n**最终输出：**\n{enriched_result}"

            # Persist full message history to WebUI session
            if channel == "web":
                save_cb = _save_turn_registry.get(chat_key)
                if save_cb:
                    try:
                        await save_cb(result.messages)
                    except Exception:
                        pass

            await self._announce_result(task_id, label, task, enriched_result, origin, "ok")

        except Exception as e:
            error_msg = f"Error: {e}"
            logger.error("Subagent [{}] failed: {}", task_id, e)
            await self._announce_result(task_id, label, task, error_msg, origin, "error")

    # -----------------------------------------------------------------------
    # Patch 2: _announce_result — for web channel, bypass the bus (which goes
    # through main agent → OutboundMessage(channel="web") → Unknown channel)
    # and push the result directly to the registered callback.
    # -----------------------------------------------------------------------
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
            # Fallback: if no callback registered, use original path
            await _original_announce_result(self, task_id, label, task, result, origin, status)
        else:
            # Non-web channels: use a custom InboundMessage with _subagent_label
            # metadata so the patched _process_message can save the incoming
            # message as role="sub_tool" instead of role="user".
            from nanobot.bus.events import InboundMessage as _IB

            status_text = "completed successfully" if status == "ok" else "failed"
            content = (
                f"[Subagent '{label}' {status_text}]\n\nTask: {task}\n\n"
                f"Result:\n{result}\n\n"
                "Summarize this naturally for the user. Keep it brief (1-2 sentences). "
                "Do not mention technical details like \"subagent\" or task IDs."
            )
            metadata: dict[str, Any] = {"_subagent_label": label}
            if "session_key" in origin:
                metadata["session_key"] = origin["session_key"]
            msg = _IB(
                channel="system", sender_id="subagent",
                chat_id=f"{origin['channel']}:{origin['chat_id']}",
                content=content,
                metadata=metadata,
            )
            await self.bus.publish_inbound(msg)

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

    # -----------------------------------------------------------------------
    # Patch 4: AgentLoop._process_message — when the incoming message
    # originates from a subagent (sender_id=="subagent" with _subagent_label
    # metadata), retroactively change the persisted "user" message to
    # "sub_tool" after _save_turn runs.  This means:
    #   • The LLM still sees the announcement as role="user" (valid).
    #   • The session JSONL stores it as role="sub_tool" with name=<label>,
    #     so the WebUI renders it as a SubAgent card.
    # -----------------------------------------------------------------------
    try:
        from nanobot.agent.loop import AgentLoop
        _original_process_message = AgentLoop._process_message

        async def _process_message_patched(self, msg, session_key=None, on_progress=None, **kwargs):
            result = await _original_process_message(self, msg, session_key=session_key, on_progress=on_progress, **kwargs)

            # After original _process_message completed (which already called
            # _save_turn + sessions.save), check if this was a subagent announcement.
            subagent_label = (msg.metadata or {}).get("_subagent_label")
            if msg.channel == "system" and msg.sender_id == "subagent" and subagent_label:
                key = (msg.metadata or {}).get("session_key") or ""
                if not key:
                    if ":" in msg.chat_id:
                        key = msg.chat_id.split(":", 1)[0] + ":" + msg.chat_id.split(":", 1)[1]
                    else:
                        key = f"cli:{msg.chat_id}"
                try:
                    session = self.sessions.get_or_create(key)
                    # Walk backwards through session.messages to find the user
                    # message that contains the subagent announcement content.
                    announce_prefix = f"[Subagent '{subagent_label}'"
                    for m in reversed(session.messages):
                        content = m.get("content", "")
                        if isinstance(content, str) and m.get("role") == "user" and content.startswith(announce_prefix):
                            m["role"] = "sub_tool"
                            m["name"] = subagent_label
                            break
                    self.sessions.save(session)
                except Exception as exc:
                    logger.warning("Failed to reclassify subagent message in session: {}", exc)

            return result

        AgentLoop._process_message = _process_message_patched  # type: ignore[method-assign]
        logger.debug("AgentLoop._process_message patched: subagent messages reclassified as sub_tool")
    except Exception as exc:
        logger.warning("Failed to patch AgentLoop._process_message: {}", exc)
