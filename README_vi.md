# Nanobot WebUI

**Tiếng Việt** \| [中文](README_zh.md) \| [English](README.md)

------------------------------------------------------------------------

Giao diện quản lý web dành cho
[nanobot](https://github.com/HKUDS/nanobot)
([PyPI](https://pypi.org/project/nanobot-ai/)) --- một framework AI
agent đa kênh.\
Cung cấp một giao diện UI đầy đủ tính năng để cấu hình, trò chuyện và
quản lý instance nanobot của bạn, **không cần bất kỳ thay đổi nào đối
với thư viện core**.

![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
[![GitHub](https://img.shields.io/badge/nanobot-GitHub-181717?logo=github)](https://github.com/HKUDS/nanobot)

------------------------------------------------------------------------

## Mục lục

-   [Tính năng](#features)
-   [Bắt đầu nhanh](#quick-start)
    -   [Cài bằng pip (khuyến nghị)](#pip-install-recommended)
    -   [Docker](#docker)
-   [WeChat Channel](#wechat-channel)
-   [CLI Reference](#cli-reference)
-   [Phát triển](#development)
-   [Kiến trúc](#architecture)
-   [Xác thực](#authentication)
-   [Tech Stack](#tech-stack)

------------------------------------------------------------------------

## Screenshots

**Desktop**

  -----------------------------------------------------------------------------------------
  Login                      Dashboard                          Chat
  -------------------------- ---------------------------------- ---------------------------
  ![Login](docs/login.png)   ![Dashboard](docs/dashboard.png)   ![Chat](docs/session.png)

  -----------------------------------------------------------------------------------------

**Mobile**

  ---------------------------------------------------------------------------------------------------------
  Dashboard                               Chat                          Session
  --------------------------------------- ----------------------------- -----------------------------------
  ![Mobile                                ![Mobile                      ![Mobile
  Dashboard](docs/mobile_dashboard.png)   Chat](docs/mobile_chat.png)   Session](docs/mobile_session.jpg)

  ---------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## Tính năng

  -------------------------------------------------------------------------------------------------------------------------
  Module                                   Mô tả
  ---------------------------------------- --------------------------------------------------------------------------------
  **Dashboard**                            Hiển thị nhanh trạng thái của các channel, thống kê session / skill / cron

  **Chat**                                 Trò chuyện thời gian thực với agent thông qua WebSocket

  **Providers**                            Cấu hình API key & base URL cho OpenAI, Anthropic, DeepSeek, Azure và các
                                           provider khác

  **Channels**                             Xem và cấu hình tất cả các kênh IM (WeChat, Telegram, Discord, Feishu, DingTalk,
                                           Slack, QQ, WhatsApp, Email, Matrix, MoChat); WeChat hỗ trợ đăng nhập bằng QR
                                           code trực tiếp từ UI

  **MCP Servers**                          Quản lý các tool server theo chuẩn Model Context Protocol

  **Skills**                               Bật / tắt các skill của agent; chỉnh sửa workspace skill trực tiếp trên trình
                                           duyệt

  **Cron Jobs**                            Lên lịch, chỉnh sửa và bật/tắt các tác vụ lặp lại

  **Agent Settings**                       Cấu hình model, temperature, max tokens, memory window, đường dẫn workspace,
                                           v.v.

  **Users**                                Quản lý nhiều người dùng với role `admin` / `user`

  **PWA**                                  Có thể cài đặt như ứng dụng desktop / home-screen; tự động phát hiện cập nhật và
                                           gợi ý reload chỉ với một click

  **Mobile-ready**                         Layout responsive với fix riêng cho bàn phím iOS Safari để luôn hiển thị ô nhập
                                           liệu

  **Dark mode**                            Chuyển đổi light / dark chỉ với một click; mặc định theo system preference khi
                                           truy cập lần đầu

  **i18n**                                 Hỗ trợ 9 ngôn ngữ UI:
                                           中文、繁體中文、English、日本語、한국어、Deutsch、Français、Português、Español
                                           --- tự động phát hiện theo ngôn ngữ / timezone của trình duyệt
  -------------------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## Bắt đầu nhanh

### pip install (khuyến nghị)

``` bash
pip install nanobot-webui
```

> **Nâng cấp từ version cũ?** Gỡ cả hai package trước để tránh xung đột:
>
> ``` bash
> pip uninstall -y nanobot-webui nanobot
> pip install nanobot-webui
> ```

Frontend React đã được build sẵn trong package --- **không cần
Node.js**.\
Sau khi cài đặt, sử dụng lệnh `nanobot` để khởi động WebUI:

``` bash
# Chạy foreground (WebUI + gateway)
nanobot webui start

# Chỉ định port tùy chỉnh
nanobot webui start --port 9090

# Chạy nền (daemon) - khuyến nghị cho môi trường production
nanobot webui start -d
```

Mở **http://localhost:18780** --- thông tin đăng nhập mặc định: **admin
/ nanobot** --- hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên.

------------------------------------------------------------------------

### uv (khuyến nghị cho môi trường tách biệt)

``` bash
uv tool install nanobot-webui
```

> **Nâng cấp?**
>
> ``` bash
> uv tool upgrade nanobot-webui
> ```

Lệnh `uv tool install` sẽ cài `nanobot` vào một virtual environment tách
biệt do uv quản lý (`~/.local/share/uv/tools/nanobot-webui/`) và tạo
symlink executable vào `~/.local/bin/`.\
Mọi thứ còn lại (cách khởi động, option, port mặc định) giống hoàn toàn
với cách cài bằng pip ở trên.

---

## Docker

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

Mở **http://localhost:18780** --- tài khoản mặc định: **admin /
nanobot**.

> **Thư mục dữ liệu:** toàn bộ config, session và workspace được lưu tại
> `~/.nanobot` trên host (map tới `/root/.nanobot` trong container).

------------------------------------------------------------------------

### Biến môi trường (Environment Variables)

Tất cả option khi khởi động đều có thể cấu hình qua biến môi trường:

  -----------------------------------------------------------------------
  Biến                    Mặc định                Mô tả
  ----------------------- ----------------------- -----------------------
  `WEBUI_PORT`            `18780`                 Cổng HTTP

  `WEBUI_HOST`            `0.0.0.0`               Địa chỉ bind

  `WEBUI_LOG_LEVEL`       `DEBUG`                 Mức log

  `WEBUI_WORKSPACE`       *(mặc định nanobot)*    Override thư mục
                                                  workspace

  `WEBUI_CONFIG`          *(mặc định nanobot)*    Đường dẫn config.json

  `WEBUI_ONLY`            ---                     Chỉ chạy WebUI (bỏ IM
                                                  channel)
  -----------------------------------------------------------------------

------------------------------------------------------------------------

### Option 2 --- Build từ source

``` bash
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui

docker build -t nanobot-webui .

docker run -d   --name nanobot-webui   -p 18780:18780   -v ~/.nanobot:/root/.nanobot   --restart unless-stopped   nanobot-webui
```

------------------------------------------------------------------------

## CLI Reference

Cài đặt `nanobot-webui` sẽ mở rộng CLI `nanobot` với các lệnh sau:

### Khởi động WebUI

``` bash
nanobot webui start
nanobot webui start --port 9090
nanobot webui start -d
```

### Dừng service

``` bash
nanobot webui stop
```

### Trạng thái

``` bash
nanobot webui status
```

### Khởi động lại

``` bash
nanobot webui restart
```

### Xem log

``` bash
nanobot webui logs
nanobot webui logs -f
```

> File log: `~/.nanobot/webui.log`

------------------------------------------------------------------------

## Development

**Yêu cầu:** Python ≥ 3.11, Bun ≥ 1.0, uv

``` bash
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui

uv venv
uv pip install -e .

uv run webui
```

Frontend:

``` bash
cd web
bun install
bun dev
```

Build production:

``` bash
cd web
bun run build
cd ..
uv run nanobot webui
```

---

## Kiến trúc

    nanobot-webui/
    ├── webui/                      # Python package (import dưới dạng `webui`)
    │   ├── api/                    # Backend FastAPI
    │   ├── web/                    # Frontend React đã build
    │   ├── patches/                # Monkey-patch runtime (không xâm lấn)
    │   └── utils/                  # Cấu hình và tiện ích
    ├── web/                        # Source frontend React
    ├── Dockerfile
    ├── docker-compose.yml
    ├── pyproject.toml
    └── setup.py

**Nguyên tắc thiết kế:** Backend hoàn toàn **non-invasive** --- chỉ
import thư viện nanobot, không sửa source.\
Các monkey-patch runtime được giữ ở mức tối thiểu và chỉ nhằm cải thiện
trải nghiệm (quality-of-life).

------------------------------------------------------------------------

## Xác thực

  ---------------------------------------------------------------------------
  Thành phần                                Giá trị
  ----------------------------------------- ---------------------------------
  Tài khoản mặc định                        `admin` / `nanobot`

  Lưu trữ credential                        `~/.nanobot/webui_users.json`
                                            (hash bằng bcrypt)

  Loại token                                JWT (HS256)

  Thời hạn token                            7 ngày

  JWT secret                                Tự sinh theo instance
                                            (`~/.nanobot/webui_secret.key`)
  ---------------------------------------------------------------------------

> **Lưu ý bảo mật:** đổi mật khẩu mặc định ngay sau lần đăng nhập đầu
> tiên.

------------------------------------------------------------------------

## Tech Stack

  Layer                Công nghệ
  -------------------- ------------------------------
  Backend framework    FastAPI + Uvicorn
  Auth                 PyJWT + bcrypt
  Frontend framework   React 18 + TypeScript + Vite
  UI                   shadcn/ui + Tailwind CSS
  Client state         Zustand
  Server state         TanStack Query
  i18n                 react-i18next
  Theme                next-themes
  Realtime             WebSocket (`/ws/chat`)
  Package manager      Bun

------------------------------------------------------------------------

## Ghi chú

-   Toàn bộ dữ liệu nằm trong `~/.nanobot`
-   Không chạy nhiều instance trên cùng channel
-   Khuyến nghị deploy bằng Docker hoặc chạy daemon
