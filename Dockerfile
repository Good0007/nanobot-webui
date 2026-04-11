FROM python:3.11-slim

ARG VERSION=0.2.7.post3
ARG PIP_INDEX_URL=https://pypi.org/simple/
ARG UV_INDEX_URL=${PIP_INDEX_URL}

ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    UV_INDEX_URL=${UV_INDEX_URL} \
    UV_SYSTEM_PYTHON=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/root

# Runtime-only image: install package from published wheel/sdist.
RUN pip install --no-cache-dir uv \
    && uv pip install --system "nanobot-webui==${VERSION}" \
    && mkdir -p /root/.nanobot

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 18780
ENV WEBUI_VERSION=${VERSION}
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys, urllib.request; urllib.request.urlopen('http://127.0.0.1:18780/', timeout=3); sys.exit(0)"
ENTRYPOINT ["docker-entrypoint.sh"]
