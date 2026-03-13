"""webui.patches — monkey-patches applied to nanobot at startup.

Each sub-module targets one concern and exposes a single ``apply()`` function.
Call ``apply_all()`` once at process start (done by ``webui.__main__``).

Patch inventory
───────────────
channels  [Channel]  Relax access-control managed by the WebUI.
session   [Session]  Add SessionManager.delete for UI-initiated deletion.
provider  [Provider] Auto-fall-back to OpenAI /v1/responses when needed.
skills    [Skills]   Honour .disabled_skills.json from the WebUI toggle.
"""

from __future__ import annotations

from webui.patches import channels, provider, session, skills


def apply_all() -> None:
    """Apply every patch in dependency order."""
    channels.apply()
    session.apply()
    provider.apply()
    skills.apply()
