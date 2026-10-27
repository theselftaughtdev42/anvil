import pytest
from idea_refiner import QuestionDraft
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
