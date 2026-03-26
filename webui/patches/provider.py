"""[Provider] patches — transparently support newer OpenAI API formats.

Patch: OpenAICompatProvider.chat (nightly) / CustomProvider + LiteLLMProvider (legacy)
    On the first call that returns an "unsupported legacy protocol" error the
    provider is transparently switched to /v1/responses.
    The decision is cached per api_base so subsequent calls skip the trial.
"""

from __future__ import annotations
import tempfile


def make_provider_patched(config):
    """
    Replicate and patch nanobot's _make_provider logic.
    - Adds support for custom providers from webui_config.json
    - Fixes extra_headers and is_local omissions in older nanobot versions.
    """
    import sys
    from nanobot.providers.registry import find_by_name
    from webui.utils.webui_config import get_custom_providers

    model: str = config.agents.defaults.model
    provider_name: str = config.get_provider_name(model)
    p = config.get_provider(model)

    # 1. Custom dynamically injected providers OR the built-in "custom" provider
    custom_providers = get_custom_providers()
    is_custom_dynamic = provider_name and provider_name in custom_providers
    
    if provider_name == "custom" or is_custom_dynamic:
        from nanobot.providers.custom_provider import CustomProvider
        import inspect
        has_eh = "extra_headers" in inspect.signature(CustomProvider.__init__).parameters
        
        if has_eh:
            kwargs = {"extra_headers": p.extra_headers if p else None}
            return CustomProvider(
                api_key=p.api_key if p else "no-key",
                api_base=config.get_api_base(model) or "http://localhost:8000/v1",
                default_model=model,
                **kwargs,
            )
        else:
            prov = CustomProvider(
                api_key=p.api_key if p else "no-key",
                api_base=config.get_api_base(model) or "http://localhost:8000/v1",
                default_model=model,
            )
            if hasattr(p, "extra_headers") and p.extra_headers and hasattr(prov, "_client"):
                # Avoid double AsyncOpenAI client instantiation by merging headers directly
                prov._client._custom_headers = {**(prov._client._custom_headers or {}), **p.extra_headers}
            return prov

    if provider_name == "openai_codex" or model.startswith("openai-codex/"):
        from nanobot.providers.openai_codex_provider import OpenAICodexProvider
        return OpenAICodexProvider(default_model=model)

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
    if not model.startswith("bedrock/") and not (p and p.api_key) and not (spec and (spec.is_oauth or spec.is_local)):
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


def apply() -> None:
    import json
    import uuid

    import httpx
    from nanobot.providers.base import LLMResponse, ToolCallRequest

    # nightly uses OpenAICompatProvider; older versions use CustomProvider + LiteLLMProvider
    _provider_classes: list[type] = []
    try:
        from nanobot.providers.openai_compat_provider import OpenAICompatProvider
        _provider_classes.append(OpenAICompatProvider)
    except ImportError:
        pass
    try:
        from nanobot.providers.custom_provider import CustomProvider
        _provider_classes.append(CustomProvider)
    except ImportError:
        pass
    try:
        from nanobot.providers.litellm_provider import LiteLLMProvider
        _provider_classes.append(LiteLLMProvider)
    except ImportError:
        pass

    if not _provider_classes:
        from loguru import logger as _logger
        _logger.warning("No provider classes found to patch")
        return

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

        # --- Convert messages to Responses API input format ---
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
        # assistant entries that only contain tool_calls have no content field — keep those.
        def _is_valid_item(item: dict) -> bool:
            itype = item.get("type")
            if itype in ("function_call", "function_call_output"):
                return True
            return item.get("content") not in (None, "", [])

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
        from loguru import logger as _logger
        import os
        import datetime

        _debug_log_flag = os.getenv("NANOBOT_DEBUG_LLM")  # e.g. /tmp/llm_debug.log
        _debug_log_path = os.path.join(tempfile.gettempdir(), "nanobot_llm_debug.log")

        def _write_debug_log(api_base: str, messages, tools) -> None:
            """Write LLM request payload to a dedicated debug log file, one JSON line per call."""
            if not _debug_log_flag:
                return
            try:
                entry = {
                    "ts": datetime.datetime.now().isoformat(timespec="seconds"),
                    "api_base": api_base,
                    "messages": messages,
                    "tools": tools,
                }
                line = json.dumps(entry, ensure_ascii=False, default=str)
                with open(_debug_log_path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
                _logger.debug("LLM request written to {}, len={}", _debug_log_path, len(line))
            except Exception as exc:
                _logger.warning("Failed to write LLM debug log: {}", exc)

        async def _patched_chat(self, messages, tools=None, model=None,
                                max_tokens=4096, temperature=0.7, reasoning_effort=None,
                                tool_choice=None):
            # Fast path: already confirmed this base needs Responses API.
            if self.api_base in _responses_api_bases:
                return await _call_responses_api(self, messages, tools, model, max_tokens, temperature)

            _write_debug_log(self.api_base, messages, tools)
            # 打印消息长度和 tools 长度，帮助调试
            _logger.debug("LLM request '{}' messages_len={} tools_len={}", self.api_base, len(messages), len(tools) if tools else 0)
            result: LLMResponse = await original_chat(
                self, messages, tools, model, max_tokens, temperature, reasoning_effort,
                tool_choice=tool_choice
            )

            # Detect legacy-protocol rejection and auto-switch.
            if (result.finish_reason == "error" and result.content and
                    any(m in result.content.lower() for m in _LEGACY_MARKERS)):
                _responses_api_bases.add(self.api_base)
                return await _call_responses_api(self, messages, tools, model, max_tokens, temperature)

            return result
        return _patched_chat

    for cls in _provider_classes:
        cls.chat = _make_patched_chat(cls.chat)  # type: ignore[method-assign]

    # Patch nanobot CLI's _make_provider so CLI commands use our patched factory
    try:
        import nanobot.cli.commands as _commands
        _commands._make_provider = make_provider_patched
    except Exception:
        pass
