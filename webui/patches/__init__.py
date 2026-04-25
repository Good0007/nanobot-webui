"""webui.patches — monkey-patches applied to nanobot at startup.

Each sub-module targets one concern and exposes a single ``apply()`` function.
Call ``apply_all()`` once at process start (done by ``webui.__main__``).

Patch inventory
───────────────
channels    [Channel]     Relax access-control managed by the WebUI.
mcp_dynamic [MCPDynamic]  Per-server MCP stacks for dynamic load/unload.
session     [Session]     Add SessionManager.delete for UI-initiated deletion.
provider    [Provider]    Auto-fall-back to OpenAI /v1/responses when needed.
skills      [Skills]      Honour .disabled_skills.json from the WebUI toggle.
subagent    [SubAgent]    Push tool-call progress to WebUI / external channels.
exec_env    [ExecEnv]     Inject admin-configured env vars into ExecTool runs.
"""

from __future__ import annotations

from webui.patches import channels, exec_env, mcp_dynamic, provider, session, skills, subagent, config


def apply_all() -> None:
    """Apply every patch in dependency order."""
    config.apply()       # must run early to intercept Config methods
    mcp_dynamic.apply()  # must run before agent is created
    channels.apply()
    session.apply()
    provider.apply()
    skills.apply()
    subagent.apply()
    exec_env.apply()     # patches ExecTool._build_env to inject configured env vars
