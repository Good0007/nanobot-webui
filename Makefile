# ─────────────────────────────────────────────
#  nanobot-webui  Makefile
# ─────────────────────────────────────────────
IMAGE   ?= kangkang223/nanobot-webui
TAG     ?= latest
PLATFORMS ?= linux/amd64,linux/arm64
VERSION ?= $(shell awk -F'"' '/^version = "/ {print $$2; exit}' pyproject.toml)
PIP_INDEX_URL ?= https://pypi.org/simple/

# ── Local dev ─────────────────────────────────
.PHONY: dev
dev:
	cd web && bun run dev

# --- uv run webui ---
.PHONY: server
server:
	uv run webui

.PHONY: build-web
build-web:
	cd web && bun install --frozen-lockfile && bun run build
	rm -rf webui/web/dist
	cp -r web/dist webui/web/dist

# ── Python package ─────────────────────────────
# Full dist: builds frontend first, then creates sdist + wheel
.PHONY: dist
dist: build-web
	python -m build

.PHONY: dist-wheel
dist-wheel: build-web
	python -m build --wheel

# ── Docker (single-platform, local) ───────────
.PHONY: build
build:
	@echo "Building $(IMAGE):$(TAG) with package version $(VERSION)"
	docker build \
	 --build-arg VERSION=$(VERSION)\
	 --build-arg PIP_INDEX_URL=$(PIP_INDEX_URL)\
	 -t $(IMAGE):$(TAG) .

.PHONY: up
up:
	docker compose up -d

.PHONY: down
down:
	docker compose down

.PHONY: logs
logs:
	docker compose logs -f

.PHONY: restart
restart:
	docker compose restart

# ── Docker multi-platform → docker.io ─────────
# Requires: docker buildx with a multi-arch builder
#   Run once to create it:
#     docker buildx create --name multi --use --bootstrap
.PHONY: push
push:
	docker buildx build \
		--platform $(PLATFORMS) \
		--tag $(IMAGE):$(TAG) \
		--push \
		.

.PHONY: push-latest
push-latest: TAG=latest
push-latest: push

# Build & push with an explicit version tag AND update latest
# Usage: make release VERSION=0.1.2
.PHONY: release
release:
	@echo "Releasing version $(VERSION)..."
	docker buildx build \
		--platform $(PLATFORMS) \
		--build-arg VERSION=$(VERSION) \
		--build-arg PIP_INDEX_URL=$(PIP_INDEX_URL) \
		--tag $(IMAGE):$(VERSION) \
		--tag $(IMAGE):latest \
		--push \
		.
	@echo "Docker images $(IMAGE):$(VERSION) and $(IMAGE):latest pushed successfully"

# ── Python PyPI publish ───────────────────────
.PHONY: build-py
build-py: build-web
	rm -rf webui/web/dist
	cp -r web/dist webui/web/dist
	rm -rf dist/ build/ nanobot_webui.egg-info/
	python -m build

.PHONY: publish
publish: build-py
	twine upload dist/*

.PHONY: publish-test
publish-test: build-py
	twine upload --repository testpypi dist/*

.PHONY: test-release
test-release:
	bash scripts/test-release.sh

# Build Python package and Docker image together
# Usage: make release-all VERSION=0.1.2
.PHONY: release-all
release-all: publish release
	@echo "All releases completed successfully!"

# ── Helpers ───────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make dev            Start Vite dev server (web/)"
	@echo "  make build-web      Build frontend with Bun"
	@echo ""
	@echo "  make build          Build local Docker image ($(IMAGE):$(TAG))"
	@echo "  make up             docker compose up -d"
	@echo "  make down           docker compose down"
	@echo "  make logs           Follow compose logs"
	@echo "  make restart        docker compose restart"
	@echo ""
	@echo "  make push           Build & push multi-arch image ($(PLATFORMS))"
	@echo "  make release        Build & push :VERSION and :latest (VERSION defaults to pyproject.toml)"
	@echo "  make release VERSION=x  Override default VERSION"
	@echo ""
	@echo "  make build-py       Build Python package (wheel + sdist)"
	@echo "  make publish        Publish to PyPI (requires .pypirc)"
	@echo "  make publish-test   Publish to Test PyPI (requires .pypirc)"
	@echo "  make test-release   Publish to TestPyPI → install → smoke test"
	@echo "  make release-all    Publish PyPI + Docker (VERSION defaults to pyproject.toml)"
	@echo "  make release-all VERSION=x  Override default VERSION"
	@echo ""
	@echo "  Override defaults:"
	@echo "    IMAGE=$(IMAGE)  TAG=$(TAG)  VERSION=$(VERSION)  PIP_INDEX_URL=$(PIP_INDEX_URL)"
	@echo ""
