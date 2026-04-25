"""[Skills] patches — honour the WebUI's per-skill enabled/disabled state.

Strategy
────────
We must NOT patch SkillsLoader.list_skills globally because the WebUI API also
calls it to render the full skills list (including disabled ones with enabled=false).

Instead we patch only the two methods that feed the agent's system prompt:
  • get_always_skills()   – returns skill names to embed verbatim
  • build_skills_summary() – returns the <skills> XML block shown to the agent

Both are called on every conversation turn, so changes take effect immediately.

Disabled skill names are read from the unified webui_config (webui_config.json).
"""

from __future__ import annotations


def apply() -> None:
    from nanobot.agent.skills import SkillsLoader
    from webui.utils.webui_config import get_disabled_skills

    _orig_get_always = SkillsLoader.get_always_skills
    _orig_build_summary = SkillsLoader.build_skills_summary

    # Patch 5a: get_always_skills — strip disabled names from the result.
    def _get_always_patched(self) -> list[str]:
        names = _orig_get_always(self)
        disabled = get_disabled_skills()
        return [n for n in names if n not in disabled]

    # Patch 5b: build_skills_summary — temporarily shadow list_skills on the
    # instance so the XML it builds omits disabled skills entirely.
    def _build_summary_patched(self, exclude: set[str] | None = None) -> str:
        disabled = get_disabled_skills()
        if not disabled:
            return _orig_build_summary(self, exclude=exclude)
        orig_list = self.list_skills

        def _list_skills_filtered(filter_unavailable: bool = True):
            return [
                s for s in orig_list(filter_unavailable=filter_unavailable) if s["name"] not in disabled
            ]

        self.list_skills = _list_skills_filtered  # type: ignore[method-assign]
        try:
            return _orig_build_summary(self, exclude=exclude)
        finally:
            del self.list_skills  # restore class method lookup

    SkillsLoader.get_always_skills = _get_always_patched    # type: ignore[method-assign]
    SkillsLoader.build_skills_summary = _build_summary_patched  # type: ignore[method-assign]
