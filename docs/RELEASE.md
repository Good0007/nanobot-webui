# Release Notes

## v0.2.7.post3 — 2026-04-11

**Direct Changes from `v0.2.7` to `v0.2.7.post3`**

This post-release series includes three functional updates plus packaging and compatibility fixes:

- **Chat Input (Mobile UX) Improvements**
	- Enhanced `ChatInput` mobile behavior: Enter key no longer submits on mobile by default, reduced input/button sizing, and refined spacing.
	- Moved "show/hide tool messages" into a compact dropdown menu and optimized the status indicator area for small screens.
	- Improved send/stop button behavior for mobile icon mode to reduce accidental interactions.

- **Session Deletion & Message State Fixes**
	- Fixed stale cache issues after deleting sessions by explicitly clearing per-session message/memory queries.
	- Updated message reload conditions to handle both message count increases and decreases (important when a session is deleted/recreated with the same key).
	- Preserved locally generated assistant error messages (e.g., `⚠️`) during history reloads so transient error context is not lost.

- **Cross-Platform Exec & Feishu Compatibility**
	- Added a temporary `exec_windows` patch to backport Windows-safe ExecTool behavior for `nanobot-ai==0.1.5`:
		- use `cmd.exe /c` on Windows,
		- build platform-appropriate subprocess environment,
		- apply `PATH` updates with Windows semantics,
		- skip Linux-only sandbox wrapping on Windows.
	- Improved daemon/process handling on Windows by falling back to `SIGTERM` when `SIGKILL` is unavailable.
	- Improved `webui logs` to work without external `tail`, enabling cross-platform log following.
	- Patched Feishu channel startup to gracefully degrade when `lark_oapi` lacks `bot.v3` modules, preventing channel startup failures.

- **API/Packaging & Dependency Stabilization (post1 → post3)**
  - Added missing build/publish tooling (`build`, `twine`) to `dev` extras.
  - Refined FastAPI 204 routes with explicit `response_model=None` + `Response` class to avoid no-content response model inconsistencies.
  - Added `webui` command entrypoint alias (`webui = webui.__main__:main_cli`) and a compatibility optional positional `start` command.
  - Tightened runtime dependency versions for better reproducibility.
  - Adjusted `bcrypt` from pinned `4.1.0` to `>=4.1.1,<5.0.0` for compatibility.
  - Updated Dockerfile default install version to `0.2.7.post3` and switched install index to official PyPI.

---

## v0.2.7 — 2026-04-09

**Upgrade to `nanobot-ai v0.1.5`**
- Bump hard dependency to `nanobot-ai==0.1.5`
- Updated `AgentLoop` initialization to use the new `web_config` parameter (replacing `web_search_config` + `web_proxy` in 0.1.4)
- Rewrote `patches/provider.py` to align with the new `OpenAICompatProvider` API (`find_by_name` import path updated)
- Added `execSandbox` field handling in the Settings UI (`AgentTab`) to expose the new exec sandbox toggle introduced in 0.1.5
- `reload_provider()` now syncs `agent.subagents.model` alongside all provider references, matching 0.1.5's `SubagentManager` interface

**Message Revoke Enhancement**
- Revoke now deletes the target message **and all subsequent messages**, allowing a clean re-run from any point in the conversation
- Added inline confirmation UI — clicking the revoke icon shows an inline "撤回? ✓ ✕" prompt directly on the message bubble, preventing accidental deletion
- Fully localized revoke confirmation and toast notifications across all 9 supported languages

**Provider Config Hot-Reload**
- Fixed a bug where updating the LLM provider configuration required a full restart to take effect
- `reload_provider()` now syncs all internal references: `agent.runner`, `agent.subagents.provider/runner`, `agent.dream.provider/_runner`, and `heartbeat.provider`
- Tools (`ExecTool`, `WebSearchTool`) are automatically re-registered on config change, picking up updated `exec_config`, `web_config`, and `restrict_to_workspace` values without restart

---

## v0.2.6 — 2026-03-29

**System Logs Viewer**
- Add a new "System Logs" tab in the System Config page to view WebUI runtime logs (`webui.log`) directly in the browser
- **Safe & Efficient**: Replaced `subprocess.run` `tail` with Python's native `collections.deque` for secure, cross-platform log trailing without spawning child processes
- **Keyword Filtering**: Added real-time grep-like keyword filtering with a debounced search input
- **Responsive UX**: Implemented a flex-based responsive layout for mobile compatibility, with an auto-scroll toggle and adjustable line count
- Fully localized with 7 UI languages

**Docker & Deployment Enhancements**
- Add `docker-entrypoint.sh` with robust environment variable substitution support
- Update Dockerfile to support seamless image builds
- Fix CLI daemon start command and restructure WebUI subcommands

**Channel & Core Compatibility**
- Fix `--webui-only` mode: correctly report channel running status from config even when channels are managed by an external process
- Auto-initialize config on first run and ensure all channels are visible regardless of config state
- Upgrade to `nanobot-ai v0.1.4.post6` and fix provider backend attribute retrieval (`getattr(spec, 'backend')`)
- Add initial support for WeCom (Enterprise WeChat) channel

---

## v0.2.5 — 2026-03-28

**Custom AI Provider Management**
- Support dynamic addition, configuration, and deletion of custom AI providers without restarting services
- Automatically adapt to OpenAI-compatible interfaces (including API keys, Base URLs, and supported model lists)
- Enhanced provider matching logic: inject custom providers into the `nanobot` core agent loop via patching mechanism
- Frontend settings interface provides modals for provider creation, editing, and deletion, with synchronized i18n translations for 7 languages

**Cron Jobs Enhancement**
- **Session Isolation**: Each cron execution now has an independent session ID (`cron:{job_id}:{timestamp}`) to avoid history conflicts
- **Execution Viewer Improvements**: Optimized timestamp parsing logic (compatible with ns/μs/ms precision), added content folding for long messages, and step-by-step status rendering
- **API Fixes**: Synchronized with `nanobot` core library API changes, fixed 422 validation errors for job toggles, and migrated cron data storage to workspace-scoped paths

**Message Rendering & UX Optimization**
- **SubAgent Enhancement**: `MessageBubble` now better renders SubAgent tool call statuses and summary content
- **JSON Editor Update**: Replaced textareas in `SystemConfig` page with CodeMirror JSON editor featuring syntax highlighting, folding, and inline diff highlighting
- **Chat Input Fixes**: Optimized mobile input experience and enter-key submission logic in specific scenarios

**System Compatibility & Patching**
- Synchronized with latest `nanobot` nightly/main branch API changes (e.g., `_announce_result` replacing `_announce`)
- Updated [Dockerfile](Dockerfile) version and cleaned up obsolete dependencies

---

## v0.2.4 — 2026-03-24

**Cron Jobs History**
- Add execution history viewer for Cron jobs — trace all past executions and deep-link to session logs
- Support searching and filtering cron job execution records by job ID or message content
- Support persistent session storage for each cron run (`cron:<job_id>:<ts>`) instead of overwriting a single session

**WeChat Channel Enhancement**
- Support outbound media messages — AI can now send images, videos, and files directly to WeChat users
- Implement client-side AES-128-ECB encryption for WeChat CDN uploads (matching official protocol)
- Auto-detect media type from file extension and handle fallback text notification on failure
- Improve login flow: add `nanobot channels login weixin` command for manual authentication

**Web Performance & UX**
- Implement **Lazy Loading** for all main pages using `React.lazy` and `Suspense`
- Introduce `TransitionLink` to prevent Suspense fallback flickering during navigation — UI stays responsive while loading chunks
- Optimize bundle size via Vite manual chunks: separate markdown rendering, UI primitives, and icons into dedicated chunks
- Localize multi-language labels for WeChat login and cron history (en, zh, ja, etc.)

**Infrastructure & Storage**
- Fallback local storage: `upload_to_s3` now supports saving to the local workspace when S3 is not configured
- Update [Dockerfile](Dockerfile) with improved node/npm mirror settings and explicit version pinning
- Refactor CLI: remove redundant gateway parameters and optimize WeChat/storage logic

---

## v0.2.3 — 2026-03-22

**WeChat Channel & QR Login**
- Add WeChat (weixin) channel support based on iLink API
- Add `nanobot weixin login` CLI command for headless QR code login confirmed via scanning
- Add `WeixinQrPanel` in the WebUI Channels page for a seamless in-browser scan-to-login experience
- Support real-time login status polling and automatic token persistence to `~/.nanobot/weixin/account.json`
- Add `qrcode[pil]` as an optional dependency via `pyproject.toml` [weixin] extra (included in default dependencies for convenience)
- Localized WeChat login labels and status messages (en / zh)

**Channel Management**
- Prioritize WeChat (weixin) in the channel list for Chinese users
- Ensure the WeChat channel is Always visible in the UI even before initial configuration is saved
- Support masking sensitive tokens in the WeChat configuration view
- Fix `getattr` missing default value in channel reload route to prevent potential crashes

---

## v0.2.2 — 2026-03-21

**Multi-Session Chat**
- Support concurrent multi-session chat — switch between sessions without losing in-flight messages
- Add message revoke support: retract the last sent message and re-edit before resending
- Fix duplicate messages and off-by-one revoke index issues introduced in #8

**i18n — 7 UI Languages**
- Add 4 new locale files: 繁體中文 (zh-TW), 한국어 (ko), Deutsch (de), Français (fr)
- Auto-detect language from browser locale and timezone (e.g. Asia/Taipei → zh-TW, Asia/Seoul → ko)
- Replace 7-language cycle toggle with a `DropdownMenuSub` picker in Sidebar and MobileTopBar
- Login page dropdown lists all 7 languages directly
- Fix login 401 error: skip page-redirect when the failing request is `/auth/login` itself, so the toast error shows correctly instead of refreshing the page
- Fix login form validation: remove HTML5 `required` attribute; use JS guard with i18n toast to avoid browser-native non-localized bubble

---

## v0.2.1 — 2026-03-18

**Config Editor**
- Add config diff highlight feature — visualize changes between current and saved config
- Add line numbers to config editor (DiffEditor) with scroll-sync gutter, dark mode support

**Agent & Provider**
- Upgrade `nanobot-ai` dependency to `0.1.4.post5`
- Update AgentLoop construction: replace legacy params with `GenerationSettings` + `web_search_config` + `context_window_tokens`
- Fix patch compatibility: add `tool_choice` param to `provider._patched_chat`; update SubagentManager tool registration (`WebSearchConfig`, `extra_allowed_dirs`); add `background_tasks` drain in `close_mcp`
- Fix channels route to handle dict-typed channel configs

**Settings & i18n**
- Replace `memory_window` with `context_window_tokens` in API models, routes and frontend
- Update i18n labels for context window setting (en / zh / ja)

**UI Polish**
- Soften chat bubble and active session colors from vivid primary orange to muted palette; add dark mode variants

---

## v0.2.0 — 2026-03-15

**Settings & Config**
- Migrate to unified `webui_config` for all settings management
- Improve MCP server handling and configuration persistence
- Persist provider default API base URL across restarts

**Debugging**
- Add LLM request debug logging (`--log-level` CLI option)
- Fix message overflow in chat UI

**UI Fixes**
- Fix provider refresh button

**Mobile & PWA**
- Add responsive mobile UI layout
- Register PWA service worker; fix iOS home screen icons
- Polish sidebar collapse/expand on mobile

**UI / UX**
- Redesign dark theme and sidebar visual style
- Add sidebar collapse/expand functionality
- Chat session list: search support + last message preview

**i18n**
- Toast notifications fully internationalized (zh / en / ja)
- Mobile i18n fixes

**Misc**
- Update app logo; change default port to `18780`

---

## v0.1.4 — 2026-03-13

**SubAgent Streaming**
- Live progress streaming from SubAgent to WebUI
- Push SubAgent tool hints and results to external channels
- Save full SubAgent tool-call chain to session (all channels)

**Settings UI**
- Add `send_progress` and `send_tool_hints` toggles in Settings page

---

## v0.1.3 — 2026-03-12

**Core**
- Unified patch management system
- Skills dynamic enable/disable toggle
- WebUI enhancements and OpenAI Responses API compatibility
- Fix CI build: frontend assets not bundled into wheel package

**Onboarding**
- Add first-run setup wizard
- Improved initial configuration flow

**UI**
- UI polish and i18n enhancements

---

## v0.1.0 — 2026-03-11 (Initial Release)

- Project initialization
- WebUI with session management and chat interface
- MCP dynamic tool loading; CLI command support
- S3 storage interface for file uploads
- Internationalization (i18n) foundation
- PyPI packaging configuration
