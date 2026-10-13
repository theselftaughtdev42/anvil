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

## Production

### Image

Every merge to `main` publishes an image (linux/amd64) to `ghcr.io/theselftaughtdev42/anvil`, after CI has built it, run migrations in it and checked its probes and SPA. It contains the API, the built SPA, and Alembic with the migrations. Tags:

- `sha-<full commit sha>`: one per commit on `main`, never moved. Deploy these.
- `main`: moves to the latest `main` build, for quick inspection only.
- `X.Y.Z`: a release (see [Releases](#releases)), the same image as that commit's `sha-` tag.

There is no `latest` tag, and no moving `X.Y` or `X` tags. Pull requests build and smoke-test the image but never publish it. The commit an image was built from is in its `org.opencontainers.image.revision` label and in the `commit` field of `/api/health/live`.

To build and test the image locally:

```bash
make image         # build anvil:local, stamped with the current commit
make image-smoke   # build, then migrate, start and check it, as CI does
```

The smoke test runs `compose.yaml`'s `image` profile (migrations, then the app) as a separate Compose project with its own empty database and free ports, so it can run alongside your dev stack and never touches your dev data. CI runs the same script on every PR and before publishing.

To try the image by hand against your dev database:

```bash
make image-up     # build, migrate the dev database, serve the app on http://localhost:8001
make image-logs   # follow the app's logs
make image-down   # remove the app; the dev database keeps running, data intact
```

If your dev database has a migration from another branch applied, the image's `alembic upgrade head` fails; use `make image-smoke` for a fresh database instead.

### Releases

A release is a git tag; the version lives nowhere else. To cut one, tag a commit on `main` whose CI run has published its image, and push the tag:

```bash
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

The Release workflow then adds the `0.1.0` tag to that commit's `sha-<sha>` image, without rebuilding it, so the release is byte-for-byte the image CI tested. It fails, and tags nothing, if:

- the tag isn't `vX.Y.Z` (no pre-release suffixes);
- the commit isn't on `main`;
- the commit has no image yet. If its CI run on `main` is still going, wait for it, then re-run the failed Release run;
- `X.Y.Z` already points at a different image. Versions are never moved; release a new one.

To find the image for a version, pull `ghcr.io/theselftaughtdev42/anvil:X.Y.Z`. Its digest matches the `sha-` tag of the commit `vX.Y.Z` points at, and that commit is in its `org.opencontainers.image.revision` label:

```bash
docker buildx imagetools inspect ghcr.io/theselftaughtdev42/anvil:0.1.0
git rev-list -n 1 v0.1.0   # the commit; its image is also tagged sha-<this>
```

### Commands

```bash
# default command: the app on port 8000 (one Uvicorn process; scale with more containers)
docker run -p 8000:8000 -e DATABASE_URL=... -e FORWARDED_ALLOW_IPS=... ghcr.io/theselftaughtdev42/anvil:sha-<sha>

# migrations: a one-off run of the same image before rolling out the new version
docker run --rm -e DATABASE_URL=... ghcr.io/theselftaughtdev42/anvil:sha-<sha> alembic upgrade head
```

The app never migrates on startup, so replicas can't race each other and a failed migration blocks the deploy instead of crash-looping the app.

### Environment variables

Configuration comes only from environment variables; the image contains no `.env`.

- `DATABASE_URL` (required): e.g. `postgresql+psycopg://user:password@host:5432/anvil`.
- `FORWARDED_ALLOW_IPS`: the proxies trusted to set `X-Forwarded-For`/`X-Forwarded-Proto`, so client IPs and the scheme are right behind a load balancer. Defaults to `127.0.0.1,::1`, so forwarded headers are effectively ignored. Set it per platform:
  - a load balancer in a known network (e.g. a VPC or Kubernetes ingress): its address range, e.g. `10.0.0.0/8`
  - a managed platform where only the platform's proxy can reach the container (e.g. Fly.io, Render, Cloud Run): `*`
  - no proxy in front: leave it unset. Never use `*` when clients can reach the container directly, or they can spoof their IP.

### Migrations must work with the running version

Migrations run before the new version rolls out, so the old version keeps serving traffic against the new schema for a while. Every migration must therefore work with the app version that is currently running. Make destructive changes (dropping or renaming a column or table, tightening a constraint) with expand/contract across releases:

1. Expand: add the new structure alongside the old one (e.g. a new nullable column), and backfill it.
2. Switch: release code that uses the new structure.
3. Contract: in a later release, once nothing running uses the old structure, remove it.

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
