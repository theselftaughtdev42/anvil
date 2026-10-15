import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, select

from anvil.agent.deps import get_agent, get_project_context
from anvil.auth import get_current_user
from anvil.db import get_session
from anvil.main import app
from anvil.models import PointOfContact, Requirement, RequirementStatus

client = TestClient(app)


class FakeAgent:
    """Titles every idea "Title for: <idea>" and records what it was asked."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []

    def name_requirement(self, idea: str, context: str | None) -> str:
        self.calls.append((idea, context))
        return f"Title for: {idea}"[:80]


@pytest.fixture
def agent() -> FakeAgent:
    return FakeAgent()


@pytest.fixture(autouse=True)
def app_on_test_db(migrated_db: Engine, agent: FakeAgent) -> Iterator[Engine]:
    """Point the app at the migrated test database, with the fake agent."""

    def session() -> Iterator[Session]:
        with Session(migrated_db) as session:
            yield session

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_agent] = lambda: agent
    app.dependency_overrides[get_project_context] = lambda: "We deliver parcels."
    yield migrated_db
    app.dependency_overrides.clear()


@pytest.fixture
def someone_else(app_on_test_db: Engine) -> PointOfContact:
    with Session(app_on_test_db) as session:
        person = PointOfContact(name="Grace Hopper", email="grace@example.com")
        session.add(person)
        session.commit()
        session.refresh(person)
        return person


def add_requirement(
    engine: Engine,
    owner: PointOfContact,
    status: RequirementStatus = RequirementStatus.DRAFT,
) -> uuid.UUID:
    with Session(engine) as session:
        requirement = Requirement(
            point_of_contact_id=owner.id, idea="Theirs", title="Theirs", status=status
        )
        session.add(requirement)
        session.commit()
        return requirement.id


def create(idea: str) -> dict:
    response = client.post("/api/requirements", json={"idea": idea})
    assert response.status_code == 201, response.text
    return response.json()


def set_status(engine: Engine, id: str, status: RequirementStatus) -> None:
    with Session(engine) as session:
        requirement = session.get_one(Requirement, uuid.UUID(id))
        requirement.status = status
        session.commit()


# --- Creating ---------------------------------------------------------------


def test_create_returns_the_draft_requirement(agent: FakeAgent) -> None:
    response = client.post(
        "/api/requirements", json={"idea": "  Rebook a missed delivery  "}
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "title": "Title for: Rebook a missed delivery",
        "idea": "Rebook a missed delivery",
        "status": "draft",
        "created_at": body["created_at"],
        "updated_at": body["created_at"],
        "progress": None,
    }
    assert agent.calls == [("Rebook a missed delivery", "We deliver parcels.")]


def test_create_stores_it_for_the_current_user(app_on_test_db: Engine) -> None:
    me = client.get("/api/me").json()

    body = create("Rebook a missed delivery")

    with Session(app_on_test_db) as session:
        stored = session.exec(select(Requirement)).one()
    assert str(stored.id) == body["id"]
    assert str(stored.point_of_contact_id) == me["id"]
    assert stored.idea == "Rebook a missed delivery"
    assert stored.title == "Title for: Rebook a missed delivery"
    assert stored.status == RequirementStatus.DRAFT


def test_create_accepts_an_idea_of_the_maximum_length() -> None:
    idea = "a" * 5000

    assert create(idea)["idea"] == idea


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"idea": ""}, "String should have at least 1 character"),
        ({"idea": "   \n\t "}, "String should have at least 1 character"),
        ({"idea": "a" * 5001}, "String should have at most 5000 characters"),
        ({}, "Field required"),
    ],
)
def test_create_rejects_a_bad_idea(
    body: dict, message: str, app_on_test_db: Engine, agent: FakeAgent
) -> None:
    response = client.post("/api/requirements", json=body)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "idea"]
    assert error["msg"] == message
    assert agent.calls == []
    with Session(app_on_test_db) as session:
        assert session.exec(select(Requirement)).all() == []


# --- Listing ----------------------------------------------------------------


def test_list_is_empty_to_start_with() -> None:
    response = client.get("/api/requirements")

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "counts": {"all": 0, "draft": 0, "in_progress": 0, "complete": 0},
    }


def test_list_is_most_recently_updated_first(app_on_test_db: Engine) -> None:
    first = create("First")
    second = create("Second")
    third = create("Third")
    set_status(app_on_test_db, first["id"], RequirementStatus.IN_PROGRESS)

    items = client.get("/api/requirements").json()["items"]

    assert [item["id"] for item in items] == [first["id"], third["id"], second["id"]]
    assert items[1] == third


def test_list_only_shows_the_current_users_requirements(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    add_requirement(app_on_test_db, someone_else)
    mine = create("Mine")

    body = client.get("/api/requirements").json()

    assert body["items"] == [mine]
    assert body["counts"] == {"all": 1, "draft": 1, "in_progress": 0, "complete": 0}


def test_list_filters_by_status_but_counts_everything(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    add_requirement(app_on_test_db, someone_else, RequirementStatus.COMPLETE)
    create("Draft")
    in_progress = create("In progress")
    complete = create("Complete")
    set_status(app_on_test_db, in_progress["id"], RequirementStatus.IN_PROGRESS)
    set_status(app_on_test_db, complete["id"], RequirementStatus.COMPLETE)
    counts = {"all": 3, "draft": 1, "in_progress": 1, "complete": 1}

    body = client.get("/api/requirements", params={"status": "complete"}).json()

    assert [item["id"] for item in body["items"]] == [complete["id"]]
    assert body["counts"] == counts
    assert client.get("/api/requirements").json()["counts"] == counts


def test_list_rejects_an_unknown_status() -> None:
    response = client.get("/api/requirements", params={"status": "done"})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["query", "status"]
    assert error["msg"] == "Input should be 'draft', 'in_progress' or 'complete'"


# --- Getting one ------------------------------------------------------------


def test_get_returns_the_requirement() -> None:
    created = create("Rebook a missed delivery")

    response = client.get(f"/api/requirements/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_is_404_for_an_unknown_id() -> None:
    response = client.get(f"/api/requirements/{uuid.uuid4()}")

    assert response.status_code == 404


def test_get_is_404_for_someone_elses_requirement(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    theirs = add_requirement(app_on_test_db, someone_else)

    response = client.get(f"/api/requirements/{theirs}")

    assert response.status_code == 404
    assert "Theirs" not in response.text


def test_get_rejects_an_id_that_isnt_a_uuid() -> None:
    assert client.get("/api/requirements/not-a-uuid").status_code == 422


# --- Overriding the user ----------------------------------------------------


def test_requirements_belong_to_whoever_is_current(
    someone_else: PointOfContact,
) -> None:
    create("Mine")
    app.dependency_overrides[get_current_user] = lambda: someone_else

    assert client.get("/api/requirements").json()["items"] == []


# --- OpenAPI ----------------------------------------------------------------


def test_endpoints_are_documented_with_their_response_models() -> None:
    spec = client.get("/openapi.json").json()

    def response_schema(path: str, method: str, status: str) -> str:
        content = spec["paths"][path][method]["responses"][status]["content"]
        return content["application/json"]["schema"]["$ref"]

    assert response_schema("/api/requirements", "post", "201").endswith(
        "/RequirementPublic"
    )
    assert response_schema("/api/requirements", "get", "200").endswith(
        "/RequirementList"
    )
    assert response_schema("/api/requirements/{requirement_id}", "get", "200").endswith(
        "/RequirementPublic"
    )
