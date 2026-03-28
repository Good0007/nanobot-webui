FROM python:3.11-slim

# Use Alibaba apt mirror for faster downloads in China
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates xz-utils \
    && ARCH=$(dpkg --print-architecture) \
    && NODE_VERSION=22.14.0 \
    && case "$ARCH" in \
         amd64) NODE_ARCH=x64 ;; \
         arm64) NODE_ARCH=arm64 ;; \
         *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
       esac \
    && curl -fsSL "https://npmmirror.com/mirrors/node/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
       | tar -xJ -C /usr/local --strip-components=1 \
    && apt-get purge -y curl xz-utils && apt-get autoremove -y \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ uv

ENV VERSION=0.2.5
RUN uv pip install --system -i https://pypi.org/simple/ nanobot-webui==${VERSION}

EXPOSE 18780
CMD ["nanobot", "webui", "--port", "18780"]
