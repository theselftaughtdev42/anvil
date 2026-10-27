import pytest
from idea_refiner import Limits, QuestionDraft
from pydantic import ValidationError


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


def test_limits_accept_a_draft_at_the_limits() -> None:
    Limits(topic=5, suggestions=2).check(
        QuestionDraft(topic="Scope", text="What?", suggestions=("a", "b"))
    )


def test_limits_reject_a_long_topic() -> None:
    with pytest.raises(ValueError, match="topic"):
        Limits(topic=4).check(QuestionDraft(topic="Scope", text="What?"))


def test_limits_reject_too_many_suggestions() -> None:
    with pytest.raises(ValueError, match="suggestions"):
        Limits(suggestions=2).check(
            QuestionDraft(topic="Scope", text="What?", suggestions=("a", "b", "c"))
        )


def test_limits_need_room_for_a_cut_title() -> None:
    with pytest.raises(ValidationError, match="title"):
        Limits(title=9)
