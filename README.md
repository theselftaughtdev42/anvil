# anvil
requirements refinement for organisations

## Development

```bash
# build the React frontend (served by FastAPI from frontend/dist)
cd frontend && npm install && npm run build && cd ..

# run the API + frontend on http://127.0.0.1:8000
uv run fastapi dev
```

For hot reload on the frontend, run `npm run dev` in `frontend/` alongside `fastapi dev`; Vite proxies `/api` to FastAPI.
