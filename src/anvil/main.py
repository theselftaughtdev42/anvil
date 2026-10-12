from pathlib import Path

from fastapi import FastAPI

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

app = FastAPI()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.frontend("/", directory=FRONTEND_DIST)
