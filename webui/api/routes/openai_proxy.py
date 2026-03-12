"""OpenAI Responses API 格式转换代理。

将标准 /v1/chat/completions 请求自动转换为 OpenAI /v1/responses Responses API 格式，
使 nanobot 的 CustomProvider 能够使用需要 Responses API 的新模型（如 gpt-5.4、
computer-use-preview 等）。

配置方式 (nanobot config.json):
  providers:
    my_openai:
      type: custom
      api_key: sk-xxx
      api_base: http://localhost:8080/openai-proxy   # 指向本代理
  agents:
    defaults:
      model: gpt-5.4

如果目标不是 OpenAI 官方 API，可在请求头中附加:
  X-Target-Base: https://your-api-endpoint.com
代理会自动拼接 /v1/responses 路径。
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/openai-proxy", tags=["openai-proxy"])

_DEFAULT_TARGET_BASE = "https://api.openai.com"


# ---------------------------------------------------------------------------
# Chat Completions → Responses API 转换
# ---------------------------------------------------------------------------

def _extract_system_and_input(
    messages: list[dict[str, Any]],
) -> tuple[str | None, list[dict[str, Any]]]:
    """将 messages 列表分离为 instructions（system）和 input（其余）。

    转换规则：
    - system      → instructions 字符串（合并多条）
    - user        → {role: user, content: ...}
    - assistant   → {role: assistant, content: ...}  或  function_call 项（含 tool_calls 时）
    - tool        → {type: function_call_output, call_id: ..., output: ...}
    """
    system_parts: list[str] = []
    input_items: list[dict[str, Any]] = []

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content")

        if role == "system":
            if isinstance(content, list):
                text = " ".join(
                    block.get("text", "")
                    for block in content
                    if isinstance(block, dict) and block.get("type") == "text"
                )
            else:
                text = content or ""
            if text:
                system_parts.append(text)
            continue

        if role == "tool":
            # 工具调用结果
            output_str = content if isinstance(content, str) else json.dumps(content or "")
            input_items.append({
                "type": "function_call_output",
                "call_id": msg.get("tool_call_id", ""),
                "output": output_str or "(empty)",
            })
            continue

        if role == "assistant":
            tool_calls = msg.get("tool_calls") or []
            if tool_calls:
                # 先添加文字内容（如果有）
                if content:
                    input_items.append({"role": "assistant", "content": content})
                # 再添加函数调用项
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    input_items.append({
                        "type": "function_call",
                        "call_id": tc.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                        "name": fn.get("name", ""),
                        "arguments": fn.get("arguments", "{}"),
                    })
                continue
            # 普通助手消息
            if content is not None:
                input_items.append({"role": "assistant", "content": content or "(empty)"})
            continue

        if role == "user":
            input_items.append({"role": "user", "content": content})
            continue

    instructions = "\n\n".join(system_parts) if system_parts else None
    return instructions, input_items


def _convert_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """将 chat completions 工具定义转换为 Responses API 格式。"""
    converted: list[dict[str, Any]] = []
    for tool in tools:
        if tool.get("type") == "function":
            fn = tool.get("function", {})
            converted.append({
                "type": "function",
                "name": fn.get("name", ""),
                "description": fn.get("description", ""),
                "parameters": fn.get("parameters", {}),
            })
        else:
            converted.append(tool)
    return converted


# ---------------------------------------------------------------------------
# Responses API → Chat Completions 转换
# ---------------------------------------------------------------------------

def _responses_to_chat_completion(data: dict[str, Any], model: str) -> dict[str, Any]:
    """将 Responses API 响应转换为 chat completions 格式。"""
    output: list[dict[str, Any]] = data.get("output", [])

    content: str | None = None
    tool_calls: list[dict[str, Any]] = []
    finish_reason = "stop"

    for item in output:
        item_type = item.get("type")

        if item_type == "message":
            raw_content = item.get("content", [])
            if isinstance(raw_content, list):
                texts = [
                    c.get("text", "")
                    for c in raw_content
                    if isinstance(c, dict) and c.get("type") in ("text", "output_text")
                ]
                content = "".join(texts) or None
            elif isinstance(raw_content, str):
                content = raw_content or None

        elif item_type == "function_call":
            finish_reason = "tool_calls"
            tool_calls.append({
                "id": item.get("id") or f"call_{uuid.uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": item.get("name", ""),
                    "arguments": item.get("arguments", "{}"),
                },
            })

        # reasoning / other items: 忽略

    message: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls

    usage = data.get("usage", {})
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        },
    }


# ---------------------------------------------------------------------------
# FastAPI 路由
# ---------------------------------------------------------------------------

@router.post("/chat/completions")
async def proxy_chat_completions(request: Request) -> JSONResponse:
    """代理：将 /v1/chat/completions 格式转换为 OpenAI Responses API (/v1/responses)。

    Headers:
    - Authorization: Bearer <api_key>  （必须，转发给目标 API）
    - X-Target-Base: https://api.openai.com  （可选，覆盖目标 base URL）
    """
    # ---- 提取 API Key ----
    auth_header = request.headers.get("Authorization", "")
    api_key = auth_header.removeprefix("Bearer ").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing Authorization header with Bearer token")

    # ---- 目标 URL（允许自定义，方便对接其他 Responses API 兼容服务）----
    target_base = request.headers.get("X-Target-Base", _DEFAULT_TARGET_BASE).rstrip("/")
    target_url = f"{target_base}/v1/responses"

    # ---- 解析请求体 ----
    try:
        body: dict[str, Any] = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {exc}") from exc

    model: str = body.get("model", "")
    messages: list[dict[str, Any]] = body.get("messages") or []
    tools: list[dict[str, Any]] = body.get("tools") or []
    max_tokens: int = int(body.get("max_tokens") or 4096)
    temperature: float = float(body.get("temperature", 1.0))

    # ---- 格式转换 ----
    instructions, input_items = _extract_system_and_input(messages)

    responses_body: dict[str, Any] = {
        "model": model,
        "input": input_items,
        "max_output_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if instructions:
        responses_body["instructions"] = instructions
    if tools:
        responses_body["tools"] = _convert_tools(tools)
        responses_body["tool_choice"] = body.get("tool_choice") or "auto"

    # ---- 转发到 Responses API ----
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                target_url,
                json=responses_body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=exc.response.text,
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Upstream request error: {exc}") from exc

    result = _responses_to_chat_completion(resp.json(), model)
    return JSONResponse(content=result)
