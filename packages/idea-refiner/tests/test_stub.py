import time

import pytest
from idea_refiner import AskedQuestion, Limits, QuestionDraft, StubAgent, Subject
from idea_refiner.stub import QUESTIONS


def title(idea: str) -> str:
    return StubAgent().name_idea(idea, None)


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
def test_titles(idea: str, expected: str) -> None:
    assert title(idea) == expected


def test_cuts_long_words_to_the_title_limit() -> None:
    result = StubAgent(limits=Limits(title=20)).name_idea("a" * 200, None)

    assert result == "A" + "a" * 18 + "…"


def test_titles_are_deterministic() -> None:
    idea = "Let customers rebook a missed delivery from the text message"

    assert len({title(idea) for _ in range(5)}) == 1


def test_titles_ignore_context() -> None:
    assert StubAgent().name_idea("fix login", "Some context") == "Fix login"


def test_title_delay() -> None:
    start = time.monotonic()
    StubAgent(delay_ms=50).name_idea("fix login", None)

    assert time.monotonic() - start >= 0.05


SUBJECT = Subject(
    title="Rebook a missed delivery",
    idea="Let customers rebook a missed delivery from the text message",
)


def answer_all(questions: list[QuestionDraft]) -> list[AskedQuestion]:
    return [
        AskedQuestion(topic=q.topic, text=q.text, answer="An answer") for q in questions
    ]


def test_asks_three_questions_at_a_time_then_none() -> None:
    agent = StubAgent()

    first = agent.ask_questions(SUBJECT, [], None)
    answered = answer_all(first)
    second = agent.ask_questions(SUBJECT, answered, None)
    answered += answer_all(second)
    third = agent.ask_questions(SUBJECT, answered, None)

    assert len(first) == 3
    assert len(second) == 3
    assert {q.text for q in first}.isdisjoint(q.text for q in second)
    assert third == []


def test_skips_questions_already_answered_in_any_order() -> None:
    answered = answer_all([QUESTIONS[4], QUESTIONS[0]])

    asked = StubAgent().ask_questions(SUBJECT, answered, None)

    assert asked == [QUESTIONS[1], QUESTIONS[2], QUESTIONS[3]]


def test_does_not_ask_unanswered_questions_again() -> None:
    agent = StubAgent()
    first = agent.ask_questions(SUBJECT, [], None)
    unanswered = [AskedQuestion(topic=q.topic, text=q.text) for q in first]

    second = agent.ask_questions(SUBJECT, unanswered, None)

    assert second == list(QUESTIONS[3:])


def test_questions_are_deterministic() -> None:
    agent = StubAgent()
    answered = answer_all(list(QUESTIONS[:3]))

    results = [agent.ask_questions(SUBJECT, answered, None) for _ in range(5)]

    assert all(result == results[0] for result in results)


def test_questions_ignore_subject_and_context() -> None:
    agent = StubAgent()
    other = Subject(title="Dark mode", idea="Add a dark mode")

    assert agent.ask_questions(other, [], "Some context") == (
        agent.ask_questions(SUBJECT, [], None)
    )


def test_questions_are_complete_and_distinct() -> None:
    assert len(QUESTIONS) == 6
    assert len({q.text for q in QUESTIONS}) == 6
    for question in QUESTIONS:
        assert question.why
        assert len(question.suggestions) == 3


def test_cuts_suggestions_to_the_limit() -> None:
    asked = StubAgent(limits=Limits(suggestions=1)).ask_questions(SUBJECT, [], None)

    assert [q.suggestions for q in asked] == [q.suggestions[:1] for q in QUESTIONS[:3]]


def test_refuses_a_topic_over_the_limit() -> None:
    with pytest.raises(ValueError, match="topic"):
        StubAgent(limits=Limits(topic=5)).ask_questions(SUBJECT, [], None)


def test_question_delay() -> None:
    start = time.monotonic()
    StubAgent(delay_ms=50).ask_questions(SUBJECT, [], None)

    assert time.monotonic() - start >= 0.05
