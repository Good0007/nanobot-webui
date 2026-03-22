"""
Inject a ``webui`` sub-command into the nanobot Typer CLI.

After installing nanobot-webui the user can run:

    nanobot webui                     # start webui + gateway on default ports
    nanobot webui --port 9090         # custom WebUI port
    nanobot webui --no-gateway        # webui only (external/already-running gateway)
    nanobot webui --workspace ~/work  # override workspace

The original ``nanobot`` entry point is shadowed by this module so that the
webui sub-command appears alongside the built-in ones (gateway, agent, onboard).
All existing commands continue to work unchanged.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

import typer

# ── Grab the canonical nanobot Typer app ─────────────────────────────────────
from nanobot.cli.commands import app

# ── Daemon / process-tracking helpers ────────────────────────────────────────

def _pid_file() -> Path:
    return Path.home() / ".nanobot" / "webui.pid"


def _port_file() -> Path:
    return Path.home() / ".nanobot" / "webui.port"


def _log_file() -> Path:
    return Path.home() / ".nanobot" / "webui.log"


def _is_webui_running() -> tuple[bool, int | None]:
    """Return (is_running, pid).  Cleans up a stale PID file if found."""
    pf = _pid_file()
    if not pf.exists():
        return False, None
    try:
        pid = int(pf.read_text().strip())
        os.kill(pid, 0)   # signal 0 = just probe existence
        return True, pid
    except (ValueError, ProcessLookupError, PermissionError):
        pf.unlink(missing_ok=True)
        return False, None


# ── Override `status` to include WebUI process info ──────────────────────────

# Remove the built-in status command so we can replace it.
app.registered_commands = [
    c for c in app.registered_commands
    if not (
        c.name == "status"
        or (c.name is None and getattr(c.callback, "__name__", "") == "status")
    )
]


@app.command("status")
def status() -> None:
    """Show nanobot status (including WebUI)."""
    from nanobot import __logo__
    from nanobot.config.loader import get_config_path, load_config
    from rich.console import Console

    _con = Console()
    config_path = get_config_path()
    config = load_config()
    workspace = config.workspace_path

    _con.print(f"{__logo__} nanobot Status\n")

    # ── WebUI service status ──────────────────────────────────────────────────
    running, pid = _is_webui_running()
    if running:
        port_str = (
            _port_file().read_text().strip() if _port_file().exists() else "?"
        )
        _con.print(
            f"WebUI: [green]\u2713 running[/green] "
            f"(PID {pid} \u2022 http://localhost:{port_str})"
        )
        _con.print(f"Log  : {_log_file()}")
    else:
        _con.print("WebUI: [dim]not running[/dim]")

    _con.print()

    # ── nanobot core status (replicated from nanobot.cli.commands.status) ─────
    _OK = "[green]\u2713[/green]"
    _NG = "[red]\u2717[/red]"
    _DIM = "[dim]not set[/dim]"
    _con.print(f"Config: {config_path} {_OK if config_path.exists() else _NG}")
    _con.print(f"Workspace: {workspace} {_OK if workspace.exists() else _NG}")

    if config_path.exists():
        from nanobot.providers.registry import PROVIDERS

        _con.print(f"Model: {config.agents.defaults.model}")

        for spec in PROVIDERS:
            p = getattr(config.providers, spec.name, None)
            if p is None:
                continue
            if spec.is_oauth:
                _con.print(f"{spec.label}: [green]\u2713 (OAuth)[/green]")
            elif spec.is_local:
                if p.api_base:
                    _con.print(f"{spec.label}: [green]\u2713 {p.api_base}[/green]")
                else:
                    _con.print(f"{spec.label}: {_DIM}")
            else:
                _con.print(f"{spec.label}: {_OK if p.api_key else _DIM}")


# ── `webui` sub-app (supports `nanobot webui` and `nanobot webui logs`) ───────

webui_app = typer.Typer(
    name="webui",
    help="Manage the nanobot WebUI.",
    invoke_without_command=True,
    no_args_is_help=False,
)
app.add_typer(webui_app, name="webui")


@webui_app.callback(invoke_without_command=True)
def webui(
    ctx: typer.Context,
    port: int = typer.Option(18780, "--port", "-p", help="WebUI HTTP port (default: 18780)"),
    gateway_port: Optional[int] = typer.Option(
        None, "--gateway-port", "-g",
        help="nanobot gateway port (default: read from ~/.nanobot/config.json)",
    ),
    host: str = typer.Option("0.0.0.0", "--host", help="Bind address for WebUI"),
    workspace: Optional[str] = typer.Option(
        None, "--workspace", "-w", help="Override workspace directory"
    ),
    config_path: Optional[str] = typer.Option(
        None, "--config", "-c", help="Path to config file"
    ),
    no_gateway: bool = typer.Option(
        False, "--no-gateway",
        help="Start WebUI only; do NOT start the nanobot gateway/agent (useful when "
             "the gateway is already running externally)",
    ),
    daemon: bool = typer.Option(
        False, "--daemon", "-d",
        help="Run in the background and return immediately. "
             "PID written to ~/.nanobot/webui.pid, logs to ~/.nanobot/webui.log.",
    ),
    log_level: str = typer.Option(
        "DEBUG", "--log-level", "-l",
        help="Log level: DEBUG, INFO, WARNING, ERROR (default: DEBUG)",
    ),
):
    """Start the nanobot WebUI (and optionally the gateway) in a single process."""
    if ctx.invoked_subcommand is not None:
        return  # a subcommand (e.g. logs) is handling the request

    if daemon:
        _start_daemon(
            port=port,
            gateway_port=gateway_port,
            host=host,
            workspace=workspace,
            config_path=config_path,
            no_gateway=no_gateway,
            log_level=log_level,
        )
        return

    # Apply webui patches before importing nanobot internals
    from webui.__main__ import _apply_patches, main as _run_all
    _apply_patches()

    if no_gateway:
        # Minimal mode: webui HTTP server only, no agent/channels.
        # The user is expected to have a nanobot gateway running separately.
        from nanobot.config.loader import load_config, set_config_path
        from pathlib import Path as _Path

        if config_path:
            set_config_path(_Path(config_path).expanduser().resolve())

        cfg = load_config()
        if workspace:
            cfg.agents.defaults.workspace = workspace

        # Build a full container in read-only mode (no bus/agent tasks started)
        from webui.__main__ import _apply_patches, _make_provider
        _apply_patches()

        from nanobot.bus.queue import MessageBus
        from nanobot.cron.service import CronService
        from nanobot.config.paths import get_cron_dir
        from nanobot.session.manager import SessionManager
        from nanobot.heartbeat.service import HeartbeatService
        from nanobot.agent.loop import AgentLoop
        from nanobot.utils.helpers import sync_workspace_templates
        from webui.api.channel_ext import ExtendedChannelManager
        from webui.api.gateway import ServiceContainer, start_api_server

        sync_workspace_templates(cfg.workspace_path)
        bus = MessageBus()
        provider = _make_provider(cfg)
        from nanobot.providers.base import GenerationSettings
        provider.generation = GenerationSettings(
            temperature=cfg.agents.defaults.temperature,
            max_tokens=cfg.agents.defaults.max_tokens,
            reasoning_effort=cfg.agents.defaults.reasoning_effort,
        )
        session_manager = SessionManager(cfg.workspace_path)
        cron_store_path = get_cron_dir() / "jobs.json"
        cron = CronService(cron_store_path)
        channels = ExtendedChannelManager(cfg, bus)
        hb_cfg = cfg.gateway.heartbeat
        heartbeat = HeartbeatService(
            workspace=cfg.workspace_path,
            provider=provider,
            model=cfg.agents.defaults.model,
            on_execute=lambda tasks: None,   # type: ignore[arg-type]
            on_notify=lambda resp: None,     # type: ignore[arg-type]
            interval_s=hb_cfg.interval_s,
            enabled=False,
        )
        agent = AgentLoop(
            bus=bus,
            provider=provider,
            workspace=cfg.workspace_path,
            model=cfg.agents.defaults.model,
            max_iterations=cfg.agents.defaults.max_tool_iterations,
            context_window_tokens=cfg.agents.defaults.context_window_tokens,
            web_search_config=cfg.tools.web.search,
            web_proxy=cfg.tools.web.proxy or None,
            exec_config=cfg.tools.exec,
            cron_service=cron,
            restrict_to_workspace=cfg.tools.restrict_to_workspace,
            session_manager=session_manager,
            mcp_servers=cfg.tools.mcp_servers,
            channels_config=cfg.channels,
        )
        container = ServiceContainer(
            config=cfg, bus=bus, agent=agent, channels=channels,
            session_manager=session_manager, cron=cron, heartbeat=heartbeat,
            make_provider=_make_provider,
        )
        typer.echo(f"Starting nanobot WebUI (UI only, no gateway) on http://{host}:{port}")
        asyncio.run(start_api_server(container, host=host, port=port))
    else:
        # Full mode: webui + gateway + agent + channels (same as python -m webui)
        if config_path:
            from nanobot.config.loader import set_config_path
            from pathlib import Path
            set_config_path(Path(config_path).expanduser().resolve())

        asyncio.run(_run_all(
            web_port=port,
            gateway_port=gateway_port,
            web_host=host,
            workspace=workspace,
            log_level=log_level,
        ))


@webui_app.command("logs")
def webui_logs(
    follow: bool = typer.Option(False, "--follow", "-f", help="Follow log output (like tail -f)"),
    lines: int = typer.Option(50, "--lines", "-n", help="Number of lines to show (default: 50)"),
) -> None:
    """View the WebUI log file."""
    log = _log_file()
    if not log.exists():
        typer.echo(f"Log file not found: {log}")
        raise typer.Exit(1)

    if follow:
        import subprocess
        try:
            subprocess.run(["tail", "-f", "-n", str(lines), str(log)])
        except KeyboardInterrupt:
            pass
    else:
        import subprocess
        subprocess.run(["tail", "-n", str(lines), str(log)])


# ── `weixin` sub-app (`nanobot weixin login`) ─────────────────────────────────

weixin_app = typer.Typer(
    name="weixin",
    help="Manage WeChat (微信) channel.",
    invoke_without_command=True,
    no_args_is_help=True,
)
app.add_typer(weixin_app, name="weixin")


@weixin_app.command("login")
def weixin_login() -> None:
    """Log in to WeChat via QR code and save the bot token."""
    import asyncio as _asyncio

    import httpx as _httpx
    from rich.console import Console as _Console

    con = _Console()

    async def _do_login() -> None:
        from nanobot.config.paths import get_runtime_subdir
        import base64 as _b64
        import json as _json
        import os as _os

        state_dir = get_runtime_subdir("weixin")
        state_dir.mkdir(parents=True, exist_ok=True)
        state_file = state_dir / "account.json"

        BASE_URL = "https://ilinkai.weixin.qq.com"
        BASE_INFO = {"channel_version": "1.0.2"}

        def _headers() -> dict:
            uin = _b64.b64encode(str(int.from_bytes(_os.urandom(4), "big")).encode()).decode()
            return {
                "X-WECHAT-UIN": uin,
                "Content-Type": "application/json",
                "AuthorizationType": "ilink_bot_token",
            }

        async with _httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            con.print("[bold]微信登录 — 获取二维码...[/bold]")
            resp = await client.get(
                f"{BASE_URL}/ilink/bot/get_bot_qrcode",
                params={"bot_type": "3"},
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()

            qrcode_id = data.get("qrcode", "")
            scan_url = data.get("qrcode_img_content") or qrcode_id
            if not qrcode_id:
                con.print(f"[red]获取二维码失败: {data}[/red]")
                return

            # Print QR code in terminal
            try:
                import qrcode as _qr
                qr = _qr.QRCode(border=1)
                qr.add_data(scan_url)
                qr.make(fit=True)
                qr.print_ascii(invert=True)
            except ImportError:
                con.print(f"[dim]登录 URL (安装 qrcode 包可显示二维码): {scan_url}[/dim]")

            con.print("[bold]请用微信扫描上方二维码[/bold]")

            while True:
                await _asyncio.sleep(1)
                s_resp = await client.get(
                    f"{BASE_URL}/ilink/bot/get_qrcode_status",
                    params={"qrcode": qrcode_id},
                    headers={**_headers(), "iLink-App-ClientVersion": "1"},
                )
                s_resp.raise_for_status()
                s = s_resp.json()
                status = s.get("status", "")

                if status == "scaned":
                    con.print("[yellow]已扫码，请在手机上确认...[/yellow]")
                elif status == "confirmed":
                    token = s.get("bot_token", "")
                    base_url = s.get("baseurl", BASE_URL)
                    if not token:
                        con.print("[red]登录确认但未收到 token[/red]")
                        return
                    state_file.write_text(_json.dumps({
                        "token": token,
                        "get_updates_buf": "",
                        "base_url": base_url,
                    }, ensure_ascii=False))
                    con.print(f"[green]✓ 微信登录成功！Token 已保存到 {state_file}[/green]")
                    con.print("[dim]重启 nanobot 或在 WebUI 通道页点击重载即可生效。[/dim]")
                    return
                elif status == "expired":
                    con.print("[red]二维码已过期，请重新运行 nanobot weixin login[/red]")
                    return

    _asyncio.run(_do_login())


# ── `stop` command ────────────────────────────────────────────────────────────


@app.command("stop")
def stop() -> None:
    """Stop the background nanobot WebUI process."""
    running, pid = _is_webui_running()
    if not running:
        typer.echo("nanobot WebUI is not running.")
        raise typer.Exit(0)

    import signal as _signal
    try:
        os.kill(pid, _signal.SIGTERM)
        # Wait briefly for graceful shutdown
        import time
        for _ in range(30):
            time.sleep(0.2)
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
        else:
            # Force kill if still alive after 6s
            try:
                os.kill(pid, _signal.SIGKILL)
            except ProcessLookupError:
                pass
    except ProcessLookupError:
        pass

    # Clean up state files
    _pid_file().unlink(missing_ok=True)
    _port_file().unlink(missing_ok=True)
    typer.echo(f"\u2713 nanobot WebUI stopped (PID {pid})")


# ── Daemon launcher ─────────────────────────────────────────────────────────

def _start_daemon(
    port: int,
    gateway_port: Optional[int],
    host: str,
    workspace: Optional[str],
    config_path: Optional[str],
    no_gateway: bool,
    log_level: str = "DEBUG",
) -> None:
    """Spawn a detached nanobot-webui process and record its PID."""
    import shutil
    import subprocess

    # Check for an already-running instance
    running, old_pid = _is_webui_running()
    if running:
        old_port = _port_file().read_text().strip() if _port_file().exists() else "?"
        typer.echo(
            f"nanobot WebUI is already running (PID {old_pid}, "
            f"http://localhost:{old_port})"
        )
        typer.echo("Stop it first with:  kill " + str(old_pid))
        raise typer.Exit(1)

    # Build the child command — re-invoke *this* entry point without --daemon
    nanobot_exe = shutil.which("nanobot") or sys.argv[0]
    cmd: list[str] = [nanobot_exe, "webui", "--port", str(port), "--host", host]
    if gateway_port is not None:
        cmd += ["--gateway-port", str(gateway_port)]
    if workspace:
        cmd += ["--workspace", workspace]
    if config_path:
        cmd += ["--config", config_path]
    if no_gateway:
        cmd += ["--no-gateway"]
    if log_level and log_level.upper() != "DEBUG":
        cmd += ["--log-level", log_level]
    # Note: --daemon is intentionally omitted so the child runs in the foreground

    log = _log_file()
    log.parent.mkdir(parents=True, exist_ok=True)

    with open(log, "a") as lf:
        proc = subprocess.Popen(
            cmd,
            stdout=lf,
            stderr=lf,
            stdin=subprocess.DEVNULL,
            start_new_session=True,   # detach from terminal / SIGHUP
        )

    _pid_file().write_text(str(proc.pid))
    _port_file().write_text(str(port))

    typer.echo(f"\u2713 nanobot WebUI started in background (PID {proc.pid})")
    typer.echo(f"  URL : http://localhost:{port}")
    typer.echo(f"  Log : {log}")
    typer.echo(f"  Stop: kill {proc.pid}")


# ── Entry points ─────────────────────────────────────────────────────────────

def run_nanobot() -> None:
    """Entry point for the ``nanobot`` command (with webui subcommand added)."""
    app()


def run_webui() -> None:
    """Entry point for the standalone ``nanobot-webui`` command."""
    parser = _make_standalone_parser()
    args = parser.parse_args()
    asyncio.run(
        _run_all_from_args(args)
    )


def _make_standalone_parser():
    import argparse
    p = argparse.ArgumentParser(
        prog="nanobot-webui",
        description="nanobot WebUI — start WebUI + gateway in one process",
    )
    p.add_argument("--port", type=int, default=18780, help="WebUI port (default: 18780)")
    p.add_argument("--gateway-port", type=int, default=None, dest="gateway_port",
                   help="nanobot gateway port (default: from config)")
    p.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    p.add_argument("--workspace", default=None, help="Override workspace directory")
    p.add_argument("--config", default=None, dest="config_path",
                   help="Path to config file")
    p.add_argument("--no-gateway", action="store_true", dest="no_gateway",
                   help="Start WebUI only (skip gateway/agent)")
    p.add_argument("--log-level", default="DEBUG", dest="log_level",
                   metavar="LEVEL",
                   help="Log level: DEBUG, INFO, WARNING, ERROR (default: DEBUG)")
    return p


async def _run_all_from_args(args) -> None:
    from webui.__main__ import _apply_patches, main as _run_all
    _apply_patches()

    if args.config_path:
        from nanobot.config.loader import set_config_path
        from pathlib import Path
        set_config_path(Path(args.config_path).expanduser().resolve())

    await _run_all(
        web_port=args.port,
        gateway_port=args.gateway_port,
        web_host=args.host,
        workspace=args.workspace,
        log_level=getattr(args, "log_level", "DEBUG"),
    )
