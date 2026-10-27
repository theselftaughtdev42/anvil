import uuid
from collections.abc import Iterator, Sequence

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from idea_refiner import AskedQuestion, QuestionDraft, Subject
from sqlalchemy import Engine, event
from sqlmodel import Session, select

from anvil.agent import get_agent
from anvil.auth import get_current_user
from anvil.db import get_session
from anvil.main import app
from anvil.models import (
    PointOfContact,
    Project,
    Question,
    QuestionStatus,
    Requirement,
    RequirementStatus,
)
from anvil.refinement import deal_questions

client = TestClient(app)


class FakeAgent:
    """Titles every idea "Title for: <idea>", asks the Questions queued in
    `batches` one batch per call (nothing once they run out), and records what
    it was asked. `feedback` holds the feedback each ask got."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []
        self.batches: list[list[QuestionDraft]] = []
        self.asks: list[tuple[Subject, list[AskedQuestion], str | None]] = []
        self.feedback: list[list[str]] = []

    def name_idea(self, idea: str, context: str | None) -> str:
        self.calls.append((idea, context))
        return f"Title for: {idea}"[:80]

    def ask_questions(
        self,
        subject: Subject,
        asked: Sequence[AskedQuestion],
        context: str | None,
        feedback: Sequence[str],
    ) -> list[QuestionDraft]:
        self.asks.append((subject, list(asked), context))
        self.feedback.append(list(feedback))
        return self.batches.pop(0) if self.batches else []


class FailingAgent:
    """Fails any test that asks it anything."""

    def name_idea(self, idea: str, context: str | None) -> str:
        raise AssertionError("name_idea was called")

    def ask_questions(
        self,
        subject: Subject,
        asked: Sequence[AskedQuestion],
        context: str | None,
        feedback: Sequence[str],
    ) -> list[QuestionDraft]:
        raise AssertionError("ask_questions was called")


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
        project = Project(owner_id=owner.id, name=f"{owner.name}'s project")
        session.add(project)
        session.flush()
        requirement = Requirement(
            point_of_contact_id=owner.id,
            project_id=project.id,
            idea="Theirs",
            title="Theirs",
            status=status,
        )
        session.add(requirement)
        session.commit()
        return requirement.id


def add_project(name: str) -> dict:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def set_context(project: dict, context: str) -> None:
    response = client.patch(f"/api/projects/{project['id']}", json={"context": context})
    assert response.status_code == 200, response.text


def parcels() -> dict:
    """The "Parcels" Project, with the Project Context "We deliver parcels.",
    created the first time it's needed."""
    for project in client.get("/api/projects").json()["items"]:
        if project["name"] == "Parcels":
            return project
    project = add_project("Parcels")
    set_context(project, "We deliver parcels.")
    return project


def create(idea: str, project: dict | None = None) -> dict:
    project_id = (project or parcels())["id"]
    response = client.post(
        "/api/requirements", json={"project_id": project_id, "idea": idea}
    )
    assert response.status_code == 201, response.text
    return response.json()


def set_status(engine: Engine, id: str, status: RequirementStatus) -> None:
    with Session(engine) as session:
        requirement = session.get_one(Requirement, uuid.UUID(id))
        requirement.status = status
        session.commit()


# --- Creating ---------------------------------------------------------------


def test_create_returns_the_draft_requirement(agent: FakeAgent) -> None:
    project = parcels()

    response = client.post(
        "/api/requirements",
        json={"project_id": project["id"], "idea": "  Rebook a missed delivery  "},
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "title": "Title for: Rebook a missed delivery",
        "idea": "Rebook a missed delivery",
        "project": {"id": project["id"], "name": "Parcels"},
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
    assert str(stored.project_id) == body["project"]["id"]


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
    response = client.post(
        "/api/requirements", json={"project_id": parcels()["id"], **body}
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "idea"]
    assert error["msg"] == message
    assert agent.calls == []
    with Session(app_on_test_db) as session:
        assert session.exec(select(Requirement)).all() == []


def test_create_needs_a_project(app_on_test_db: Engine, agent: FakeAgent) -> None:
    response = client.post("/api/requirements", json={"idea": "Rebook"})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "project_id"]
    assert agent.calls == []
    with Session(app_on_test_db) as session:
        assert session.exec(select(Requirement)).all() == []
        assert session.exec(select(Project)).all() == []


def test_create_rejects_an_unknown_project(
    app_on_test_db: Engine, agent: FakeAgent
) -> None:
    response = client.post(
        "/api/requirements", json={"project_id": str(uuid.uuid4()), "idea": "Rebook"}
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Project not found"}
    assert agent.calls == []
    with Session(app_on_test_db) as session:
        assert session.exec(select(Requirement)).all() == []


def test_create_accepts_someone_elses_project(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    with Session(app_on_test_db) as session:
        theirs = Project(owner_id=someone_else.id, name="Theirs")
        session.add(theirs)
        session.commit()
        project = {"id": str(theirs.id), "name": "Theirs"}

    assert create("Rebook", project)["project"] == project


# --- Listing ----------------------------------------------------------------


def test_list_is_empty_to_start_with() -> None:
    response = client.get("/api/requirements")

    assert response.status_code == 200
    assert response.json() == {"items": []}


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

    assert client.get("/api/requirements").json()["items"] == [mine]


def test_list_filters_by_project() -> None:
    parcels_requirement = create("Rebook")
    lockers = add_project("Lockers")
    lockers_requirement = create("Find a locker", lockers)

    response = client.get("/api/requirements", params={"project_id": lockers["id"]})

    assert response.status_code == 200
    assert response.json()["items"] == [lockers_requirement]
    assert client.get(
        "/api/requirements", params={"project_id": parcels()["id"]}
    ).json()["items"] == [parcels_requirement]


def test_list_filter_on_an_unknown_project_is_empty() -> None:
    create("Rebook")

    response = client.get("/api/requirements", params={"project_id": str(uuid.uuid4())})

    assert response.json() == {"items": []}


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


# --- Changing the Project -----------------------------------------------------


def change_project(id: str, project_id: str) -> Response:
    return client.patch(f"/api/requirements/{id}", json={"project_id": project_id})


def test_changing_the_project_of_a_draft_moves_it(agent: FakeAgent) -> None:
    created = create("Rebook a missed delivery")
    lockers = add_project("Lockers")

    response = change_project(created["id"], lockers["id"])

    assert response.status_code == 200
    body = response.json()
    assert body["project"] == {"id": lockers["id"], "name": "Lockers"}
    assert client.get(f"/api/requirements/{created['id']}").json() == body


def test_changing_the_project_replaces_the_open_questions(
    agent: FakeAgent, app_on_test_db: Engine
) -> None:
    agent.batches = [[draft("Who"), draft("When")], [draft("Where")]]
    created = create("Rebook a missed delivery")
    old = questions(created["id"])["open"]

    change_project(created["id"], add_project("Lockers")["id"])

    stack = questions(created["id"])
    assert topics(stack["open"]) == ["Where"]
    assert stack["open"][0]["number"] == 1
    # Asked afresh, with nothing carried over from the old Project.
    assert agent.asks[-1][1] == []
    with Session(app_on_test_db) as session:
        stored = {str(q.id) for q in session.exec(select(Question))}
    assert stored.isdisjoint(q["id"] for q in old)


def test_changing_the_project_of_an_exhausted_draft_asks_again(
    agent: FakeAgent,
) -> None:
    created = create("Rebook a missed delivery")
    assert questions(created["id"])["exhausted"] is True
    agent.batches = [[draft("Where")]]

    change_project(created["id"], add_project("Lockers")["id"])

    stack = questions(created["id"])
    assert topics(stack["open"]) == ["Where"]
    assert stack["exhausted"] is False


def test_changing_the_project_asks_with_its_project_context(
    agent: FakeAgent,
) -> None:
    created = create("Rebook a missed delivery")
    lockers = add_project("Lockers")
    set_context(lockers, "We run parcel lockers.")

    change_project(created["id"], lockers["id"])

    assert agent.asks[-1][2] == "We run parcel lockers."


def test_changing_to_the_same_project_changes_nothing(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")
    before = questions(created["id"])
    app.dependency_overrides[get_agent] = FailingAgent

    response = change_project(created["id"], created["project"]["id"])

    assert response.status_code == 200
    assert questions(created["id"]) == before


@pytest.mark.parametrize(
    "status", [RequirementStatus.IN_PROGRESS, RequirementStatus.COMPLETE]
)
def test_the_project_is_locked_once_a_question_is_answered(
    status: RequirementStatus, agent: FakeAgent, app_on_test_db: Engine
) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    answer(created["id"], questions(created["id"])["open"][0])
    set_status(app_on_test_db, created["id"], status)
    before = questions(created["id"])
    app.dependency_overrides[get_agent] = FailingAgent

    response = change_project(created["id"], add_project("Lockers")["id"])

    assert response.status_code == 409
    assert response.json() == {
        "detail": "The Project is locked once a Question is answered"
    }
    after = client.get(f"/api/requirements/{created['id']}").json()
    assert after["project"] == created["project"]
    assert questions(created["id"]) == before


def test_changing_to_an_unknown_project_is_422(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")
    before = questions(created["id"])

    response = change_project(created["id"], str(uuid.uuid4()))

    assert response.status_code == 422
    assert client.get(f"/api/requirements/{created['id']}").json() == created
    assert questions(created["id"]) == before


def test_changing_the_project_needs_a_project_id() -> None:
    created = create("Rebook a missed delivery")

    response = client.patch(f"/api/requirements/{created['id']}", json={})

    assert response.status_code == 422


def test_changing_someone_elses_requirement_is_404(
    app_on_test_db: Engine, someone_else: PointOfContact
) -> None:
    theirs = add_requirement(app_on_test_db, someone_else)

    response = change_project(str(theirs), parcels()["id"])

    assert response.status_code == 404


# --- Overriding the user ----------------------------------------------------


def test_requirements_belong_to_whoever_is_current(
    someone_else: PointOfContact,
) -> None:
    create("Mine")
    app.dependency_overrides[get_current_user] = lambda: someone_else

    assert client.get("/api/requirements").json()["items"] == []


# --- Refinement -------------------------------------------------------------


def draft(topic: str) -> QuestionDraft:
    return QuestionDraft(topic=topic, text=f"About {topic}?")


def questions(id: str) -> dict:
    response = client.get(f"/api/requirements/{id}/questions")
    assert response.status_code == 200, response.text
    return response.json()


def answer(id: str, question: dict, text: str = "An answer") -> dict:
    response = client.post(
        f"/api/requirements/{id}/questions/{question['id']}/answer",
        json={"answer": text},
    )
    assert response.status_code == 200, response.text
    return response.json()


def later(id: str, question: dict) -> dict:
    response = client.post(f"/api/requirements/{id}/questions/{question['id']}/later")
    assert response.status_code == 200, response.text
    return response.json()


def topics(questions: list[dict]) -> list[str]:
    return [question["topic"] for question in questions]


def test_creating_deals_the_first_batch(agent: FakeAgent) -> None:
    agent.batches = [
        [
            QuestionDraft(
                topic="Who",
                text="Who will use it?",
                why="It shapes what good looks like.",
                suggestions=("Customers", "Staff"),
            ),
            draft("When"),
        ]
    ]

    created = create("Rebook a missed delivery")
    stack = questions(created["id"])

    assert stack == {
        "open": [
            {
                "id": stack["open"][0]["id"],
                "topic": "Who",
                "text": "Who will use it?",
                "why": "It shapes what good looks like.",
                "suggestions": ["Customers", "Staff"],
                "number": 1,
            },
            {
                "id": stack["open"][1]["id"],
                "topic": "When",
                "text": "About When?",
                "why": None,
                "suggestions": [],
                "number": 2,
            },
        ],
        "answered": [],
        "exhausted": False,
        "nothing_new_since_reopen": False,
    }
    assert agent.asks == [
        (
            Subject(
                title="Title for: Rebook a missed delivery",
                idea="Rebook a missed delivery",
            ),
            [],
            "We deliver parcels.",
        )
    ]


def test_a_project_without_context_gives_the_agent_none(agent: FakeAgent) -> None:
    create("Rebook a missed delivery", add_project("Lockers"))

    assert agent.calls == [("Rebook a missed delivery", None)]
    assert agent.asks[0][2] is None


def test_a_blank_project_context_gives_the_agent_none(agent: FakeAgent) -> None:
    lockers = add_project("Lockers")
    set_context(lockers, "  \n ")

    create("Rebook a missed delivery", lockers)

    assert agent.calls == [("Rebook a missed delivery", None)]
    assert agent.asks[0][2] is None


def test_each_requirement_gets_its_own_project_context(agent: FakeAgent) -> None:
    lockers = add_project("Lockers")
    set_context(lockers, "We run parcel lockers.")

    create("Rebook a missed delivery")
    create("Open a locker remotely", lockers)

    assert [context for _, context in agent.calls] == [
        "We deliver parcels.",
        "We run parcel lockers.",
    ]
    assert [context for _, _, context in agent.asks] == [
        "We deliver parcels.",
        "We run parcel lockers.",
    ]


def test_editing_the_project_context_changes_the_next_questions(
    agent: FakeAgent,
) -> None:
    agent.batches = [[draft("Who")], [draft("When")]]
    created = create("Rebook a missed delivery")
    set_context(parcels(), "We deliver parcels and pallets.")

    answer(created["id"], questions(created["id"])["open"][0])

    assert agent.asks[-1][2] == "We deliver parcels and pallets."


def test_creating_with_nothing_to_ask_is_exhausted() -> None:
    created = create("Rebook a missed delivery")

    assert questions(created["id"]) == {
        "open": [],
        "answered": [],
        "exhausted": True,
        "nothing_new_since_reopen": False,
    }


def test_getting_questions_never_asks_the_agent(app_on_test_db: Engine) -> None:
    me = client.get("/api/me").json()
    with Session(app_on_test_db) as session:
        owner = session.get_one(PointOfContact, uuid.UUID(me["id"]))
    # Nothing open and not exhausted: the one state where dealing would ask.
    id = add_requirement(app_on_test_db, owner)
    app.dependency_overrides[get_agent] = FailingAgent

    assert questions(str(id)) == {
        "open": [],
        "answered": [],
        "exhausted": False,
        "nothing_new_since_reopen": False,
    }


def test_answering_moves_a_question_to_answered(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    who, when = questions(created["id"])["open"]

    stack = answer(created["id"], who, "  Anyone with the link  ")

    assert stack == {
        "open": [when],
        "answered": [
            {
                "id": who["id"],
                "topic": "Who",
                "text": "About Who?",
                "answer": "Anyone with the link",
                "number": 1,
            }
        ],
        "exhausted": False,
        "nothing_new_since_reopen": False,
    }
    assert questions(created["id"]) == stack


def test_the_first_answer_moves_draft_to_in_progress(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    who, when = questions(created["id"])["open"]

    answer(created["id"], who)
    after_first = client.get(f"/api/requirements/{created['id']}").json()
    answer(created["id"], when)
    after_second = client.get(f"/api/requirements/{created['id']}").json()

    assert after_first["status"] == "in_progress"
    assert after_first["updated_at"] > created["updated_at"]
    assert after_second["status"] == "in_progress"
    assert after_second["updated_at"] > after_first["updated_at"]


def test_answered_is_in_the_order_answered(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When"), draft("Why")]]
    created = create("Rebook a missed delivery")
    who, when, _ = questions(created["id"])["open"]

    answer(created["id"], when)
    stack = answer(created["id"], who)

    assert topics(stack["answered"]) == ["When", "Who"]
    assert topics(stack["open"]) == ["Why"]


def test_answering_the_last_open_question_deals_the_next_batch(
    agent: FakeAgent,
) -> None:
    agent.batches = [[draft("Who"), draft("When")], [draft("Why"), draft("How")]]
    created = create("Rebook a missed delivery")
    who, when = questions(created["id"])["open"]
    answer(created["id"], who, "Customers")
    assert len(agent.asks) == 1

    stack = answer(created["id"], when)

    assert topics(stack["open"]) == ["Why", "How"]
    assert [question["number"] for question in stack["open"]] == [3, 4]
    assert stack["exhausted"] is False
    _, asked, _ = agent.asks[1]
    assert asked == [
        AskedQuestion(topic="Who", text="About Who?", answer="Customers"),
        AskedQuestion(topic="When", text="About When?", answer="An answer"),
    ]


def test_an_empty_batch_exhausts_the_requirement(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")

    stack = answer(created["id"], questions(created["id"])["open"][0])

    assert stack["open"] == []
    assert stack["exhausted"] is True
    assert len(agent.asks) == 2


def test_an_answer_that_exhausts_shares_one_timestamp(
    app_on_test_db: Engine, agent: FakeAgent
) -> None:
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")

    answer(created["id"], questions(created["id"])["open"][0])

    with Session(app_on_test_db) as session:
        requirement = session.get_one(Requirement, uuid.UUID(created["id"]))
        question = session.exec(select(Question)).one()
    assert requirement.questions_exhausted_at is not None
    assert requirement.updated_at == question.answered_at
    assert requirement.updated_at == requirement.questions_exhausted_at


def test_an_exhausted_requirement_isnt_asked_again(
    app_on_test_db: Engine,
) -> None:
    created = create("Rebook a missed delivery")

    with Session(app_on_test_db) as session:
        requirement = session.get_one(Requirement, uuid.UUID(created["id"]))
        deal_questions(session, requirement, FailingAgent())
        session.commit()

    assert questions(created["id"])["exhausted"] is True


def test_later_moves_a_question_to_the_bottom(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When"), draft("Why")]]
    created = create("Rebook a missed delivery")
    who, when, why = questions(created["id"])["open"]

    stack = later(created["id"], who)

    assert topics(stack["open"]) == ["When", "Why", "Who"]
    assert questions(created["id"]) == stack
    assert topics(answer(created["id"], when)["open"]) == ["Why", "Who"]
    assert topics(answer(created["id"], why)["open"]) == ["Who"]


def test_later_keeps_the_question_its_number(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    who, _ = questions(created["id"])["open"]

    stack = later(created["id"], who)

    assert stack["open"][-1] == who


def test_later_on_the_only_open_question_changes_nothing(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")
    before = questions(created["id"])

    assert later(created["id"], before["open"][0]) == before
    assert len(agent.asks) == 1


@pytest.mark.parametrize("action", ["answer", "later"])
def test_a_question_that_isnt_open_is_409(agent: FakeAgent, action: str) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    who, _ = questions(created["id"])["open"]
    answer(created["id"], who)

    response = client.post(
        f"/api/requirements/{created['id']}/questions/{who['id']}/{action}",
        json={"answer": "Again"},
    )

    assert response.status_code == 409


@pytest.mark.parametrize("action", ["answer", "later"])
def test_another_requirements_question_is_404(agent: FakeAgent, action: str) -> None:
    agent.batches = [[draft("Who")], [draft("When")]]
    first = create("First")
    second = create("Second")
    theirs = questions(second["id"])["open"][0]

    response = client.post(
        f"/api/requirements/{first['id']}/questions/{theirs['id']}/{action}",
        json={"answer": "An answer"},
    )

    assert response.status_code == 404
    assert questions(second["id"])["open"] == [theirs]


@pytest.mark.parametrize("action", ["answer", "later"])
def test_an_unknown_question_is_404(action: str) -> None:
    created = create("Rebook a missed delivery")

    response = client.post(
        f"/api/requirements/{created['id']}/questions/{uuid.uuid4()}/{action}",
        json={"answer": "An answer"},
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "questions"),
        ("post", f"questions/{uuid.uuid4()}/answer"),
        ("post", f"questions/{uuid.uuid4()}/later"),
    ],
)
def test_someone_elses_questions_are_404(
    app_on_test_db: Engine, someone_else: PointOfContact, method: str, path: str
) -> None:
    theirs = add_requirement(app_on_test_db, someone_else)

    response = client.request(
        method, f"/api/requirements/{theirs}/{path}", json={"answer": "An answer"}
    )

    assert response.status_code == 404


def test_an_answer_of_the_maximum_length_is_accepted(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    who, _ = questions(created["id"])["open"]

    stack = answer(created["id"], who, "a" * 2000)

    assert stack["answered"][0]["answer"] == "a" * 2000


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"answer": ""}, "String should have at least 1 character"),
        ({"answer": "   \n\t "}, "String should have at least 1 character"),
        ({"answer": "a" * 2001}, "String should have at most 2000 characters"),
        ({}, "Field required"),
    ],
)
def test_a_bad_answer_is_rejected(agent: FakeAgent, body: dict, message: str) -> None:
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")
    before = questions(created["id"])

    response = client.post(
        f"/api/requirements/{created['id']}/questions/{before['open'][0]['id']}/answer",
        json=body,
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "answer"]
    assert error["msg"] == message
    assert questions(created["id"]) == before


# --- Confirming and reopening ------------------------------------------------


def confirm(id: str) -> Response:
    return client.post(f"/api/requirements/{id}/confirm")


def reopen(id: str, note: str = "Refunds") -> Response:
    return client.post(f"/api/requirements/{id}/reopen", json={"note": note})


def looks_ready(agent: FakeAgent) -> str:
    """A Requirement with one Question answered and nothing more to ask."""
    agent.batches = [[draft("Who")]]
    created = create("Rebook a missed delivery")
    answer(created["id"], questions(created["id"])["open"][0])
    return created["id"]


def completed(agent: FakeAgent) -> str:
    id = looks_ready(agent)
    assert confirm(id).status_code == 200
    return id


def status_everywhere(id: str) -> set[str]:
    [listed] = client.get("/api/requirements").json()["items"]
    return {client.get(f"/api/requirements/{id}").json()["status"], listed["status"]}


def test_confirming_makes_it_complete(agent: FakeAgent) -> None:
    id = looks_ready(agent)
    before = client.get(f"/api/requirements/{id}").json()

    response = confirm(id)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "complete"
    assert response.json()["updated_at"] > before["updated_at"]
    assert status_everywhere(id) == {"complete"}


def test_confirming_with_questions_still_to_ask_is_409(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    answer(created["id"], questions(created["id"])["open"][0])

    assert confirm(created["id"]).status_code == 409
    assert status_everywhere(created["id"]) == {"in_progress"}


def test_confirming_a_complete_requirement_is_409(agent: FakeAgent) -> None:
    assert confirm(completed(agent)).status_code == 409


def test_reopening_with_a_note_asks_with_it(agent: FakeAgent) -> None:
    id = completed(agent)
    agent.batches = [[draft("Refunds")]]

    response = reopen(id, "  What about refunds?  ")

    assert response.status_code == 200, response.text
    stack = response.json()
    assert topics(stack["open"]) == ["Refunds"]
    assert stack["exhausted"] is False
    assert stack["nothing_new_since_reopen"] is False
    assert agent.feedback[-1] == ["What about refunds?"]
    assert status_everywhere(id) == {"in_progress"}


def test_every_later_ask_gets_every_note_in_order(agent: FakeAgent) -> None:
    id = completed(agent)
    agent.batches = [[draft("Refunds")]]
    reopen(id, "Refunds")
    answer(id, questions(id)["open"][0])
    confirm(id)

    reopen(id, "Lockers")

    assert agent.feedback == [[], [], ["Refunds"], ["Refunds"], ["Refunds", "Lockers"]]


def test_reopening_with_nothing_new_to_ask_looks_ready_again(agent: FakeAgent) -> None:
    id = completed(agent)

    stack = reopen(id).json()

    assert stack["open"] == []
    assert stack["exhausted"] is True
    assert stack["nothing_new_since_reopen"] is True
    assert questions(id) == stack
    assert status_everywhere(id) == {"in_progress"}
    assert confirm(id).status_code == 200


def test_answering_after_a_reopen_isnt_nothing_new(agent: FakeAgent) -> None:
    id = completed(agent)
    agent.batches = [[draft("Refunds")]]
    reopen(id)

    stack = answer(id, questions(id)["open"][0])

    assert stack["exhausted"] is True
    assert stack["nothing_new_since_reopen"] is False


@pytest.mark.parametrize("status", ["draft", "in_progress"])
def test_reopening_a_requirement_that_isnt_complete_is_409(
    agent: FakeAgent, app_on_test_db: Engine, status: str
) -> None:
    id = looks_ready(agent)
    set_status(app_on_test_db, id, RequirementStatus(status))

    assert reopen(id).status_code == 409
    assert agent.feedback[-1:] == [[]]


@pytest.mark.parametrize("note", ["", "   "])
def test_reopening_needs_a_note(agent: FakeAgent, note: str) -> None:
    id = completed(agent)

    assert reopen(id, note).status_code == 422
    assert status_everywhere(id) == {"complete"}


def test_a_note_over_the_limit_is_rejected(agent: FakeAgent) -> None:
    assert reopen(completed(agent), "x" * 2001).status_code == 422


@pytest.mark.parametrize("action", ["confirm", "reopen"])
def test_someone_elses_requirement_is_404_to_confirm_or_reopen(
    app_on_test_db: Engine, someone_else: PointOfContact, action: str
) -> None:
    id = add_requirement(app_on_test_db, someone_else, RequirementStatus.COMPLETE)

    response = confirm(str(id)) if action == "confirm" else reopen(str(id))

    assert response.status_code == 404


# --- Progress ---------------------------------------------------------------


def test_progress_counts_open_and_answered_questions(agent: FakeAgent) -> None:
    agent.batches = [[draft("Who"), draft("When"), draft("Where")]]
    created = create("Rebook a missed delivery")
    assert created["progress"] == {"answered": 0, "total": 3}

    answer(created["id"], questions(created["id"])["open"][0])

    expected = {"answered": 1, "total": 3}
    assert client.get(f"/api/requirements/{created['id']}").json()["progress"] == (
        expected
    )
    [listed] = client.get("/api/requirements").json()["items"]
    assert listed["progress"] == expected


def test_progress_leaves_out_dismissed_questions(
    agent: FakeAgent, app_on_test_db: Engine
) -> None:
    agent.batches = [[draft("Who"), draft("When")]]
    created = create("Rebook a missed delivery")
    with Session(app_on_test_db) as session:
        question = session.exec(select(Question).where(Question.topic == "When")).one()
        question.status = QuestionStatus.DISMISSED
        session.commit()

    progress = client.get(f"/api/requirements/{created['id']}").json()["progress"]

    assert progress == {"answered": 0, "total": 1}


def test_progress_is_null_without_questions() -> None:
    created = create("Rebook a missed delivery")

    [listed] = client.get("/api/requirements").json()["items"]

    assert created["progress"] is None
    assert listed["progress"] is None


def test_listing_runs_the_same_queries_however_many_there_are(
    agent: FakeAgent, app_on_test_db: Engine
) -> None:
    statements: list[str] = []

    def record(_conn: object, _cursor: object, statement: str, *_: object) -> None:
        statements.append(statement)

    def count_list_queries() -> int:
        statements.clear()
        event.listen(app_on_test_db, "before_cursor_execute", record)
        try:
            assert client.get("/api/requirements").status_code == 200
        finally:
            event.remove(app_on_test_db, "before_cursor_execute", record)
        return len(statements)

    agent.batches = [[draft("Who")]]
    create("First")
    one = count_list_queries()

    agent.batches = [[draft("Who")], [draft("What"), draft("When")]]
    create("Second")
    create("Third")

    assert count_list_queries() == one


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
    for method in ["get", "patch"]:
        assert response_schema(
            "/api/requirements/{requirement_id}", method, "200"
        ).endswith("/RequirementPublic")
    assert response_schema(
        "/api/requirements/{requirement_id}/confirm", "post", "200"
    ).endswith("/RequirementPublic")
    questions = "/api/requirements/{requirement_id}/questions"
    for path, method in [
        (questions, "get"),
        (questions + "/{question_id}/answer", "post"),
        (questions + "/{question_id}/later", "post"),
        ("/api/requirements/{requirement_id}/reopen", "post"),
    ]:
        assert response_schema(path, method, "200").endswith("/QuestionStack")
