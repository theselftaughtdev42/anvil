# Common tasks, runnable from the repo root. `make help` lists them.

.DEFAULT_GOAL := help

FRONTEND := npm --prefix frontend

.PHONY: help install db migrate migration dev frontend-dev frontend-build frontend-unit frontend-e2e frontend-e2e-ui lint format test check

help: ## List the targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-16s %s\n", $$1, $$2}'

# --- Development ------------------------------------------------------------

install: ## Install dependencies, Playwright's Chromium and the pre-commit hook, and create .env if missing
	uv sync
	$(FRONTEND) ci
	$(FRONTEND) exec -- playwright install chromium # full Chromium, for frontend-e2e-ui
	uv run pre-commit install
	@test -f .env || { cp .env.example .env && echo "Created .env from .env.example"; }

db: ## Start the dev Postgres and wait until it's healthy
	docker compose up -d --wait db

migrate: db ## Apply migrations to the dev database
	uv run alembic upgrade head

# make migration m="add requirement table"
migration: db ## Generate a migration from model changes (m="message")
	@test -n "$(m)" || { echo 'Usage: make migration m="describe the change"'; exit 1; }
	uv run alembic revision --autogenerate -m "$(m)"

dev: frontend-build migrate ## Build the SPA and serve it with the API on http://127.0.0.1:8000
	uv run fastapi dev

frontend-dev: ## Vite dev server with hot reload (run alongside `make dev`)
	$(FRONTEND) run dev

frontend-build: ## Build the SPA into frontend/dist
	$(FRONTEND) run build

frontend-unit: ## Test React components on their own, in headless Chromium (Vitest)
	$(FRONTEND) run test:unit

# Builds the SPA, serves it with `vite preview` and runs Playwright against it.
# Reuses a preview server that's already on port 4173.
frontend-e2e: frontend-build ## Check the SPA follows the design rules, in a real browser (Playwright)
	E2E_PREBUILT=1 $(FRONTEND) run test:e2e

# Playwright's UI: pick tests, watch them run, and step through each action's
# DOM snapshot. Runs on the Vite dev server, so source edits need no rebuild.
frontend-e2e-ui: ## Open the Playwright UI to watch and debug the e2e tests
	E2E_DEV_SERVER=1 $(FRONTEND) run test:e2e -- --ui

# The same hooks CI runs, over every file. Fixes what it can.
lint: ## Lint, format-check and type-check everything (Python and frontend)
	SKIP=no-commit-to-branch uv run pre-commit run --all-files

format: ## Format and auto-fix Python
	uv run ruff check --fix
	uv run ruff format

# Builds the SPA too, so the /api 404 test runs instead of skipping.
test: db frontend-build ## Run the Python tests
	uv run pytest

check: lint frontend-build frontend-unit frontend-e2e test ## Everything CI checks, short of the image

# --- Production image -------------------------------------------------------
# Build and test the production image locally. Needs Docker.

IMAGE ?= anvil:local
# The commit the image is built from, with a -dirty suffix when the working tree
# has uncommitted or untracked changes (they'd be in the build context too).
COMMIT := $(shell git rev-parse HEAD)$(shell test -z "$$(git status --porcelain)" || echo -dirty)
# Extra `docker build` flags (CI adds its platform and layer cache).
BUILD_FLAGS ?=

.PHONY: image image-smoke image-up image-logs image-down

# Build the production image, stamped with the current commit. CI builds
# through this target too.
image: ## Build the production image (IMAGE=anvil:local)
	docker build $(BUILD_FLAGS) \
		--build-arg GIT_COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$$(date -u +%Y-%m-%dT%H:%M:%SZ) \
		--tag $(IMAGE) \
		.

# Build, then run migrations and check the probes and SPA, as CI does before
# publishing. Uses a throwaway Postgres, never your dev database.
image-smoke: image ## Build the image and smoke-test it against a throwaway database
	scripts/smoke-test-image.sh $(IMAGE) $(COMMIT)

# Build, then run the image against your dev database (compose.yaml's `image`
# profile): migrates it, then serves the app on http://localhost:8001.
image-up: image ## Build the image and serve it on http://localhost:8001 against the dev database
	docker compose --profile image up --detach --wait
	@echo "App running at http://localhost:8001"

# Follow the app's logs (and the migration run's).
image-logs: ## Follow the image's app and migration logs
	docker compose --profile image logs --follow migrate app

# Stop and remove the image's containers. Leaves the dev database running and
# its data intact.
image-down: ## Remove the image's containers (the dev database keeps running)
	docker compose --profile image rm --stop --force migrate app
