# anvil
requirements refinement for organisations

## Development

```bash
# build the React frontend (served by FastAPI from frontend/dist)
cd frontend && npm install && npm run build && cd ..

# install the git pre-commit hook (lint, format and type checks)
uv run pre-commit install

# create your local config (git-ignored)
cp .env.example .env

# start Postgres and apply migrations
docker compose up -d --wait
uv run alembic upgrade head

# run the API + frontend on http://127.0.0.1:8000
uv run fastapi dev
```

For hot reload on the frontend, run `npm run dev` in `frontend/` alongside `fastapi dev`; Vite proxies `/api` to FastAPI.

## Health probes

For hosting platforms to poll:

- `GET /api/health/live` (liveness): the process is up. Returns `{"status": "ok", "commit": "<sha>"}`, where `commit` comes from the `GIT_COMMIT` environment variable set at image build time (`"unknown"` in local dev). It never touches the database, so a database outage doesn't get instances restarted.
- `GET /api/health/ready` (readiness): this instance can serve traffic. Runs `SELECT 1` and returns 200 `{"status": "ok"}`, or 503 when the database is unreachable, so the platform stops routing traffic here until it recovers.

## Database migrations

Models are SQLModel classes in `src/anvil/models/`. Each new model module must be imported in `src/anvil/models/__init__.py`, or Alembic won't see it.

```bash
# after changing models, generate a migration and review it before committing
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head

# fail if models and migrations have drifted apart
uv run alembic check
```

The connection string comes from `DATABASE_URL`, read from the environment or `.env`. It is required: the app and Alembic refuse to start without it.

## Tests

```bash
docker compose up -d --wait   # tests need the Compose Postgres
uv run pytest
```

Migration tests run against a throwaway `<db>_test` database on the same server as `DATABASE_URL`, created and dropped by the test session; your dev database is never touched.

## Checks

Pre-commit (`.pre-commit-config.yaml`) blocks commits directly to `main`, runs general file hygiene checks, Ruff (lint + format) and ty on Python changes, and oxlint and tsc on frontend changes. It fixes what it can and blocks the commit so you can re-stage. CI (`.github/workflows/ci.yml`) runs on every PR and push to `main`:

```bash
uv run ruff check && uv run ruff format --check   # lint + format
uv run ty check                                   # types
uv run pytest                                     # tests (against Postgres)
cd frontend && npm run lint && npm run build      # oxlint + tsc + vite
```

New Alembic migrations are run through Ruff automatically on generation.
