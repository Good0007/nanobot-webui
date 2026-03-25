"""[Config] patches — intercept Config._match_provider to support custom dynamic providers."""

from __future__ import annotations


def apply() -> None:
    from nanobot.config.schema import Config
    from webui.utils.webui_config import get_custom_providers
    
    # Store original method
    _original_match_provider = Config._match_provider

    def _patched_match_provider(self, model: str | None = None) -> tuple:
        """
        Intercept _match_provider to return custom providers from webui_config.json
        before falling back to the hardcoded nanobot providers.
        """
        from nanobot.config.schema import ProviderConfig
        
        forced = self.agents.defaults.provider
        custom_providers = get_custom_providers()
        
        # 1. If provider is forced and it's a custom provider
        if forced != "auto" and forced in custom_providers:
            data = custom_providers[forced]
            p = ProviderConfig(
                api_key=data.get("api_key", ""),
                api_base=data.get("api_base", ""),
                extra_headers=data.get("extra_headers", None)
            )
            # Return the exact name so _make_provider can detect it's custom
            return p, forced
            
        # 2. If auto-detecting, check if model prefix matches any custom provider
        if forced == "auto":
            model_name = model or self.agents.defaults.model
            model_lower = model_name.lower()
            model_prefix = model_lower.split("/", 1)[0] if "/" in model_lower else ""
            normalized_prefix = model_prefix.replace("-", "_")
            
            if normalized_prefix and normalized_prefix in custom_providers:
                data = custom_providers[normalized_prefix]
                p = ProviderConfig(
                    api_key=data.get("api_key", ""),
                    api_base=data.get("api_base", ""),
                    extra_headers=data.get("extra_headers", None)
                )
                return p, normalized_prefix

        # 3. Fallback to original nanobot logic
        return _original_match_provider(self, model)

    # Apply monkey patch
    Config._match_provider = _patched_match_provider  # type: ignore[method-assign]
