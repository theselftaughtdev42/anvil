from fastapi import APIRouter, FastAPI, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import text

# Builds the agent and loads the Project Context, so a bad AGENT or
# PROJECT_CONTEXT_FILE stops the app starting.
import anvil.agent  # noqa: F401
from anvil import PROJECT_ROOT, requirements
from anvil.auth import CurrentUserDep
from anvil.db import SessionDep
from anvil.models import PointOfContact
from anvil.settings import settings

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI()

api = APIRouter(prefix="/api")


# Liveness: the process is up. Never touches the database, so a database
# outage doesn't get every instance restarted.
@api.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok", "commit": settings.git_commit}


# Readiness: this instance can serve traffic, i.e. the database is reachable.
@api.get("/health/ready")
def ready(session: SessionDep) -> dict[str, str]:
    try:
        session.connection().execute(text("SELECT 1"))
    except SQLAlchemyError as e:
        raise HTTPException(status_code=503, detail="database unreachable") from e
    return {"status": "ok"}


# Who the request is acting as, e.g. for the header avatar's initials.
@api.get("/me")
def me(user: CurrentUserDep) -> PointOfContact:
    return user


api.include_router(requirements.router)


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
