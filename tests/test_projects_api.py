import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event
from sqlmodel import Session, col, select

from anvil.auth import get_current_user
from anvil.db import get_session
from anvil.main import app
from anvil.models import (
    PointOfContact,
    Project,
    Question,
    ReopenNote,
    Requirement,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def app_on_test_db(migrated_db: Engine) -> Iterator[Engine]:
    def session() -> Iterator[Session]:
        with Session(migrated_db) as session:
            yield session

    app.dependency_overrides[get_session] = session
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


def create(name: str) -> dict:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def add_requirements(engine: Engine, project_id: str, count: int) -> None:
    with Session(engine) as session:
        project = session.get_one(Project, uuid.UUID(project_id))
        for i in range(count):
            session.add(
                Requirement(
                    point_of_contact_id=project.owner_id,
                    project_id=project.id,
                    idea=f"Idea {i}",
                    title=f"Idea {i}",
                )
            )
        session.commit()


# --- Creating ---------------------------------------------------------------


def test_create_returns_the_project_owned_by_the_current_user(
    app_on_test_db: Engine,
) -> None:
    response = client.post("/api/projects", json={"name": "  Parcels  "})

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "Parcels",
        "context": "",
        "has_context": False,
        "requirement_count": 0,
        "is_owner": True,
    }
    with Session(app_on_test_db) as session:
        project = session.get_one(Project, uuid.UUID(body["id"]))
        owner = session.get_one(PointOfContact, project.owner_id)
        assert owner.email == client.get("/api/me").json()["email"]


@pytest.mark.parametrize(
    ("name", "message"),
    [
        ("", "String should have at least 1 character"),
        ("   ", "String should have at least 1 character"),
        ("a" * 121, "String should have at most 120 characters"),
    ],
)
def test_create_rejects_a_bad_name(name: str, message: str) -> None:
    response = client.post("/api/projects", json={"name": name})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "name"]
    assert error["msg"] == message


def test_create_rejects_a_taken_name_ignoring_case() -> None:
    create("Parcels")

    response = client.post("/api/projects", json={"name": "PARCELS"})

    assert response.status_code == 409
    assert response.json()["detail"] == 'A Project called "PARCELS" already exists'
    assert len(client.get("/api/projects").json()["items"]) == 1


# --- Listing and getting ----------------------------------------------------


def test_list_is_every_project_by_name_with_requirement_counts(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    trains = create("trains")
    parcels = create("Parcels")
    add_requirements(app_on_test_db, parcels["id"], 2)
    with Session(app_on_test_db) as session:
        theirs = Project(owner_id=someone_else.id, name="Boats", context="Ferries.")
        session.add(theirs)
        session.commit()

    items = client.get("/api/projects").json()["items"]

    assert [(p["name"], p["requirement_count"], p["is_owner"]) for p in items] == [
        ("Boats", 0, False),
        ("Parcels", 2, True),
        ("trains", 0, True),
    ]
    assert items[0]["has_context"] is True
    assert items[0]["context"] == "Ferries."
    assert items[2]["id"] == trains["id"]


def test_get_returns_one_project(app_on_test_db: Engine) -> None:
    created = create("Parcels")
    add_requirements(app_on_test_db, created["id"], 3)

    response = client.get(f"/api/projects/{created['id']}")

    assert response.status_code == 200
    assert response.json() == {**created, "requirement_count": 3}


def test_get_an_unknown_project_is_404() -> None:
    response = client.get(f"/api/projects/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_listing_runs_the_same_queries_however_many_there_are(
    app_on_test_db: Engine,
) -> None:
    statements: list[str] = []

    def record(_conn: object, _cursor: object, statement: str, *_: object) -> None:
        statements.append(statement)

    def count_list_queries() -> int:
        statements.clear()
        event.listen(app_on_test_db, "before_cursor_execute", record)
        try:
            assert client.get("/api/projects").status_code == 200
        finally:
            event.remove(app_on_test_db, "before_cursor_execute", record)
        return len(statements)

    first = create("First")
    add_requirements(app_on_test_db, first["id"], 1)
    one = count_list_queries()

    for name in ["Second", "Third"]:
        add_requirements(app_on_test_db, create(name)["id"], 2)

    assert count_list_queries() == one


# --- Updating ---------------------------------------------------------------


def test_owner_can_rename_and_set_the_context() -> None:
    created = create("Parcels")

    response = client.patch(
        f"/api/projects/{created['id']}",
        json={"name": " Parcel lockers ", "context": "We run parcel lockers."},
    )

    assert response.status_code == 200
    assert response.json() == {
        **created,
        "name": "Parcel lockers",
        "context": "We run parcel lockers.",
        "has_context": True,
    }
    assert client.get(f"/api/projects/{created['id']}").json() == response.json()


def test_update_leaves_out_fields_unchanged() -> None:
    created = create("Parcels")
    client.patch(f"/api/projects/{created['id']}", json={"context": "Lockers."})

    response = client.patch(f"/api/projects/{created['id']}", json={"name": "Boxes"})

    assert response.json()["context"] == "Lockers."
    assert response.json()["name"] == "Boxes"


def test_blank_context_has_no_context() -> None:
    created = create("Parcels")

    response = client.patch(f"/api/projects/{created['id']}", json={"context": "  \n "})

    assert response.json()["has_context"] is False


def test_update_can_change_the_case_of_its_own_name() -> None:
    created = create("Parcels")

    response = client.patch(f"/api/projects/{created['id']}", json={"name": "PARCELS"})

    assert response.status_code == 200
    assert response.json()["name"] == "PARCELS"


@pytest.mark.parametrize(
    ("body", "field", "message"),
    [
        ({"name": "  "}, "name", "String should have at least 1 character"),
        ({"name": "a" * 121}, "name", "String should have at most 120 characters"),
        (
            {"context": "a" * 20_001},
            "context",
            "String should have at most 20000 characters",
        ),
    ],
)
def test_update_rejects_bad_values(body: dict, field: str, message: str) -> None:
    created = create("Parcels")

    response = client.patch(f"/api/projects/{created['id']}", json=body)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", field]
    assert error["msg"] == message


def test_update_accepts_the_longest_context() -> None:
    created = create("Parcels")

    response = client.patch(
        f"/api/projects/{created['id']}", json={"context": "a" * 20_000}
    )

    assert response.status_code == 200


def test_update_rejects_a_taken_name(app_on_test_db: Engine) -> None:
    create("Parcels")
    trains = create("Trains")

    response = client.patch(f"/api/projects/{trains['id']}", json={"name": "parcels"})

    assert response.status_code == 409
    assert response.json()["detail"] == 'A Project called "parcels" already exists'
    assert client.get(f"/api/projects/{trains['id']}").json()["name"] == "Trains"


def test_only_the_owner_can_update(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    created = create("Parcels")
    app.dependency_overrides[get_current_user] = lambda: someone_else

    response = client.patch(f"/api/projects/{created['id']}", json={"name": "Mine"})

    assert response.status_code == 403
    assert client.get(f"/api/projects/{created['id']}").json() == {
        **created,
        "is_owner": False,
    }
    with Session(app_on_test_db) as session:
        assert session.exec(select(col(Project.name))).all() == ["Parcels"]


def test_update_an_unknown_project_is_404() -> None:
    response = client.patch(f"/api/projects/{uuid.uuid4()}", json={"name": "X"})

    assert response.status_code == 404


# --- Listing every Requirement ---------------------------------------------


def test_the_owner_sees_every_requirement_in_the_project(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    created = create("Parcels")
    other = create("Trains")
    add_requirements(app_on_test_db, created["id"], 2)
    add_requirements(app_on_test_db, other["id"], 1)
    with Session(app_on_test_db) as session:
        session.add(
            Requirement(
                point_of_contact_id=someone_else.id,
                project_id=uuid.UUID(created["id"]),
                idea="Theirs",
                title="Theirs",
            )
        )
        session.commit()

    response = client.get(f"/api/projects/{created['id']}/requirements")

    assert response.status_code == 200
    assert sorted(r["title"] for r in response.json()["items"]) == [
        "Idea 0",
        "Idea 1",
        "Theirs",
    ]


def test_only_the_owner_can_list_every_requirement(
    someone_else: PointOfContact,
) -> None:
    created = create("Parcels")
    app.dependency_overrides[get_current_user] = lambda: someone_else

    response = client.get(f"/api/projects/{created['id']}/requirements")

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Only the Project Owner can see every Requirement in this Project"
    )


def test_listing_the_requirements_of_an_unknown_project_is_404() -> None:
    assert client.get(f"/api/projects/{uuid.uuid4()}/requirements").status_code == 404


# --- Deleting ---------------------------------------------------------------


def test_an_empty_project_deletes_without_the_flag(app_on_test_db: Engine) -> None:
    created = create("Parcels")
    kept = create("Trains")

    response = client.delete(f"/api/projects/{created['id']}")

    assert response.status_code == 204
    assert client.get(f"/api/projects/{created['id']}").status_code == 404
    assert [p["id"] for p in client.get("/api/projects").json()["items"]] == [
        kept["id"]
    ]


def test_a_project_with_requirements_is_409_without_the_flag(
    app_on_test_db: Engine,
) -> None:
    created = create("Parcels")
    add_requirements(app_on_test_db, created["id"], 3)

    response = client.delete(f"/api/projects/{created['id']}")

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "This Project has 3 Requirements; pass with_requirements=true to delete them too"
    )
    assert client.get(f"/api/projects/{created['id']}").json()["requirement_count"] == 3


def test_with_the_flag_it_deletes_the_requirements_and_their_questions_and_notes(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    created = create("Parcels")
    kept_project = create("Trains")
    add_requirements(app_on_test_db, created["id"], 2)
    add_requirements(app_on_test_db, kept_project["id"], 1)
    with Session(app_on_test_db) as session:
        # Someone else's Requirement in the Project goes too.
        theirs = Requirement(
            point_of_contact_id=someone_else.id,
            project_id=uuid.UUID(created["id"]),
            idea="Theirs",
            title="Theirs",
        )
        session.add(theirs)
        session.flush()
        for requirement_id in session.exec(select(col(Requirement.id))):
            session.add(
                Question(
                    requirement_id=requirement_id,
                    topic="Who",
                    text="Who?",
                    position=0,
                    number=1,
                )
            )
            session.add(ReopenNote(requirement_id=requirement_id, note="More"))
        session.commit()

    response = client.delete(
        f"/api/projects/{created['id']}", params={"with_requirements": "true"}
    )

    assert response.status_code == 204
    with Session(app_on_test_db) as session:
        [kept] = session.exec(select(Requirement)).all()
        assert str(kept.project_id) == kept_project["id"]
        assert [q.requirement_id for q in session.exec(select(Question))] == [kept.id]
        assert [n.requirement_id for n in session.exec(select(ReopenNote))] == [kept.id]
        assert session.get(Project, uuid.UUID(created["id"])) is None


def test_a_requirement_count_that_does_not_match_is_409(
    app_on_test_db: Engine,
) -> None:
    created = create("Parcels")
    add_requirements(app_on_test_db, created["id"], 3)

    response = client.delete(
        f"/api/projects/{created['id']}",
        params={"with_requirements": "true", "requirement_count": 2},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "This Project has 3 Requirements, not 2"
    assert client.get(f"/api/projects/{created['id']}").json()["requirement_count"] == 3


def test_a_matching_requirement_count_deletes(app_on_test_db: Engine) -> None:
    created = create("Parcels")
    add_requirements(app_on_test_db, created["id"], 3)

    response = client.delete(
        f"/api/projects/{created['id']}",
        params={"with_requirements": "true", "requirement_count": 3},
    )

    assert response.status_code == 204
    assert client.get(f"/api/projects/{created['id']}").status_code == 404


def test_only_the_owner_can_delete(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    created = create("Parcels")
    app.dependency_overrides[get_current_user] = lambda: someone_else

    response = client.delete(
        f"/api/projects/{created['id']}", params={"with_requirements": "true"}
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only the Project Owner can delete this Project"
    assert client.get(f"/api/projects/{created['id']}").status_code == 200


def test_delete_an_unknown_project_is_404() -> None:
    response = client.delete(f"/api/projects/{uuid.uuid4()}")

    assert response.status_code == 404


# --- OpenAPI ----------------------------------------------------------------


def test_endpoints_are_documented_with_their_response_models() -> None:
    spec = client.get("/openapi.json").json()

    def response_schema(path: str, method: str, status: str) -> str:
        content = spec["paths"][path][method]["responses"][status]["content"]
        return content["application/json"]["schema"]["$ref"]

    assert response_schema("/api/projects", "get", "200").endswith("/ProjectList")
    assert response_schema("/api/projects", "post", "201").endswith("/ProjectPublic")
    for method in ["get", "patch"]:
        assert response_schema("/api/projects/{project_id}", method, "200").endswith(
            "/ProjectPublic"
        )
