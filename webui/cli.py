"""CLI integration for nanobot-webui.

Preferred entrypoints:

    nanobot-webui start
    webui start

Compatibility entrypoint (only when this module is explicitly used as the
``nanobot`` command target):

    nanobot webui start

The package also keeps ``nanobot webui`` for backward compatibility with
existing users.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path
from typing import Optional

import typer

# ── Grab the canonical nanobot Typer app ─────────────────────────────────────
from nanobot.cli.commands import app, channels_app

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


# ── `webui` sub-app ─────────────────────────────────────────────────────────────

webui_app = typer.Typer(
    name="webui",
    help="Manage the nanobot WebUI.",
    no_args_is_help=True,
    context_settings={"help_option_names": ["-h", "--help"]},
)
app.add_typer(webui_app, name="webui")


@webui_app.callback()
def _webui_group(ctx: typer.Context) -> None:
    """Manage the nanobot WebUI."""
    pass


@webui_app.command("start")
def webui_start(
    port: int = typer.Option(18780, "--port", "-p", help="WebUI HTTP port (default: 18780)"),
    host: str = typer.Option("0.0.0.0", "--host", help="Bind address for WebUI"),
    workspace: Optional[str] = typer.Option(
        None, "--workspace", "-w", help="Override workspace directory"
    ),
    config_path: Optional[str] = typer.Option(
        None, "--config", "-c", help="Path to config file"
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
    webui_only: bool = typer.Option(
        False, "--webui-only",
        help="Start only the WebUI HTTP server and agent (for WebSocket chat). "
             "IM channels and heartbeat are NOT started — use this when nanobot "
             "is already running as a separate process (e.g. systemd service).",
    ),
) -> None:
    """Start the nanobot WebUI (foreground by default; use -d for background)."""
    if daemon:
        _start_daemon(
            port=port,
            host=host,
            workspace=workspace,
            config_path=config_path,
            log_level=log_level,
            webui_only=webui_only,
        )
        return

    # Foreground mode
    from webui.__main__ import _apply_patches, main as _run_all
    _apply_patches()

    if config_path:
        from nanobot.config.loader import set_config_path
        set_config_path(Path(config_path).expanduser().resolve())

    asyncio.run(_run_all(
        web_port=port,
        web_host=host,
        workspace=workspace,
        log_level=log_level,
        webui_only=webui_only,
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

    def _print_last_n(path: Path, n: int) -> int:
        try:
            all_lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            all_lines = []
        tail_lines = all_lines[-max(0, n):] if n > 0 else []
        for line in tail_lines:
            typer.echo(line)
        return len(all_lines)

    current_total = _print_last_n(log, lines)
    if not follow:
        return

    try:
        while True:
            time.sleep(0.5)
            try:
                all_lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue

            if len(all_lines) < current_total:
                # Log rotated/truncated: print from start.
                current_total = 0

            if len(all_lines) > current_total:
                for line in all_lines[current_total:]:
                    typer.echo(line)
                current_total = len(all_lines)
    except KeyboardInterrupt:
        pass


@webui_app.command("status")
def webui_status() -> None:
    """Show WebUI service status."""
    running, pid = _is_webui_running()
    if running:
        port_str = _port_file().read_text().strip() if _port_file().exists() else "?"
        typer.echo(f"\u2713 running  PID={pid}  http://localhost:{port_str}")
        typer.echo(f"  Log: {_log_file()}")
    else:
        typer.echo("\u2717 not running")


@webui_app.command("stop")
def webui_stop() -> None:
    """Stop the background WebUI process."""
    running, pid = _is_webui_running()
    if not running:
        typer.echo("nanobot WebUI is not running.")
        raise typer.Exit(0)

    import signal as _signal
    import time
    try:
        os.kill(pid, _signal.SIGTERM)
        for _ in range(30):
            time.sleep(0.2)
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
        else:
            try:
                sig_kill = getattr(_signal, "SIGKILL", _signal.SIGTERM)
                os.kill(pid, sig_kill)
            except ProcessLookupError:
                pass
    except ProcessLookupError:
        pass

    _pid_file().unlink(missing_ok=True)
    _port_file().unlink(missing_ok=True)
    typer.echo(f"\u2713 nanobot WebUI stopped (PID {pid})")


@webui_app.command("restart")
def webui_restart(
    port: int = typer.Option(18780, "--port", "-p", help="WebUI HTTP port (default: 18780)"),
    host: str = typer.Option("0.0.0.0", "--host", help="Bind address"),
    workspace: Optional[str] = typer.Option(None, "--workspace", "-w", help="Override workspace directory"),
    config_path: Optional[str] = typer.Option(None, "--config", "-c", help="Path to config file"),
    log_level: str = typer.Option("DEBUG", "--log-level", "-l", help="Log level"),
) -> None:
    """Restart the background WebUI process (stop then start)."""
    running, _ = _is_webui_running()
    if running:
        # Reuse the currently recorded port unless the caller specified a different one
        if port == 18780 and _port_file().exists():
            try:
                port = int(_port_file().read_text().strip())
            except ValueError:
                pass
        webui_stop()
        import time
        time.sleep(0.5)
    _start_daemon(port=port, host=host, workspace=workspace, config_path=config_path, log_level=log_level)


# ── Override `channels login` with PR #2348 generic behavior ─────────────────
# The installed nanobot only supports WhatsApp login; replace with a version
# that accepts a channel name and calls channel.login().

channels_app.registered_commands = [
    c for c in channels_app.registered_commands
    if not (
        c.name == "login"
        or (c.name is None and getattr(c.callback, "__name__", "") == "channels_login")
    )
]


@channels_app.command("login")
def channels_login(
    channel_name: str = typer.Argument(..., help="Channel name (e.g. weixin, whatsapp)"),
    force: bool = typer.Option(False, "--force", "-f", help="Force re-authentication even if already logged in"),
) -> None:
    """Authenticate with a channel via QR code or other interactive login."""
    from nanobot.channels.registry import discover_all
    from nanobot.config.loader import load_config
    from rich.console import Console as _Console

    con = _Console()

    # Apply patches first so webui channels (e.g. weixin) are registered
    from webui.__main__ import _apply_patches
    _apply_patches()

    config = load_config()
    channel_cfg = getattr(config.channels, channel_name, None) or {}

    all_channels = discover_all()
    if channel_name not in all_channels:
        available = ", ".join(all_channels.keys())
        con.print(f"[red]Unknown channel: {channel_name}[/red] Available: {available}")
        raise typer.Exit(1)

    # Use the class from the registry directly — avoids hardcoded nanobot.channels.* import
    channel_cls = all_channels[channel_name]
    channel = channel_cls(channel_cfg, bus=None)

    success = asyncio.run(channel.login(force=force))
    if not success:
        con.print(f"[red]Login failed for channel: {channel_name}[/red]")
        raise typer.Exit(1)
    con.print(f"[green]✓ {channel_name} login successful[/green]")


# ── Daemon launcher ─────────────────────────────────────────────────────────

def _start_daemon(
    port: int,
    host: str,
    workspace: Optional[str],
    config_path: Optional[str],
    log_level: str = "DEBUG",
    webui_only: bool = False,
) -> None:
    """Spawn a detached nanobot-webui process and record its PID."""
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

    # Build the child command — use module execution for stable behavior
    # across environments (no reliance on `nanobot` entrypoint shadowing).
    cmd: list[str] = [sys.executable, "-m", "webui", "start", "--port", str(port), "--host", host]
    if workspace:
        cmd += ["--workspace", workspace]
    if config_path:
        cmd += ["--config", config_path]
    if log_level and log_level.upper() != "DEBUG":
        cmd += ["--log-level", log_level]
    if webui_only:
        cmd += ["--webui-only"]
    # Note: -d/--daemon is intentionally omitted so the child runs in the foreground

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
    typer.echo("  Stop: nanobot-webui stop")


# ── Entry points ─────────────────────────────────────────────────────────────

def run_nanobot() -> None:
    """Entry point for the ``nanobot`` command (with webui subcommand added)."""
    app()


def run_webui() -> None:
    """Entry point for standalone ``nanobot-webui`` / ``webui`` commands.

    Uses the same Typer subcommands as ``nanobot webui`` to keep behavior
    consistent across all entrypoints.
    """
    argv = sys.argv[1:]

    # Backward compatibility:
    #   nanobot-webui --port 18780  -> nanobot-webui start --port 18780
    # Keep top-level/global options intact.
    top_level_options = {
        "-h",
        "--help",
        "--install-completion",
        "--show-completion",
    }
    if argv and argv[0].startswith("-") and argv[0] not in top_level_options:
        argv = ["start", *argv]

    webui_app(args=argv, prog_name=(Path(sys.argv[0]).name or "nanobot-webui"))
