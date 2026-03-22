# Nanobot WebUI

**English** | [中文](README_zh.md)

---

A self-hosted web management panel for [nanobot](https://github.com/HKUDS/nanobot) ([PyPI](https://pypi.org/project/nanobot-ai/)) — a multi-channel AI agent framework.  
Provides a full-featured UI to configure, converse with, and manage your nanobot instance, with no modifications to the core library.

![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
[![GitHub](https://img.shields.io/badge/nanobot-GitHub-181717?logo=github)](https://github.com/HKUDS/nanobot)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [pip install (recommended)](#pip-install-recommended)
  - [Docker](#docker)
- [WeChat Channel](#wechat-channel)
- [CLI Reference](#cli-reference)
- [Development](#development)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [Tech Stack](#tech-stack)

---

## Screenshots

**Desktop**

| Login | Dashboard | Chat |
|-------|-----------|------|
| ![Login](docs/login.png) | ![Dashboard](docs/dashboard.png) | ![Chat](docs/session.png) |

**Mobile**

| Dashboard | Chat | Session |
|-----------|------|---------|
| ![Mobile Dashboard](docs/mobile_dashboard.png) | ![Mobile Chat](docs/mobile_chat.png) | ![Mobile Session](docs/mobile_session.jpg) |

---

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Channel health, session / skill / cron statistics at a glance |
| **Chat** | Real-time conversation with the agent over WebSocket |
| **Providers** | Configure API keys & base URLs for OpenAI, Anthropic, DeepSeek, Azure, and more |
| **Channels** | View and configure all IM channels (WeChat, Telegram, Discord, Feishu, DingTalk, Slack, QQ, WhatsApp, Email, Matrix, MoChat); WeChat supports QR-code login directly from the UI |
| **MCP Servers** | Manage Model Context Protocol tool servers |
| **Skills** | Enable / disable agent skills; edit workspace skills in-browser |
| **Cron Jobs** | Schedule, edit, and toggle recurring tasks |
| **Agent Settings** | Model, temperature, max tokens, memory window, workspace path, etc. |
| **Users** | Multi-user management with `admin` / `user` roles |
| **PWA** | Installable as a desktop / home-screen app; auto-detects updates and prompts a one-click reload |
| **Mobile-ready** | Responsive layout with dedicated iOS Safari keyboard fix to keep the input always visible |
| **Dark mode** | One-click light / dark toggle; defaults to system preference on first visit; dark palette uses warm charcoal tones to match the brand colour |
| **i18n** | 7 built-in UI languages: 中文、繁體中文、English、日本語、한국어、Deutsch、Français — auto-detected from browser language / timezone; switch anytime via the language submenu |

---

## Quick Start

### pip install (recommended)

```bash
pip install nanobot-webui
```

The pre-built React frontend is bundled in the wheel — **no Node.js required**.  
After installation, use the `nanobot` command to start the WebUI:

```bash
# Foreground (WebUI + gateway combined)
nanobot webui

# Custom port
nanobot webui --port 9090

# Background daemon (recommended for long-running deployments)
nanobot webui --daemon
```

Open **http://localhost:18780** — default credentials: **admin / nanobot** — change on first login.

---

### Docker

**Prerequisites:** Docker ≥ 24 with the Compose plugin (`docker compose`).

#### Option 1 — Docker Compose (recommended)

Create a `docker-compose.yml`:

```yaml
services:
  webui:
    image: kangkang223/nanobot-webui:latest
    container_name: nanobot-webui
    volumes:
      - ~/.nanobot:/root/.nanobot   # config & data persistence
    ports:
      - "18780:18780"    # WebUI
      - "18790:18790"  # nanobot gateway (optional, for IM channel webhooks)
    restart: unless-stopped
```

Then:

```bash
# Pull the latest image and start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

Open **http://localhost:18780** — default credentials: **admin / nanobot**.

> **Data directory:** all config, sessions, and workspace files are stored in `~/.nanobot-webui` on the host (mapped to `/root/.nanobot` inside the container).

#### Option 2 — Build from source

```bash
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui

# Build the multi-stage image (bun build → python runtime)
docker build -t nanobot-webui .

# Run
docker run -d \
  --name nanobot-webui \
  -p 18780:18780 \
  -v ~/.nanobot:/root/.nanobot \
  --restart unless-stopped \
  nanobot-webui
```

#### Option 3 — Makefile shortcuts

If you have the repository cloned, the bundled `Makefile` wraps common tasks:

```bash
make up           # docker compose up -d
make down         # docker compose down
make logs         # follow compose logs
make restart      # docker compose restart
make build        # build local single-arch image
make release-dated  # build & push :YYYY-MM-DD + :latest (multi-arch)
```

---

## WeChat Channel

WeChat (微信) is supported via [iLink](https://ilink.dev) (requires an active iLink subscription). The channel implementation is based on [nanobot PR #2348](https://github.com/HKUDS/nanobot/pull/2348).

1. **Log in (choose one)**
   - **WebUI:** Open the **Channels** page → WeChat card → click **QR Login**
   - **CLI (headless servers):** Run `nanobot weixin login` to print the QR code in the terminal
2. **Enable** — The WebUI updates `~/.nanobot/config.json` automatically after login.

> **Note:** Only one WeChat account can be bound at a time. Scanning a new QR code will replace the previous binding.
> Sessions expire periodically — re-scan from the Channels page at any time, no restart needed.

---

## CLI Reference

Installing `nanobot-webui` extends the `nanobot` command with the following subcommands:

### `nanobot webui` — Start the WebUI

```
Usage: nanobot webui [OPTIONS] [COMMAND]

Options:
  -p, --port INTEGER        WebUI HTTP port  (default: 18780)
  -g, --gateway-port INT    nanobot gateway port  (default: from config)
      --host TEXT           Bind address  (default: 0.0.0.0)
  -w, --workspace PATH      Override workspace directory
  -c, --config PATH         Path to config file
      --no-gateway          Start WebUI only; skip nanobot gateway/agent
  -d, --daemon              Run in background; return immediately
```

```bash
nanobot webui                          # foreground (WebUI + gateway)
nanobot webui --port 9090              # custom port
nanobot webui --daemon                 # background daemon
nanobot webui --daemon --port 9090     # background + custom port
nanobot webui --no-gateway             # WebUI only (gateway running elsewhere)
nanobot webui --workspace ~/myproject  # override workspace
```

### `nanobot webui logs` — View logs

```
Usage: nanobot webui logs [OPTIONS]

Options:
  -f, --follow          Stream log output in real time (like tail -f)
  -n, --lines INTEGER   Number of lines to show  (default: 50)
```

```bash
nanobot webui logs              # last 50 lines
nanobot webui logs -f           # stream in real time
nanobot webui logs -f -n 100    # stream, show last 100 lines
```

> Log file: `~/.nanobot/webui.log`

### `nanobot weixin login` — Log in to WeChat via QR code

```bash
nanobot weixin login
```

Prints an ASCII QR code in the terminal. Scan it with the WeChat mobile app to authenticate. On success, saves the bot token to `~/.nanobot/weixin/account.json`.

> Use this on headless servers where a browser is not available. The WebUI Channels page provides the same login flow with a graphical QR code.

---

### `nanobot stop` — Stop the background service

```bash
nanobot stop    # sends SIGTERM; force-kills after 6 s if needed
```

### `nanobot status` — Show runtime status

```bash
nanobot status  # shows WebUI process info + nanobot config summary
```

Example output:

```
🐈 nanobot Status

WebUI: ✓ running (PID 12345 • http://localhost:18780)
Log  : /home/user/.nanobot/webui.log

Config: /home/user/.nanobot/config.json ✓
Workspace: /home/user/.nanobot/workspace ✓
Model: gpt-4o
...
```

> **State files:** PID → `~/.nanobot/webui.pid`, port → `~/.nanobot/webui.port`

---

## Development

**Prerequisites:** Python ≥ 3.11, [Bun](https://bun.sh) ≥ 1.0, [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
# 1. Clone and install backend in editable mode
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui
uv venv               # create a virtual env - don't mess with central python install
uv pip install -e .

# 2. Start the backend
uv run webui                        # API + static on :18780

# 3. Start the frontend dev server (separate terminal)
cd web
bun install
bun dev                              # http://localhost:5173  (proxies /api → :18780)
```

To produce a production build:

```bash
cd web
bun run build          # outputs to web/dist/, setup.py copies it to webui/web/dist/
cd ..
uv run nanobot webui          # backend now serves webui/web/dist/ as static files
```

---

## Architecture

```
nanobot-webui/
├── webui/                      # Python package (importable as `webui`)
│   ├── __init__.py
│   ├── __main__.py             # Entry point: python -m webui
│   ├── cli.py                  # Typer sub-commands injected into nanobot CLI
│   ├── channels/               # Channel plugins (registered via entry-points)
│   │   └── weixin.py           #   WeChat channel (iLink-based QR login)
│   ├── web/
│   │   └── dist/               # Built React assets (generated by bun run build)
│   ├── api/                    # FastAPI backend
│   │   ├── auth.py             # JWT + bcrypt helpers
│   │   ├── users.py            # UserStore  (~/.nanobot/webui_users.json)
│   │   ├── deps.py             # FastAPI dependency injection
│   │   ├── gateway.py          # ServiceContainer + server lifecycle
│   │   ├── server.py           # FastAPI app factory (static serving, SPA fallback)
│   │   ├── channel_ext.py      # ExtendedChannelManager (non-invasive subclass)
│   │   ├── middleware.py       # Request middleware (logging, CORS, etc.)
│   │   ├── models.py           # Pydantic response models
│   │   ├── provider_meta.py    # Provider metadata & capability registry
│   │   └── routes/             # One file per domain
│   │       ├── auth.py         #   POST /api/auth/login|register|change-password
│   │       ├── channels.py     #   GET|PATCH /api/channels  (incl. WeChat QR endpoints)
│   │       ├── config.py       #   GET|PATCH /api/config
│   │       ├── cron.py         #   CRUD /api/cron
│   │       ├── mcp.py          #   GET|PATCH /api/mcp
│   │       ├── openai_proxy.py #   OpenAI-compatible proxy /api/v1/...
│   │       ├── providers.py    #   GET|PATCH /api/providers
│   │       ├── sessions.py     #   GET|DELETE /api/sessions
│   │       ├── skills.py       #   GET|POST /api/skills
│   │       ├── users.py        #   CRUD /api/users  (admin only)
│   │       └── ws.py           #   WebSocket /ws/chat
│   ├── patches/                # Minimal runtime monkey-patches (non-invasive)
│   │   ├── channels.py         #   Empty allow_from → allow all
│   │   ├── mcp_dynamic.py      #   Dynamic MCP server enable/disable
│   │   ├── provider.py         #   Provider hot-reload support
│   │   ├── session.py          #   Session persistence tweaks
│   │   ├── skills.py           #   Skills reload helper
│   │   └── subagent.py         #   Sub-agent routing fix
│   └── utils/
│       └── webui_config.py     # Unified WebUI config store (~/.nanobot/webui_config.json)
├── web/                        # React 18 + TypeScript frontend source
│   ├── src/
│   │   ├── pages/              # One component per route
│   │   │   ├── Chat.tsx        #   Real-time chat page
│   │   │   ├── Channels.tsx    #   IM channel configuration (incl. WeChat QR login)
│   │   │   ├── CronJobs.tsx    #   Scheduled tasks
│   │   │   ├── Dashboard.tsx   #   Overview & stats
│   │   │   ├── Login.tsx       #   Authentication
│   │   │   ├── MCPServers.tsx  #   MCP tool servers
│   │   │   ├── Settings.tsx    #   Agent / provider / workspace settings
│   │   │   ├── Skills.tsx      #   Skill management
│   │   │   ├── SystemConfig.tsx#   System-level configuration
│   │   │   ├── Tools.tsx       #   Available tools browser
│   │   │   └── Users.tsx       #   User management (admin)
│   │   ├── components/         # Layout, chat, shared UI components
│   │   ├── hooks/              # TanStack Query data hooks
│   │   ├── stores/             # Zustand stores (auth, chat)
│   │   ├── lib/                # axios instance, WebSocket manager, utilities
│   │   ├── i18n/               # Internationalisation (zh / en / ...)
│   │   └── theme/              # next-themes configuration
│   ├── eslint.config.js
│   └── package.json
├── Dockerfile                  # Multi-stage: bun build → python runtime
├── docker-compose.yml
├── pyproject.toml
└── setup.py                    # Build hook: runs bun run build, copies dist into webui/
```

**Design principle:** the backend is entirely non-invasive — it imports nanobot libraries but never patches their source. Runtime monkey-patches (applied in `webui/patches/`) are minimal and limited to quality-of-life tweaks (e.g. treating an empty `allow_from` list as "allow all"). All patches are applied once at startup before any nanobot internals are initialised.

---

## Authentication

| Detail | Value |
|--------|-------|
| Default credentials | `admin` / `nanobot` |
| Credential storage | `~/.nanobot/webui_users.json` (bcrypt-hashed passwords) |
| Token type | JWT (HS256) |
| Token expiry | 7 days |
| JWT secret | Auto-generated per instance, stored in `~/.nanobot/webui_secret.key` |

> **Security note:** change the default password immediately after first login.

---

## Tech Stack

| Layer | Library / Tool |
|-------|----------------|
| Backend framework | FastAPI + Uvicorn |
| Auth | PyJWT + bcrypt |
| Frontend framework | React 18 + TypeScript + Vite |
| UI components | shadcn/ui + Tailwind CSS v3 |
| Client state | Zustand (persist middleware) |
| Server state | TanStack Query v5 |
| i18n | react-i18next (zh / en) |
| Theme | next-themes (light / dark / system) |
| Real-time | WebSocket (`/ws/chat`) |
| Package manager | Bun |

