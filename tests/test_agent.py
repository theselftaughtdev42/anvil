import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from anvil.agent import AgentDep
from anvil.agent.base import (
    SUGGESTIONS_MAX,
    TITLE_MAX_LENGTH,
    TOPIC_MAX_LENGTH,
    AskedQuestion,
    QuestionDraft,
    RequirementBrief,
)
from anvil.agent.deps import get_agent
from anvil.agent.stub import QUESTIONS, StubAgent
from anvil.models import Question


def title(idea: str) -> str:
    return StubAgent().name_requirement(idea, None)


@pytest.mark.parametrize(
    ("idea", "expected"),
    [
        ("fix the login page", "Fix the login page"),
        (
            "customers should be able to rebook a missed delivery from the text",
            "Customers should be able to rebook…",
        ),
        ("  fix   the\n\tlogin  page  ", "Fix the login page"),
        ("Fix the login page!?", "Fix the login page"),
        (
            "Customers should be able to rebook, ideally",
            "Customers should be able to rebook…",
        ),
        ('Rename the "login"', 'Rename the "login"'),
        ("onboarding", "Onboarding"),
        ("...", "Untitled"),
    ],
    ids=[
        "short",
        "long",
        "extra whitespace",
        "trailing punctuation",
        "punctuation before the cut",
        "closing quote kept",
        "single word",
        "only punctuation",
    ],
)
def test_stub_titles(idea: str, expected: str) -> None:
    assert title(idea) == expected


def test_stub_cuts_long_words_to_the_title_limit() -> None:
    result = title("a" * 200)

    assert len(result) == TITLE_MAX_LENGTH
    assert result == "A" + "a" * (TITLE_MAX_LENGTH - 2) + "…"


def test_stub_is_deterministic() -> None:
    idea = "Let customers rebook a missed delivery from the text message"

    assert len({title(idea) for _ in range(5)}) == 1


def test_stub_ignores_context() -> None:
    agent = StubAgent()

    assert agent.name_requirement("fix login", "Project Context") == "Fix login"


def test_stub_delay() -> None:
    start = time.monotonic()
    StubAgent(delay_ms=50).name_requirement("fix login", None)

    assert time.monotonic() - start >= 0.05


REQUIREMENT = RequirementBrief(
    title="Rebook a missed delivery",
    idea="Let customers rebook a missed delivery from the text message",
)


def answer_all(questions: list[QuestionDraft]) -> list[AskedQuestion]:
    return [
        AskedQuestion(topic=q.topic, text=q.text, answer="An answer") for q in questions
    ]


def test_stub_asks_three_questions_at_a_time_then_none() -> None:
    agent = StubAgent()

    first = agent.ask_questions(REQUIREMENT, [], None)
    answered = answer_all(first)
    second = agent.ask_questions(REQUIREMENT, answered, None)
    answered += answer_all(second)
    third = agent.ask_questions(REQUIREMENT, answered, None)

    assert len(first) == 3
    assert len(second) == 3
    assert {q.text for q in first}.isdisjoint(q.text for q in second)
    assert third == []


def test_stub_skips_questions_already_answered_in_any_order() -> None:
    answered = answer_all([QUESTIONS[4], QUESTIONS[0]])

    asked = StubAgent().ask_questions(REQUIREMENT, answered, None)

    assert asked == [QUESTIONS[1], QUESTIONS[2], QUESTIONS[3]]


def test_stub_does_not_ask_open_questions_again() -> None:
    agent = StubAgent()
    first = agent.ask_questions(REQUIREMENT, [], None)
    still_open = [AskedQuestion(topic=q.topic, text=q.text) for q in first]

    second = agent.ask_questions(REQUIREMENT, still_open, None)

    assert second == list(QUESTIONS[3:])


def test_stub_questions_are_deterministic() -> None:
    agent = StubAgent()
    answered = answer_all(list(QUESTIONS[:3]))

    results = [agent.ask_questions(REQUIREMENT, answered, None) for _ in range(5)]

    assert all(result == results[0] for result in results)


def test_stub_questions_ignore_requirement_and_context() -> None:
    agent = StubAgent()
    other = RequirementBrief(title="Dark mode", idea="Add a dark mode")

    assert agent.ask_questions(other, [], "Project Context") == (
        agent.ask_questions(REQUIREMENT, [], None)
    )


def test_stub_questions_are_complete_and_distinct() -> None:
    assert len(QUESTIONS) == 6
    assert len({q.text for q in QUESTIONS}) == 6
    for question in QUESTIONS:
        assert question.why
        assert len(question.suggestions) == SUGGESTIONS_MAX


def test_question_draft_limits_fit_the_question_table() -> None:
    topic = sa.inspect(Question).columns["topic"]

    # SQLModel's AutoString, which carries a length but isn't an sa.String.
    assert getattr(topic.type, "length", None) == TOPIC_MAX_LENGTH


def test_question_draft_rejects_more_than_three_suggestions() -> None:
    with pytest.raises(ValidationError, match="suggestions"):
        QuestionDraft(topic="Scope", text="What?", suggestions=("a", "b", "c", "d"))


def test_question_draft_rejects_a_topic_too_long_for_its_column() -> None:
    with pytest.raises(ValidationError, match="topic"):
        QuestionDraft(topic="x" * (TOPIC_MAX_LENGTH + 1), text="What?")


@pytest.mark.parametrize(
    ("fields", "field"),
    [
        ({"topic": "  ", "text": "What?"}, "topic"),
        ({"topic": "Scope", "text": "\n"}, "text"),
        (
            {"topic": "Scope", "text": "What?", "suggestions": ("Yes", " ")},
            "suggestions",
        ),
    ],
    ids=["topic", "text", "suggestion"],
)
def test_question_draft_rejects_blank_values(fields: dict, field: str) -> None:
    with pytest.raises(ValidationError, match=field):
        QuestionDraft(**fields)


def test_question_draft_strips_whitespace() -> None:
    draft = QuestionDraft(topic=" Scope ", text=" What? ", suggestions=(" Yes ",))

    assert (draft.topic, draft.text, draft.suggestions) == ("Scope", "What?", ("Yes",))


def test_stub_question_delay() -> None:
    start = time.monotonic()
    StubAgent(delay_ms=50).ask_questions(REQUIREMENT, [], None)

    assert time.monotonic() - start >= 0.05


def test_only_the_agent_package_imports_the_stub() -> None:
    src = Path(__file__).parents[1] / "src" / "anvil"
    agent_package = src / "agent"
    importers = [
        path.relative_to(src)
        for path in src.rglob("*.py")
        if not path.is_relative_to(agent_package)
        and "anvil.agent.stub" in path.read_text()
    ]

    assert importers == []


def test_routes_get_the_agent_from_its_dep() -> None:
    calls: list[tuple[str, str | None]] = []

    class FakeAgent:
        def name_requirement(self, idea: str, context: str | None) -> str:
            calls.append((idea, context))
            return "Fake title"

    app = FastAPI()

    @app.post("/name")
    def name(agent: AgentDep) -> str:
        return agent.name_requirement("an idea", None)

    app.dependency_overrides[get_agent] = FakeAgent

    assert TestClient(app).post("/name").json() == "Fake title"
    assert calls == [("an idea", None)]


# The startup checks run on import, so these start the app in a fresh process.
def start_app(**env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", "from anvil.main import app"],
        check=False,
        env=os.environ | env,
        capture_output=True,
        text=True,
    )


def test_unknown_agent_stops_the_app() -> None:
    result = start_app(AGENT="unknown")

    assert result.returncode != 0
    assert "agent" in result.stderr
    assert "'unknown'" in result.stderr
