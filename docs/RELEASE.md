# Release Notes

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
