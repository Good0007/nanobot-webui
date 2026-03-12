"""FastAPI application factory."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from webui.api.gateway import ServiceContainer
from webui.api.middleware import setup_cors
from webui.api.users import UserStore


def create_app(container: ServiceContainer | None = None) -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="nanobot WebUI",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # Attach shared state
    app.state.services = container
    app.state.user_store = UserStore()

    # Middleware
    setup_cors(app)

    # Routes
    from webui.api.routes import (
        auth,
        channels,
        config,
        cron,
        mcp,
        openai_proxy,
        providers,
        sessions,
        skills,
        users,
        ws,
    )

    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(config.router, prefix="/api/config", tags=["config"])
    app.include_router(channels.router, prefix="/api/channels", tags=["channels"])
    app.include_router(providers.router, prefix="/api/providers", tags=["providers"])
    app.include_router(mcp.router, prefix="/api/mcp", tags=["mcp"])
    app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
    app.include_router(cron.router, prefix="/api/cron", tags=["cron"])
    app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(ws.router, tags=["ws"])
    app.include_router(openai_proxy.router)

    # Serve built React frontend (optional — only when `bun run build` has been run)
    # Resolution order:
    #   1. Editable install: <repo>/webui/web/dist/
    #   2. Installed wheel:  importlib.resources traversal (works with zipimport too)
    _here = Path(__file__).parent  # webui/api/
    web_dist = _here.parent / "web" / "dist"  # editable: webui/web/dist
    if not web_dist.exists():
        try:
            import importlib.resources as _ir
            _traversable = _ir.files("webui").joinpath("web/dist")
            # Materialise to a real filesystem path via a context manager when needed,
            # but first try a direct cast (works for regular installs).
            _candidate = Path(str(_traversable))
            if _candidate.exists():
                web_dist = _candidate
            else:
                # Zip-based installs: extract to a temp dir at startup
                import tempfile, shutil
                _tmp = Path(tempfile.mkdtemp(prefix="nanobot_webui_dist_"))
                for _item in _traversable.iterdir():  # type: ignore[union-attr]
                    _dest = _tmp / _item.name
                    if hasattr(_item, "read_bytes"):
                        _dest.write_bytes(_item.read_bytes())
                web_dist = _tmp
        except Exception:
            web_dist = Path("")  # frontend not bundled

    if web_dist.exists():
        # Mount the whole dist directory so /assets, /icon.png, etc. are served
        app.mount("/dist", StaticFiles(directory=str(web_dist)), name="dist-root")

        assets_dir = web_dist / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        # Serve public files (icon.png, logo.png, …) from dist root
        for _static_file in web_dist.iterdir():
            if _static_file.is_file() and _static_file.name != "index.html":
                _name = _static_file.name
                _path = str(_static_file)

                @app.get(f"/{_name}", include_in_schema=False)
                async def _serve_public(  # noqa: B023
                    _f: str = _path,
                ) -> FileResponse:
                    return FileResponse(_f)

        index_html = web_dist / "index.html"

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):  # noqa: ARG001
            if index_html.exists():
                return FileResponse(str(index_html))
            return {"message": "Frontend not built. Run 'bun run build' in webui/web/"}

    return app
