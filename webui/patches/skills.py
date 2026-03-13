"""[Skills] patches — honour the WebUI's per-skill enabled/disabled state.

Strategy
────────
We must NOT patch SkillsLoader.list_skills globally because the WebUI API also
calls it to render the full skills list (including disabled ones with enabled=false).

Instead we patch only the two methods that feed the agent's system prompt:
  • get_always_skills()   – returns skill names to embed verbatim
  • build_skills_summary() – returns the <skills> XML block shown to the agent

Both are called on every conversation turn, so changes take effect immediately.
"""

from __future__ import annotations

_DISABLED_FILE = ".disabled_skills.json"


def apply() -> None:
    import json as _json

    from nanobot.agent.skills import SkillsLoader

    def _load_disabled(workspace) -> set[str]:
        p = workspace / _DISABLED_FILE
        if not p.exists():
            return set()
        try:
            return set(_json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            return set()

    _orig_get_always = SkillsLoader.get_always_skills
    _orig_build_summary = SkillsLoader.build_skills_summary

    # Patch 5a: get_always_skills — strip disabled names from the result.
    def _get_always_patched(self) -> list[str]:
        names = _orig_get_always(self)
        disabled = _load_disabled(self.workspace)
        return [n for n in names if n not in disabled]

    # Patch 5b: build_skills_summary — temporarily shadow list_skills on the
    # instance so the XML it builds omits disabled skills entirely.
    def _build_summary_patched(self) -> str:
        disabled = _load_disabled(self.workspace)
        if not disabled:
            return _orig_build_summary(self)
        orig_list = self.list_skills
        self.list_skills = lambda filter_unavailable=True: [   # type: ignore[method-assign]
            s for s in orig_list(filter_unavailable) if s["name"] not in disabled
        ]
        try:
            return _orig_build_summary(self)
        finally:
            del self.list_skills  # restore class method lookup

    SkillsLoader.get_always_skills = _get_always_patched    # type: ignore[method-assign]
    SkillsLoader.build_skills_summary = _build_summary_patched  # type: ignore[method-assign]
