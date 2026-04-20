"""[ExecEnv] patch — inject admin-configured environment variables into ExecTool.

Problem
───────
ExecTool._build_env() intentionally creates a minimal environment (HOME, LANG,
TERM only) to prevent LLM-generated scripts from leaking secrets out of the
parent process.  This also blocks *legitimate* env-vars (e.g. API keys, paths)
that skills need.

Solution
────────
We monkeypatch ExecTool._build_env at the class level so it additionally injects:

  exec_env            – static key-value pairs stored in webui_config.json
                        (good for non-secret values like JAVA_HOME, NODE_ENV)

  exec_env_passthrough – allowlist of env-var names read from the *parent*
                         process at exec time (good for secrets that must not
                         be stored in any config file)

Security invariants kept:
  • Only names/values explicitly approved by an admin are exposed.
  • The full parent-process environment is never inherited wholesale.
  • Secrets in exec_env_passthrough are never written to disk.
"""

from __future__ import annotations

import os


def apply() -> None:
    from nanobot.agent.tools.shell import ExecTool
    from webui.utils.webui_config import get_exec_env, get_exec_env_passthrough

    _orig_build_env = ExecTool._build_env  # type: ignore[attr-defined]

    # [AI:START] tool=copilot date=2026-04-20 author=chenweikang
    def _build_env_patched(self: ExecTool) -> dict[str, str]:  # type: ignore[override]
        env = _orig_build_env(self)

        # 1. Static env vars configured by admin in WebUI
        static = get_exec_env()
        if static:
            env.update(static)

        # 2. Passthrough: select vars from parent process by allowlist
        for name in get_exec_env_passthrough():
            val = os.environ.get(name)
            if val is not None:
                env[name] = val

        return env
    # [AI:END]

    ExecTool._build_env = _build_env_patched  # type: ignore[method-assign]
