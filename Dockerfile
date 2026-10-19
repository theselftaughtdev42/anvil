# Production image: the FastAPI app, the built SPA, and Alembic with its
# migrations. Runs the app by default; run migrations with
# `docker run <image> alembic upgrade head`.

# --- SPA build -------------------------------------------------------------
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

# --- Python dependencies -----------------------------------------------------
FROM ghcr.io/astral-sh/uv:0.13.1@sha256:4a1f3666816dafadd20ceb71eac9a7d56d7ef30279f7d64048519ab901ada336 AS uv

FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 AS builder

COPY --from=uv /uv /usr/local/bin/uv
# Use the base image's Python (the runtime stage has the same one), compile
# bytecode now since the non-root runtime user can't write it later, and copy
# files out of the cache mount rather than hardlinking to it.
ENV UV_PYTHON_DOWNLOADS=0 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app
# Dependencies first, so source changes don't invalidate this layer.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project
COPY pyproject.toml uv.lock README.md ./
COPY src/ src/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# --- Runtime -----------------------------------------------------------------
FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170

RUN useradd --system --uid 10001 --no-create-home anvil

# The image keeps the checkout layout under /app. anvil locates the SPA build
# (and an optional .env) relative to its own source file, assuming it runs
# from a checkout (see PROJECT_ROOT in src/anvil/__init__.py). That's why the
# project must stay an editable install (uv's default): the venv then points
# at /app/src, so the lookup resolves to /app. A regular install would put
# anvil in site-packages and the SPA would not be found.
#
# Copy by explicit path: anything new the app reads at runtime relative to
# the repo root must be added here too. pyproject.toml carries the
# [tool.fastapi] entrypoint and the [tool.alembic] config.
WORKDIR /app
COPY --from=builder /app/.venv .venv
COPY --from=builder /app/src src
COPY --from=frontend /app/frontend/dist frontend/dist
COPY pyproject.toml alembic.ini ./
COPY alembic/ alembic/

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

USER anvil
EXPOSE 8000
# One server process per container; scale by adding containers. No
# HEALTHCHECK: platforms run their own probes against /api/health/*.
CMD ["fastapi", "run", "--port", "8000"]

# Build metadata last, so a new commit doesn't invalidate the layers above.
ARG GIT_COMMIT=unknown
ARG BUILD_DATE
ENV GIT_COMMIT=$GIT_COMMIT
LABEL org.opencontainers.image.source="https://github.com/theselftaughtdev42/anvil" \
      org.opencontainers.image.revision=$GIT_COMMIT \
      org.opencontainers.image.created=$BUILD_DATE
