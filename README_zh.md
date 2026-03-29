# Nanobot WebUI

**[English](README.md)** | 中文

---

[nanobot](https://github.com/HKUDS/nanobot)（[PyPI](https://pypi.org/project/nanobot-ai/)）的自托管 Web 管理面板，提供完整的 UI 界面用于配置、对话和管理 nanobot 实例，无需修改核心库任何代码。

![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
[![GitHub](https://img.shields.io/badge/nanobot-GitHub-181717?logo=github)](https://github.com/HKUDS/nanobot)

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
  - [pip 安装（推荐）](#pip-安装推荐)
  - [Docker](#docker)
- [微信通道](#微信通道)
- [命令行参考](#命令行参考)
- [开发模式](#开发模式)
- [项目结构](#项目结构)
- [认证说明](#认证说明)
- [技术栈](#技术栈)

---

## 界面预览

**桌面端**

| 登录页 | 仪表板 | 对话 |
|--------|--------|------|
| ![登录页](docs/login.png) | ![仪表板](docs/dashboard.png) | ![对话](docs/session.png) |

**移动端**

| 仪表板 | 对话 | 会话 |
|--------|------|------|
| ![移动端仪表板](docs/mobile_dashboard.png) | ![移动端对话](docs/mobile_chat.png) | ![移动端会话](docs/mobile_session.jpg) |

---

## 功能特性

| 模块 | 说明 |
|------|------|
| **仪表板** | 通道健康状态、会话 / 技能 / 定时任务统计一览 |
| **会话** | 通过 WebSocket 与 Agent 实时对话 |
| **模型提供商** | 配置 OpenAI、Anthropic、DeepSeek、Azure 等的 API Key 和地址 |
| **通道** | 查看和配置所有 IM 通道（微信、Telegram、Discord、飞书、钉钉、Slack、QQ、WhatsApp、邮件、Matrix、企业微信）；微信支持直接在 UI 中扫码登录 |
| **MCP 工具服务器** | 管理 Model Context Protocol 工具服务器 |
| **技能** | 启用 / 禁用 Agent 技能，在线编辑工作区技能 |
| **定时任务** | 新建、编辑、启停定时任务 |
| **代理设置** | 模型、温度、最大 Token、记忆窗口、工作区路径等 |
| **用户管理** | 多用户管理，支持 `admin` / `user` 两种角色 |
| **PWA 支持** | 可安装为桌面 / 主屏幕应用；后台自动检测新版本并提示一键更新 |
| **移动端适配** | 响应式布局，针对 iOS Safari 键盘弹出做专项适配，确保输入框始终可见 |
| **深色模式** | 亮色 / 暗色一键切换，首次访问自动跟随系统偏好；暗色方案采用暖色调以匹配品牌色 |
| **多语言（i18n）** | 内置 7 套界面语言：中文、繁體中文、English、日本語、한국어、Deutsch、Français，自动根据浏览器语言 / 时区检测，支持子菜单实时切换 |

---

## 快速开始

### pip 安装（推荐）

```bash
pip install nanobot-webui
```

> **从旧版本升级？** 请先卸载旧版本以避免冲突：
> ```bash
> pip uninstall -y nanobot-webui nanobot
> pip install nanobot-webui
> ```

wheel 包内已内嵌编译好的 React 前端，**无需安装 Node.js**，安装后直接使用 `nanobot` 命令启动。

```bash
# 前台启动（WebUI + nanobot 网关一体化）
nanobot webui start

# 指定端口
nanobot webui start --port 9090

# 后台运行（推荐用于长期部署）
nanobot webui start -d
```

浏览器访问 **http://localhost:18780** - 默认账号：**admin / nanobot**，首次登录后请立即修改密码。

---

### uv 安装（推荐用于隔离环境）

```bash
uv tool install nanobot-webui
```

> **升级？**
> ```bash
> uv tool upgrade nanobot-webui
> ```

`uv tool install` 会将 `nanobot` 安装到 uv 自己管理的隔离虚拟环境（`~/.local/share/uv/tools/nanobot-webui/`），可执行文件自动链接到 `~/.local/bin/`，不会影响当前项目工作区或系统 Python 环境。启动方式、可用选项、默认端口与 pip 安装完全一致。

---

### Docker

**前置条件：** Docker ≥ 24（含 Compose 插件，即 `docker compose` 命令）。

#### 方式一 — Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
services:
  webui:
    image: kangkang223/nanobot-webui:latest
    container_name: nanobot-webui
    volumes:
      - ~/.nanobot:/root/.nanobot   # 配置与数据持久化
    ports:
      - "18780:18780"    # WebUI
    restart: unless-stopped
```

然后执行：

```bash
# 拉取最新镜像并在后台启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

浏览器访问 **http://localhost:18780** — 默认账号：**admin / nanobot**，请在首次登录后立即修改密码。

> **数据目录：** 所有配置、会话及工作区文件保存在宿主机的 `~/.nanobot` 目录（映射到容器内的 `/root/.nanobot`）。

#### 环境变量

所有启动参数均可通过环境变量配置，便于在 Docker Compose 中灵活覆盖：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `WEBUI_PORT` | `18780` | HTTP 监听端口 |
| `WEBUI_HOST` | `0.0.0.0` | 绑定地址 |
| `WEBUI_LOG_LEVEL` | `DEBUG` | 日志级别：`DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `WEBUI_WORKSPACE` | _（nanobot 默认值）_ | 覆盖工作区目录路径 |
| `WEBUI_CONFIG` | _（nanobot 默认值）_ | 指定 `config.json` 文件路径 |
| `WEBUI_ONLY` | — | 设为 `true` 时跳过 IM 通道启动（用于 nanobot 已通过 systemd 等方式独立运行的场景） |

`docker-compose.yml` 示例：

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

#### 方式二 — 本地构建镜像

```bash
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui

# 多阶段构建（bun 编译前端 → python 运行时）
docker build -t nanobot-webui .

# 运行
docker run -d \
  --name nanobot-webui \
  -p 18780:18780 \
  -v ~/.nanobot:/root/.nanobot \
  --restart unless-stopped \
  nanobot-webui
```

#### 方式三 — Makefile 快捷命令

克隆仓库后可直接使用内置 `Makefile`：

```bash
make up             # docker compose up -d
make down           # docker compose down
make logs           # 跟踪 compose 日志
make restart        # docker compose restart
make build          # 构建本地单架构镜像
make release-dated  # 构建并推送 :YYYY-MM-DD + :latest（多架构）
```

---

## 命令行参考

安装 `nanobot-webui` 后，`nanobot` 命令会新增以下子命令（`nanobot webui --help` 可查看完整列表）：

### `nanobot webui start` — 启动 WebUI

```
用法: nanobot webui start [OPTIONS]

选项:
  -p, --port INTEGER        HTTP 端口（默认: 18780）
      --host TEXT           绑定地址（默认: 0.0.0.0）
  -w, --workspace PATH      覆盖工作区目录
  -c, --config PATH         指定配置文件路径
  -d, --daemon              后台运行（Daemon 模式）
  -l, --log-level TEXT      日志级别: DEBUG / INFO / WARNING / ERROR（默认: DEBUG）
      --webui-only          仅启动 WebUI HTTP 服务和 Agent（供 WebSocket 聊天使用），
                            不启动 IM 通道和心跳服务。适用于 nanobot 已通过 systemd
                            等方式独立运行的场景，避免两个进程争抢同一 IM 通道连接。
```

```bash
nanobot webui start                          # 前台启动（Ctrl-C 停止）
nanobot webui start --port 9090              # 自定义端口
nanobot webui start -d                       # 后台启动（推荐长期运行）
nanobot webui start -d --port 9090           # 后台 + 自定义端口
nanobot webui start --workspace ~/myproject  # 指定工作区
nanobot webui start --webui-only             # 仅 WebUI，nanobot 由系统服务管理
nanobot webui start -d --webui-only          # 后台 + 仅 WebUI 模式
```

浏览器访问 **http://localhost:18780** — 默认账号：**admin / nanobot**，首次登录后请立即修改密码。

### `nanobot webui stop` — 停止后台服务

```bash
nanobot webui stop    # 发送 SIGTERM，6s 后强制 SIGKILL
```

### `nanobot webui status` — 查看服务状态

```bash
nanobot webui status  # 运行状态、PID、访问地址和日志路径
```

### `nanobot webui restart` — 重启后台服务

```bash
nanobot webui restart              # 停止后后台重启（复用当前端口）
nanobot webui restart --port 9090  # 重启并切换端口
```

### `nanobot webui logs` — 查看日志

```
用法: nanobot webui logs [OPTIONS]

选项:
  -f, --follow          实时跟踪日志（类似 tail -f）
  -n, --lines INTEGER   显示最近 N 行（默认: 50）
```

```bash
nanobot webui logs              # 查看最近 50 行
nanobot webui logs -f           # 实时跟踪
nanobot webui logs -f -n 100    # 实时跟踪，显示最近 100 行
```

> 日志文件位于 `~/.nanobot/webui.log`

### `nanobot channels login` — 通道扫码登录

```bash
nanobot channels login weixin          # 微信扫码登录
nanobot channels login weixin --force  # 强制重新登录（清除已保存的凭证）
```

在终端打印 ASCII 二维码，用手机微信扫描完成登录。登录成功后将 Bot Token 保存到 `~/.nanobot/weixin/account.json`。

> 适用于无界面服务器场景。WebUI 通道页面提供相同的登录流程，并显示图形二维码。

---

### `nanobot status` — 查看运行状态

```bash
nanobot status  # 显示 WebUI 进程状态 + nanobot 配置信息
```

示例输出：

```
🐈 nanobot Status

WebUI: ✓ running (PID 12345 • http://localhost:18780)
Log  : /Users/xxx/.nanobot/webui.log

Config: /Users/xxx/.nanobot/config.json ✓
Workspace: /Users/xxx/.nanobot/workspace ✓
Model: gpt-4o
...
```

> **进程状态文件：** PID → `~/.nanobot/webui.pid`，端口 → `~/.nanobot/webui.port`

---

## 开发模式

**前置条件：** Python ≥ 3.11，[Bun](https://bun.sh) ≥ 1.0

```bash
# 1. 克隆仓库并以可编辑模式安装后端
git clone https://github.com/Good0007/nanobot-webui.git
cd nanobot-webui
uv venv               # 创建虚拟环境——不要修改中央 Python 安装。
uv pip install -e .

# 2. 启动后端
uv run webui                          # API + 静态文件服务于 :18780

# 3. 启动前端开发服务器（另开终端）
cd web
bun install
bun dev                              # http://localhost:5173（自动代理 /api → :18780）
```

生产构建：

```bash
cd web
bun run build          # 产物输出到 web/dist/，setup.py 自动复制到 webui/web/dist/
cd ..
nanobot webui          # 后端自动 serve webui/web/dist/
```

---

## 项目结构

```
nanobot-webui/
├── webui/                      # Python 包（可作为 `webui` 导入）
│   ├── __init__.py
│   ├── __main__.py             # 入口：python -m webui
│   ├── cli.py                  # 注入到 nanobot CLI 的 Typer 子命令
│   ├── channels/               # 通道插件（通过 entry-points 注册）
│   │   └── weixin.py           #   微信通道（基于 iLink 的扫码登录）
│   ├── web/
│   │   └── dist/               # 编译后的 React 静态资源（由 bun run build 生成）
│   ├── api/                    # FastAPI 后端
│   │   ├── auth.py             # JWT + bcrypt 工具
│   │   ├── users.py            # 用户存储（~/.nanobot/webui_users.json）
│   │   ├── deps.py             # FastAPI 依赖注入
│   │   ├── gateway.py          # ServiceContainer + 服务生命周期
│   │   ├── server.py           # FastAPI 应用工厂（静态托管、SPA 回退）
│   │   ├── channel_ext.py      # ExtendedChannelManager（非侵入式子类）
│   │   ├── middleware.py       # 请求中间件（日志、CORS 等）
│   │   ├── models.py           # Pydantic 响应模型
│   │   ├── provider_meta.py    # 提供商元数据与能力注册表
│   │   └── routes/             # 按业务域拆分的路由文件
│   │       ├── auth.py         #   POST /api/auth/login|register|change-password
│   │       ├── channels.py     #   GET|PATCH /api/channels（含微信 QR 接口）
│   │       ├── config.py       #   GET|PATCH /api/config
│   │       ├── cron.py         #   CRUD /api/cron
│   │       ├── mcp.py          #   GET|PATCH /api/mcp
│   │       ├── openai_proxy.py #   OpenAI 兼容代理 /api/v1/...
│   │       ├── providers.py    #   GET|PATCH /api/providers
│   │       ├── sessions.py     #   GET|DELETE /api/sessions
│   │       ├── skills.py       #   GET|POST /api/skills
│   │       ├── users.py        #   CRUD /api/users（仅管理员）
│   │       └── ws.py           #   WebSocket /ws/chat
│   ├── patches/                # 最小化运行时 monkey-patch（非侵入式）
│   │   ├── channels.py         #   空 allow_from → 允许所有人
│   │   ├── mcp_dynamic.py      #   MCP 服务器动态启用/禁用
│   │   ├── provider.py         #   提供商热重载支持
│   │   ├── session.py          #   会话持久化调整
│   │   ├── skills.py           #   技能热重载助手
│   │   └── subagent.py         #   子 Agent 路由修复
│   └── utils/
│       └── webui_config.py     # 统一 WebUI 配置存储（~/.nanobot/webui_config.json）
├── web/                        # React 18 + TypeScript 前端源码
│   ├── src/
│   │   ├── pages/              # 每个路由对应一个页面组件
│   │   │   ├── Channels.tsx    #   IM 通道配置（含微信扫码登录）
│   │   │   └── ...             #   Chat / Dashboard / Settings 等
│   │   ├── components/         # 布局、聊天、通用 UI 组件
│   │   ├── hooks/              # TanStack Query 数据钩子
│   │   ├── stores/             # Zustand 状态（认证、聊天）
│   │   ├── lib/                # axios 实例、WebSocket 管理器、工具函数
│   │   ├── i18n/               # 国际化（中 / 英 / 日 等）
│   │   └── theme/              # next-themes 配置
│   ├── eslint.config.js
│   └── package.json
├── Dockerfile                  # 多阶段构建：bun 编译前端 → Python 运行时
├── docker-compose.yml
├── pyproject.toml
└── setup.py                    # 构建 hook：自动运行 bun run build 并将 dist 复制到 webui/
```

**设计原则：** 后端完全非侵入式——仅导入 nanobot 库，不修改其源码。运行时的 monkey-patch（在 `webui/patches/` 中）仅限于体验优化，启动时一次性应用，不影响核心库初始化。

---

## 认证说明

| 项目 | 值 |
|------|----|
| 默认账号密码 | `admin` / `nanobot` |
| 凭证存储位置 | `~/.nanobot/webui_users.json`（密码 bcrypt 哈希） |
| Token 类型 | JWT（HS256） |
| Token 有效期 | 7 天 |
| JWT 密钥 | 每个实例自动生成，存储于 `~/.nanobot/webui_secret.key` |

> **安全提示：** 首次登录后请立即修改默认密码。

---

## 技术栈

| 层次 | 库 / 工具 |
|------|-----------|
| 后端框架 | FastAPI + Uvicorn |
| 认证 | PyJWT + bcrypt |
| 前端框架 | React 18 + TypeScript + Vite |
| UI 组件 | shadcn/ui + Tailwind CSS v3 |
| 客户端状态 | Zustand（含持久化中间件） |
| 服务端状态 | TanStack Query v5 |
| 国际化 | react-i18next（中 / 英） |
| 主题 | next-themes（亮色 / 暗色 / 跟随系统） |
| 实时通信 | WebSocket（`/ws/chat`） |
| 包管理器 | Bun |
