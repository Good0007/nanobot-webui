"""Providers routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from webui.api.deps import get_services, require_admin
from webui.api.gateway import ServiceContainer
from webui.api.models import ProviderInfo, UpdateProviderRequest, CreateProviderRequest
# [AI:START] tool=copilot date=2026-03-12 author=chenweikang
from webui.api import provider_meta
# [AI:END]
from webui.utils import webui_config

router = APIRouter()

# All provider field names that exist on ProvidersConfig
_PROVIDER_NAMES = [
    "anthropic", "openai", "openrouter", "deepseek", "groq", "zhipu",
    "dashscope", "vllm", "ollama", "gemini", "moonshot", "minimax", "aihubmix",
    "siliconflow", "volcengine", "volcengine_coding_plan", "byteplus", 
    "byteplus_coding_plan", "azure_openai", "custom", "openai_codex", 
    "github_copilot",
]


def _mask(value: str) -> str:
    if not value:
        return ""
    return f"••••{value[-4:]}" if len(value) > 4 else "••••"


@router.get("", response_model=list[ProviderInfo])
async def list_providers(
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> list[ProviderInfo]:
    result = []
    
    # 1. Built-in providers from nanobot core
    for name in _PROVIDER_NAMES:
        p = getattr(svc.config.providers, name, None)
        if p is None:
            continue
        result.append(
            ProviderInfo(
                name=name,
                api_key_masked=_mask(p.api_key),
                api_base=p.api_base,
                extra_headers=p.extra_headers,
                has_key=bool(p.api_key),
                models=provider_meta.get_provider_models(name),
                is_custom=False,
            )
        )
        
    # 2. Custom providers from webui_config
    custom_providers = webui_config.get_custom_providers()
    for name, p_data in custom_providers.items():
        api_key = p_data.get("api_key", "")
        result.append(
            ProviderInfo(
                name=name,
                api_key_masked=_mask(api_key),
                api_base=p_data.get("api_base"),
                extra_headers=p_data.get("extra_headers"),
                has_key=bool(api_key),
                models=provider_meta.get_provider_models(name),
                is_custom=True,
            )
        )
        
    return result


@router.post("", response_model=ProviderInfo)
async def create_custom_provider(
    body: CreateProviderRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> ProviderInfo:
    if body.name in _PROVIDER_NAMES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Provider '{body.name}' is a built-in provider name")
        
    custom_providers = webui_config.get_custom_providers()
    if body.name in custom_providers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Provider '{body.name}' already exists")
        
    p_data = {
        "api_key": body.api_key or "",
        "api_base": body.api_base or "",
        "extra_headers": body.extra_headers,
    }
    webui_config.set_custom_provider(body.name, p_data)
    
    if body.models is not None:
        provider_meta.set_provider_models(body.name, body.models)
        
    svc.reload_provider()
    
    return ProviderInfo(
        name=body.name,
        api_key_masked=_mask(p_data["api_key"]),
        api_base=p_data["api_base"],
        extra_headers=p_data["extra_headers"],
        has_key=bool(p_data["api_key"]),
        models=provider_meta.get_provider_models(body.name),
        is_custom=True,
    )


@router.patch("/{name}", response_model=ProviderInfo)
async def update_provider(
    name: str,
    body: UpdateProviderRequest,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> ProviderInfo:
    from nanobot.config.loader import save_config

    is_custom = False
    
    if name in _PROVIDER_NAMES:
        p = getattr(svc.config.providers, name, None)
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Provider '{name}' not found")
            
        if body.api_key is not None:
            p.api_key = body.api_key
        if body.api_base is not None:
            p.api_base = body.api_base or None
        if "extra_headers" in body.model_fields_set:
            p.extra_headers = body.extra_headers or None
            
        save_config(svc.config)
        api_key_masked = _mask(p.api_key)
        api_base = p.api_base
        extra_headers = p.extra_headers
        has_key = bool(p.api_key)
    else:
        custom_providers = webui_config.get_custom_providers()
        if name not in custom_providers:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Provider '{name}' not found")
            
        p_data = custom_providers[name]
        if body.api_key is not None:
            p_data["api_key"] = body.api_key
        if body.api_base is not None:
            p_data["api_base"] = body.api_base or ""
        if "extra_headers" in body.model_fields_set:
            p_data["extra_headers"] = body.extra_headers or None
            
        webui_config.set_custom_provider(name, p_data)
        
        api_key_masked = _mask(p_data.get("api_key", ""))
        api_base = p_data.get("api_base")
        extra_headers = p_data.get("extra_headers")
        has_key = bool(p_data.get("api_key"))
        is_custom = True

    # [AI:START] tool=copilot date=2026-03-12 author=chenweikang
    if body.models is not None:
        provider_meta.set_provider_models(name, body.models)
    # [AI:END]

    svc.reload_provider()
    return ProviderInfo(
        name=name,
        api_key_masked=api_key_masked,
        api_base=api_base,
        extra_headers=extra_headers,
        has_key=has_key,
        models=provider_meta.get_provider_models(name),
        is_custom=is_custom,
    )


@router.delete("/{name}")
async def delete_custom_provider(
    name: str,
    _admin: Annotated[dict, Depends(require_admin)],
    svc: Annotated[ServiceContainer, Depends(get_services)],
) -> dict:
    if name in _PROVIDER_NAMES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot delete built-in provider '{name}'")
        
    if not webui_config.delete_custom_provider(name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Custom provider '{name}' not found")
        
    # Also clean up models meta
    provider_meta.set_provider_models(name, [])
    
    # If the active agent was using this provider, we might need to clear it or fallback to auto
    # (Here we just reload, nanobot will fallback or error gracefully on next chat)
    svc.reload_provider()
    
    return {"status": "success"}
