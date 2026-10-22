from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import text

# Builds the agent, so a bad AGENT stops the app starting.
import anvil.agent  # noqa: F401
from anvil import PROJECT_ROOT, projects, requirements
from anvil.auth import CurrentUserDep
from anvil.db import SessionDep
from anvil.models import PointOfContact
from anvil.settings import settings

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI()

api = APIRouter(prefix="/api")


@api.get("/health/live")
def live() -> dict[str, str]:
    """Liveness: the process is up. Never touches the database, so a database outage
    doesn't get every instance restarted.
    """
    return {"status": "ok", "commit": settings.git_commit}


@api.get("/health/ready")
def ready(session: SessionDep) -> dict[str, str]:
    """Readiness: this instance can serve traffic, i.e. the database is reachable."""
    try:
        session.connection().execute(text("SELECT 1"))
    except SQLAlchemyError as e:
        raise HTTPException(status_code=503, detail="database unreachable") from e
    return {"status": "ok"}


@api.get("/me")
def me(user: CurrentUserDep) -> PointOfContact:
    return user


class Config(BaseModel):
    idea_placeholder: str


@api.get("/config")
def config() -> Config:
    """Deployment settings the UI needs, so they change without rebuilding the SPA."""
    return Config(idea_placeholder=settings.idea_placeholder)


api.include_router(requirements.router)
api.include_router(projects.router)


@api.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
def not_found() -> None:
    """404 an unmatched /api path, rather than fall through to the frontend's
    index.html fallback. Keep last: routes match in the order they're added."""
    raise HTTPException(status_code=404)


app.include_router(api)
app.frontend("/", directory=FRONTEND_DIST)
