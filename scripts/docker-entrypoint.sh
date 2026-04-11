#!/bin/sh
# docker-entrypoint.sh — nanobot-webui container startup script
#
# Supported environment variables:
#   WEBUI_PORT        HTTP port (default: 18780)
#   WEBUI_HOST        Bind address (default: 0.0.0.0)
#   WEBUI_WORKSPACE   Override workspace directory
#   WEBUI_CONFIG      Path to config file
#   WEBUI_LOG_LEVEL   Log level: DEBUG / INFO / WARNING / ERROR (default: DEBUG)
#   WEBUI_ONLY        Set to "true" to skip IM channels / heartbeat
#   WEBUI_VERSION     Package version installed (set by Dockerfile ENV)

PORT="${WEBUI_PORT:-18780}"
HOST="${WEBUI_HOST:-0.0.0.0}"
LOG_LEVEL="${WEBUI_LOG_LEVEL:-DEBUG}"
VERSION="${WEBUI_VERSION:-0.0.0}"

# Build argument list
ARGS="--port ${PORT} --host ${HOST} --log-level ${LOG_LEVEL}"

if [ -n "${WEBUI_WORKSPACE}" ]; then
    ARGS="${ARGS} --workspace ${WEBUI_WORKSPACE}"
fi

if [ -n "${WEBUI_CONFIG}" ]; then
    ARGS="${ARGS} --config ${WEBUI_CONFIG}"
fi

if [ "${WEBUI_ONLY}" = "true" ]; then
    ARGS="${ARGS} --webui-only"
fi

# Prefer the dedicated command first, keep backward-compatible fallbacks.
if command -v nanobot-webui >/dev/null 2>&1; then
    echo "[entrypoint] nanobot-webui start ${ARGS}"
    exec nanobot-webui start ${ARGS}
fi

if command -v nanobot >/dev/null 2>&1; then
    echo "[entrypoint] nanobot webui start ${ARGS}"
    exec nanobot webui start ${ARGS}
fi

echo "[entrypoint] python -m webui ${ARGS}"
exec python -m webui ${ARGS}
