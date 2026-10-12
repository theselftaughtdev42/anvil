from fastapi import APIRouter, FastAPI, HTTPException

from anvil import PROJECT_ROOT

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI()

api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Keep last: unmatched /api paths must 404 rather than fall through to the
# frontend's index.html fallback.
@api.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
def not_found() -> None:
    raise HTTPException(status_code=404)


app.include_router(api)
app.frontend("/", directory=FRONTEND_DIST)
