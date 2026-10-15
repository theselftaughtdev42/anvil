from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from anvil.db import get_session
from anvil.main import FRONTEND_DIST, app
from anvil.settings import settings

client = TestClient(app)


def test_live_reports_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "git_commit", "abc123")

    response = client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "commit": "abc123"}


def test_live_works_with_database_down() -> None:
    def broken_session() -> Iterator[Session]:
        raise AssertionError("live must not touch the database")

    app.dependency_overrides[get_session] = broken_session
    try:
        response = client.get("/api/health/live")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200


def test_ready_when_database_reachable() -> None:
    response = client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_is_503_when_database_unreachable() -> None:
    # Nothing listens on port 1, so connecting fails straight away.
    engine = create_engine("postgresql+psycopg://user:pass@127.0.0.1:1/db")

    def unreachable_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = unreachable_session
    try:
        response = client.get("/api/health/ready")
    finally:
        app.dependency_overrides.clear()
        engine.dispose()

    assert response.status_code == 503


def test_config_serves_the_idea_placeholder(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "idea_placeholder", "Riders can tip their driver")

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {"idea_placeholder": "Riders can tip their driver"}


def test_old_health_endpoint_is_gone() -> None:
    assert client.get("/api/health").status_code == 404


@pytest.mark.skipif(
    not (FRONTEND_DIST / "index.html").exists(),
    reason="frontend not built; the index.html fallback only exists once it is",
)
def test_unknown_api_path_is_404_not_frontend() -> None:
    # The frontend fallback only serves index.html to browser-style
    # navigations (GET accepting text/html), so send one.
    response = client.get("/api/does-not-exist", headers={"accept": "text/html"})

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"


@pytest.mark.skipif(
    not (FRONTEND_DIST / "index.html").exists(),
    reason="frontend not built; the index.html fallback only exists once it is",
)
def test_frontend_route_serves_the_spa() -> None:
    # Deep links to client-side routes must load the SPA, which then routes.
    response = client.get("/requirements/abc-123", headers={"accept": "text/html"})

    assert response.status_code == 200
    assert response.text == (FRONTEND_DIST / "index.html").read_text()
