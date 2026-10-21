"""Temporary: these test the stub user that stands in for authentication
(anvil.auth.get_current_user). Replace them when real auth arrives.
"""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, func, select

from anvil.auth import get_current_user
from anvil.db import get_session
from anvil.main import app
from anvil.models import PointOfContact
from anvil.settings import settings

client = TestClient(app)


@pytest.fixture(autouse=True)
def app_on_test_db(migrated_db: Engine) -> Iterator[Engine]:
    """Point the app's sessions at the migrated test database."""

    def session() -> Iterator[Session]:
        with Session(migrated_db) as session:
            yield session

    app.dependency_overrides[get_session] = session
    yield migrated_db
    app.dependency_overrides.clear()


def count_people(engine: Engine) -> int:
    with Session(engine) as session:
        return session.exec(select(func.count()).select_from(PointOfContact)).one()


def test_first_call_creates_the_stub_user(
    app_on_test_db: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "stub_user_name", "Ada Lovelace")
    monkeypatch.setattr(settings, "stub_user_email", "ada@example.com")

    response = client.get("/api/me")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "Ada Lovelace",
        "email": "ada@example.com",
    }
    assert count_people(app_on_test_db) == 1


def test_later_calls_return_the_same_user(app_on_test_db: Engine) -> None:
    first = client.get("/api/me").json()
    second = client.get("/api/me").json()

    assert second == first
    assert count_people(app_on_test_db) == 1


def test_changing_the_email_switches_user(
    app_on_test_db: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = client.get("/api/me").json()
    monkeypatch.setattr(settings, "stub_user_email", "grace@example.com")

    second = client.get("/api/me").json()

    assert second["email"] == "grace@example.com"
    assert second["id"] != first["id"]
    assert count_people(app_on_test_db) == 2


def test_current_user_can_be_overridden(app_on_test_db: Engine) -> None:
    grace = PointOfContact(name="Grace Hopper", email="grace@example.com")
    app.dependency_overrides[get_current_user] = lambda: grace

    response = client.get("/api/me")

    assert response.json() == {
        "id": str(grace.id),
        "name": "Grace Hopper",
        "email": "grace@example.com",
    }
    assert count_people(app_on_test_db) == 0


def test_concurrent_first_calls_create_one_user(app_on_test_db: Engine) -> None:
    threads = 8
    barrier = Barrier(threads)

    def first_call(_: int) -> PointOfContact:
        with Session(app_on_test_db) as session:
            barrier.wait()
            return get_current_user(session)

    with ThreadPoolExecutor(threads) as pool:
        users = list(pool.map(first_call, range(threads)))

    assert len({user.id for user in users}) == 1
    assert count_people(app_on_test_db) == 1
