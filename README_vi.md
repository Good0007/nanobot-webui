# Nanobot WebUI

**Tiếng Việt** | [中文](README_zh.md) | [English](README.md)

---

Giao diện quản lý web tự host cho [nanobot](https://github.com/HKUDS/nanobot) ([PyPI](https://pypi.org/project/nanobot-ai/)) — một framework AI agent đa kênh.  
Cung cấp đầy đủ giao diện UI để cấu hình, trò chuyện và quản lý instance nanobot, **không cần thay đổi bất kỳ dòng nào trong thư viện core**.

![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
[![GitHub](https://img.shields.io/badge/nanobot-GitHub-181717?logo=github)](https://github.com/HKUDS/nanobot)

---

## Mục lục

- [Tính năng](#tính-năng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
  - [Cài bằng pip (khuyến nghị)](#cài-bằng-pip-khuyến-nghị)
  - [Docker](#docker)
- [WeChat Channel](#wechat-channel)
- [CLI Reference](#cli-reference)
- [Phát triển](#phát-triển)
- [Kiến trúc](#kiến-trúc)
- [Xác thực](#xác-thực)
- [Tech Stack](#tech-stack)

---

## Ảnh chụp màn hình

**Desktop**

| Đăng nhập | Dashboard | Chat |
|-----------|-----------|------|
| ![Login](docs/login.png) | ![Dashboard](docs/dashboard.png) | ![Chat](docs/session.png) |

**Mobile**

| Dashboard | Chat | Session |
|-----------|------|---------|
| ![Mobile Dashboard](docs/mobile_dashboard.png) | ![Mobile Chat](docs/mobile_chat.png) | ![Mobile Session](docs/mobile_session.jpg) |

---

## Tính năng

| Module | Mô tả |
|--------|-------|
| **Dashboard** | Trạng thái channel, thống kê session / skill / cron trong một trang |
| **Chat** | Trò chuyện thời gian thực với agent qua WebSocket |
| **Providers** | Cấu hình API key & base URL cho OpenAI, Anthropic, DeepSeek, Azure và các provider khác |
| **Channels** | Xem và cấu hình tất cả kênh IM (WeChat, Telegram, Discord, Feishu, DingTalk, Slack, QQ, WhatsApp, Email, Matrix, MoChat); WeChat hỗ trợ đăng nhập QR code trực tiếp trên UI |
| **MCP Servers** | Quản lý các tool server theo chuẩn Model Context Protocol |
| **Skills** | Bật / tắt skill của agent; chỉnh sửa workspace skill ngay trên trình duyệt |
| **Cron Jobs** | Lên lịch, chỉnh sửa và bật/tắt các tác vụ định kỳ |
| **Agent Settings** | Model, temperature, max tokens, memory window, đường dẫn workspace, v.v. |
| **Users** | Quản lý nhiều người dùng với role `admin` / `user` |
| **PWA** | Có thể cài như ứng dụng desktop / home-screen; tự động phát hiện bản cập nhật và gợi ý reload chỉ một click |
| **Mobile-ready** | Layout responsive với fix riêng cho bàn phím iOS Safari để ô nhập liệu luôn hiển thị |
| **Dark mode** | Chuyển đổi light / dark chỉ một click; mặc định theo system preference khi truy cập lần đầu; palette tối dùng tông ấm phù hợp màu thương hiệu |
| **i18n** | 9 ngôn ngữ UI tích hợp sẵn: 中文、繁體中文、English、日本語、한국어、Deutsch、Français、Português、Español — tự động phát hiện theo ngôn ngữ / timezone của trình duyệt; chuyển đổi bất kỳ lúc nào qua menu ngôn ngữ |

---

## Bắt đầu nhanh

### Cài bằng pip (khuyến nghị)

```bash
pip install nanobot-webui
```

> **Nâng cấp từ phiên bản cũ?** Gỡ cài đặt trước để tránh xung đột:
> ```bash
> pip uninstall -y nanobot-webui
> pip install nanobot-webui
> ```

Frontend React đã được build sẵn trong wheel — **không cần Node.js**.  
Sau khi cài đặt, khởi động WebUI bằng lệnh chuyên dụng:

```bash
# Chạy foreground (WebUI + gateway kết hợp)
nanobot-webui start

# Chỉ định port tùy chỉnh
nanobot-webui start --port 9090

# Chạy nền daemon (khuyến nghị cho môi trường production)
nanobot-webui start -d

# Alias ngắn
webui start
```

Mở **http://localhost:18780** — thông tin đăng nhập mặc định: **admin / nanobot** — đổi mật khẩu ngay sau lần đầu đăng nhập.

---

### uv (khuyến nghị cho môi trường tách biệt)

```bash
uv tool install nanobot-webui
```

> **Nâng cấp?**
> ```bash
> uv tool upgrade nanobot-webui
> ```

`uv tool install` cài `nanobot-webui` / `webui` vào một virtual environment tách biệt do uv quản lý (`~/.local/share/uv/tools/nanobot-webui/`) và tạo symlink executable vào `~/.local/bin/` — hoàn toàn độc lập với môi trường dự án hiện tại và Python hệ thống.

> `nanobot-webui` là entrypoint được khuyến nghị. Tránh xung đột lệnh với các môi trường đã có sẵn lệnh `nanobot`.

---

### Docker

**Yêu cầu:** Docker ≥ 24 với plugin Compose (`docker compose`).

### Option 1 --- Docker Compose (khuyến nghị)

Tạo file `docker-compose.yml`:

``` yaml
services:
  webui:
    image: kangkang223/nanobot-webui:latest
    container_name: nanobot-webui
    volumes:
      - ~/.nanobot:/root/.nanobot   # lưu config & dữ liệu
    ports:
      - "18780:18780"    # WebUI
    restart: unless-stopped
```

Sau đó:

``` bash
# Pull image mới nhất và chạy nền
docker compose up -d

# Xem log
docker compose logs -f

# Dừng
docker compose down
```

Mở **http://localhost:18780** — tài khoản mặc định: **admin / nanobot**.

> **Thư mục dữ liệu:** toàn bộ config, session và workspace được lưu tại `~/.nanobot` trên host (map tới `/root/.nanobot` trong container).

#### Biến môi trường

Tất cả tùy chọn khởi động đều có thể cấu hình qua biến môi trường — tiện cho Docker Compose override:

| Biến | Mặc định | Mô tả |
|---|---|---|
| `WEBUI_PORT` | `18780` | Cổng HTTP |
| `WEBUI_HOST` | `0.0.0.0` | Địa chỉ bind |
| `WEBUI_LOG_LEVEL` | `DEBUG` | Mức log: `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `WEBUI_WORKSPACE` | _(mặc định nanobot)_ | Override đường dẫn workspace |
| `WEBUI_CONFIG` | _(mặc định nanobot)_ | Đường dẫn tới `config.json` |
| `WEBUI_ONLY` | — | Đặt thành `true` để bỏ qua IM channel (dùng khi nanobot chạy riêng qua systemd) |

Ví dụ `docker-compose.yml` với cấu hình tùy chỉnh:

```yaml
services:
  webui:
    image: kangkang223/nanobot-webui:latest
    container_name: nanobot-webui
    environment:
      - WEBUI_PORT=18780
      - WEBUI_HOST=0.0.0.0
      - WEBUI_LOG_LEVEL=INFO
      # - WEBUI_WORKSPACE=/root/.nanobot/workspace
      # - WEBUI_CONFIG=/root/.nanobot/config.json
      # - WEBUI_ONLY=true
    volumes:
      - ~/.nanobot:/root/.nanobot
    ports:
      - "18780:18780"
    restart: unless-stopped
```

#### Option 2 — Build từ source

```bash
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui

# Build image multi-stage (bun build → python runtime)
docker build -t nanobot-webui .

# Chạy
docker run -d \
  --name nanobot-webui \
  -p 18780:18780 \
  -v ~/.nanobot:/root/.nanobot \
  --restart unless-stopped \
  nanobot-webui
```

#### Option 3 — Makefile shortcut

Nếu đã clone repository, `Makefile` đi kèm bao gồm các tác vụ phổ biến:

```bash
make up           # docker compose up -d
make down         # docker compose down
make logs         # theo dõi compose logs
make restart      # docker compose restart
make build        # build image single-arch local
make release      # buildx push :<version-from-pyproject> và :latest
make release VERSION=0.2.7.post4  # chỉ định version tag rõ ràng
```

---

## CLI Reference

Dùng `nanobot-webui` (hoặc alias ngắn `webui`) làm lệnh chính.

Lệnh tương thích cũ vẫn được giữ lại:

```bash
nanobot webui start
nanobot webui status
nanobot webui stop
```

`nanobot-webui` vẫn là entrypoint được khuyến nghị cho các deployment mới vì rõ ràng hơn và tránh nhầm lẫn lệnh.

### `nanobot-webui start` — Khởi động WebUI

```
Usage: nanobot-webui start [OPTIONS]

Options:
  -p, --port INTEGER        Cổng HTTP  [mặc định: 18780]
      --host TEXT           Địa chỉ bind  [mặc định: 0.0.0.0]
  -w, --workspace PATH      Override thư mục workspace
  -c, --config PATH         Đường dẫn tới file config
  -d, --daemon              Chạy nền (daemon mode)
  -l, --log-level TEXT      DEBUG / INFO / WARNING / ERROR  [mặc định: DEBUG]
      --webui-only          Chỉ khởi động WebUI HTTP server và agent (cho WebSocket
                            chat). Không khởi động IM channel và heartbeat. Dùng khi
                            nanobot đã được quản lý bởi tiến trình ngoài (vd: systemd)
                            để tránh hai tiến trình tranh cùng kết nối IM channel.
```

```bash
nanobot-webui start                          # foreground (Ctrl-C để dừng)
nanobot-webui start --port 9090              # port tùy chỉnh
nanobot-webui start -d                       # chạy nền daemon
nanobot-webui start -d --port 9090           # nền + port tùy chỉnh
nanobot-webui start --workspace ~/myproject  # override workspace
nanobot-webui start --webui-only             # chỉ WebUI; nanobot do dịch vụ ngoài quản lý
nanobot-webui start -d --webui-only          # nền + chỉ WebUI
```

Mở **http://localhost:18780** — tài khoản mặc định: **admin / nanobot** — đổi mật khẩu ngay sau lần đầu đăng nhập.

### `nanobot-webui stop` — Dừng dịch vụ nền

```bash
nanobot-webui stop    # gửi SIGTERM; force-kill sau 6s nếu cần
```

### `nanobot-webui status` — Xem trạng thái dịch vụ

```bash
nanobot-webui status  # trạng thái chạy, PID, URL, đường dẫn log
```

### `nanobot-webui restart` — Khởi động lại dịch vụ nền

```bash
nanobot-webui restart              # dừng + khởi động lại nền (giữ port hiện tại)
nanobot-webui restart --port 9090  # khởi động lại với port mới
```

### `nanobot-webui logs` — Xem log

```
Usage: nanobot-webui logs [OPTIONS]

Options:
  -f, --follow          Stream log theo thời gian thực (như tail -f)
  -n, --lines INTEGER   Số dòng cần hiển thị  [mặc định: 50]
```

```bash
nanobot-webui logs              # 50 dòng gần nhất
nanobot-webui logs -f           # stream theo thời gian thực
nanobot-webui logs -f -n 100    # stream, hiển thị 100 dòng gần nhất
```

> File log: `~/.nanobot/webui.log`

> **File trạng thái:** PID → `~/.nanobot/webui.pid`, port → `~/.nanobot/webui.port`

---

## Phát triển

**Yêu cầu:** Python ≥ 3.11, [Bun](https://bun.sh) ≥ 1.0, [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
# 1. Clone và cài backend ở chế độ editable
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui
uv venv               # tạo virtual env
uv pip install -e .

# 2. Khởi động backend
uv run nanobot-webui start          # API + static trên :18780

# 3. Khởi động frontend dev server (terminal riêng)
cd web
bun install
bun dev                              # http://localhost:5173  (proxy /api → :18780)
```

Lệnh tương thích cũ vẫn dùng được: `uv run nanobot webui start`.

Build production:

```bash
# 1) Build frontend static assets
cd web
bun run build          # output vào web/dist/, setup.py copy sang webui/web/dist/

# 2) Khởi động backend từ thư mục gốc để serve assets đã build
cd ..
uv run nanobot-webui start    # backend serve webui/web/dist/ dưới dạng static files
```

Lệnh tương thích cũ: `uv run nanobot webui start`.

---

## Kiến trúc

```
nanobot-webui/
├── webui/                      # Python package (import dưới dạng `webui`)
│   ├── __init__.py
│   ├── __main__.py             # Entry point: python -m webui
│   ├── cli.py                  # Sub-command Typer inject vào nanobot CLI
│   ├── channels/               # Plugin channel (đăng ký qua entry-points)
│   │   └── weixin.py           #   WeChat channel (đăng nhập QR qua iLink)
│   ├── web/
│   │   └── dist/               # React assets đã build (tạo bởi bun run build)
│   ├── api/                    # Backend FastAPI
│   │   ├── auth.py             # JWT + bcrypt helpers
│   │   ├── users.py            # UserStore  (~/.nanobot/webui_users.json)
│   │   ├── deps.py             # FastAPI dependency injection
│   │   ├── gateway.py          # ServiceContainer + vòng đời server
│   │   ├── server.py           # FastAPI app factory (static serving, SPA fallback)
│   │   ├── channel_ext.py      # ExtendedChannelManager (subclass không xâm lấn)
│   │   ├── middleware.py       # Request middleware (logging, CORS, v.v.)
│   │   ├── models.py           # Pydantic response models
│   │   ├── provider_meta.py    # Metadata & capability registry của provider
│   │   └── routes/             # Một file mỗi domain
│   │       ├── auth.py         #   POST /api/auth/login|register|change-password
│   │       ├── channels.py     #   GET|PATCH /api/channels  (gồm WeChat QR endpoints)
│   │       ├── config.py       #   GET|PATCH /api/config
│   │       ├── cron.py         #   CRUD /api/cron
│   │       ├── mcp.py          #   GET|PATCH /api/mcp
│   │       ├── openai_proxy.py #   OpenAI-compatible proxy /api/v1/...
│   │       ├── providers.py    #   GET|PATCH /api/providers
│   │       ├── sessions.py     #   GET|DELETE /api/sessions
│   │       ├── skills.py       #   GET|POST /api/skills
│   │       ├── users.py        #   CRUD /api/users  (chỉ admin)
│   │       └── ws.py           #   WebSocket /ws/chat
│   ├── patches/                # Monkey-patch runtime tối giản (không xâm lấn)
│   │   ├── channels.py         #   allow_from: "*" → cho phép tất cả (theo nanobot)
│   │   ├── mcp_dynamic.py      #   Bật/tắt MCP server động
│   │   ├── provider.py         #   Hỗ trợ hot-reload provider
│   │   ├── session.py          #   Tinh chỉnh persistence session
│   │   ├── skills.py           #   Helper reload skill
│   │   └── subagent.py         #   Fix routing sub-agent
│   └── utils/
│       └── webui_config.py     # Lưu trữ cấu hình WebUI thống nhất (~/.nanobot/webui_config.json)
├── web/                        # Source frontend React 18 + TypeScript
│   ├── src/
│   │   ├── pages/              # Một component mỗi route
│   │   │   ├── Chat.tsx        #   Trang chat thời gian thực
│   │   │   ├── Channels.tsx    #   Cấu hình kênh IM (gồm WeChat QR login)
│   │   │   ├── CronJobs.tsx    #   Tác vụ định kỳ
│   │   │   ├── Dashboard.tsx   #   Tổng quan & thống kê
│   │   │   ├── Login.tsx       #   Xác thực
│   │   │   ├── MCPServers.tsx  #   MCP tool server
│   │   │   ├── Settings.tsx    #   Cài đặt Agent / provider / workspace
│   │   │   ├── Skills.tsx      #   Quản lý skill
│   │   │   ├── SystemConfig.tsx#   Cấu hình cấp hệ thống
│   │   │   ├── Tools.tsx       #   Trình duyệt tool khả dụng
│   │   │   └── Users.tsx       #   Quản lý người dùng (admin)
│   │   ├── components/         # Layout, chat, UI components dùng chung
│   │   ├── hooks/              # TanStack Query data hooks
│   │   ├── stores/             # Zustand stores (auth, chat)
│   │   ├── lib/                # axios instance, WebSocket manager, utilities
│   │   ├── i18n/               # Quốc tế hoá (zh / en / ...)
│   │   └── theme/              # Cấu hình next-themes
│   ├── eslint.config.js
│   └── package.json
├── Dockerfile                  # Multi-stage: bun build → python runtime
├── docker-compose.yml
├── pyproject.toml
└── setup.py                    # Build hook: chạy bun run build, copy dist vào webui/
```

**Nguyên tắc thiết kế:** backend hoàn toàn không xâm lấn — chỉ import thư viện nanobot mà không bao giờ patch source của chúng. Monkey-patch runtime (áp dụng trong `webui/patches/`) là tối giản và giới hạn ở các tinh chỉnh quality-of-life. Tất cả patch được áp dụng một lần lúc khởi động, trước khi bất kỳ internal nanobot nào được khởi tạo.

---

## Xác thực

| Thành phần | Giá trị |
|------------|---------|
| Tài khoản mặc định | `admin` / `nanobot` |
| Lưu trữ credential | `~/.nanobot/webui_users.json` (mật khẩu hash bằng bcrypt) |
| Loại token | JWT (HS256) |
| Thời hạn token | 7 ngày |
| JWT secret | Tự sinh theo instance, lưu tại `~/.nanobot/webui_secret.key` |

> **Lưu ý bảo mật:** đổi mật khẩu mặc định ngay sau lần đầu đăng nhập.

---

## Tech Stack

| Layer | Thư viện / Công cụ |
|-------|-------------------|
| Backend framework | FastAPI + Uvicorn |
| Auth | PyJWT + bcrypt |
| Frontend framework | React 18 + TypeScript + Vite |
| UI components | shadcn/ui + Tailwind CSS v3 |
| Client state | Zustand (persist middleware) |
| Server state | TanStack Query v5 |
| i18n | react-i18next (9 ngôn ngữ UI) |
| Theme | next-themes (light / dark / system) |
| Real-time | WebSocket (`/ws/chat`) |
| Package manager | Bun |
