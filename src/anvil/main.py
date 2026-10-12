from pathlib import Path

from fastapi import APIRouter, FastAPI

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

app = FastAPI()

api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api)
app.frontend("/", directory=FRONTEND_DIST)
