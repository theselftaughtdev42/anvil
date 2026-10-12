# anvil
requirements refinement for organisations

## Development

```bash
# build the React frontend (served by FastAPI from frontend/dist)
cd frontend && npm install && npm run build && cd ..

# create your local config (git-ignored)
cp .env.example .env

# start Postgres and apply migrations
docker compose up -d --wait
uv run alembic upgrade head

# run the API + frontend on http://127.0.0.1:8000
uv run fastapi dev
```

For hot reload on the frontend, run `npm run dev` in `frontend/` alongside `fastapi dev`; Vite proxies `/api` to FastAPI.

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
