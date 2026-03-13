"""[Provider] patches — transparently support newer OpenAI API formats.

Patch 4: CustomProvider.chat + LiteLLMProvider.chat
    On the first call that returns an "unsupported legacy protocol" error the
    provider is transparently switched to /v1/responses.
    The decision is cached per api_base so subsequent calls skip the trial.
"""

from __future__ import annotations


def apply() -> None:
    import json
    import uuid

    import httpx
    from nanobot.providers.base import LLMResponse, ToolCallRequest
    from nanobot.providers.custom_provider import CustomProvider
    from nanobot.providers.litellm_provider import LiteLLMProvider

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

    CustomProvider.chat = _make_patched_chat(CustomProvider.chat)    # type: ignore[method-assign]
    LiteLLMProvider.chat = _make_patched_chat(LiteLLMProvider.chat)  # type: ignore[method-assign]
