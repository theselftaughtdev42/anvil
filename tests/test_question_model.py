import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from anvil.models import PointOfContact, Question, QuestionStatus, Requirement


@pytest.fixture
def session(migrated_db: Engine):
    with Session(migrated_db) as session:
        yield session


@pytest.fixture
def requirement(session: Session) -> Requirement:
    person = PointOfContact(name="Ada", email="ada@example.com")
    session.add(person)
    session.flush()
    requirement = Requirement(
        point_of_contact_id=person.id, idea="An idea", title="Idea"
    )
    session.add(requirement)
    session.commit()
    return requirement


def test_new_question_is_open_with_no_answer(
    session: Session, requirement: Requirement
) -> None:
    question = Question(
        requirement_id=requirement.id,
        topic="Edge cases",
        text="What happens when the export is empty?",
        suggestions=["Show a blank page", "Disable the button"],
        position=0,
        number=1,
    )
    session.add(question)
    session.commit()
    session.refresh(question)

    assert question.status == QuestionStatus.OPEN
    assert question.suggestions == ["Show a blank page", "Disable the button"]
    assert question.answer is None and question.answered_at is None
    assert question.created_at is not None


def test_question_needs_an_existing_requirement(session: Session) -> None:
    session.add(
        Question(
            requirement_id=uuid.uuid4(), topic="Scope", text="?", position=0, number=1
        )
    )

    with pytest.raises(IntegrityError, match="foreign key"):
        session.commit()


@pytest.mark.parametrize(
    ("answer", "answered_at"),
    [("Yes", None), (None, datetime.now(UTC))],
)
def test_answer_and_answered_at_are_set_together(
    session: Session,
    requirement: Requirement,
    answer: str | None,
    answered_at: datetime | None,
) -> None:
    session.add(
        Question(
            requirement_id=requirement.id,
            topic="Scope",
            text="?",
            position=0,
            number=1,
            answer=answer,
            answered_at=answered_at,
        )
    )

    with pytest.raises(IntegrityError, match="ck_question_answer_with_answered_at"):
        session.commit()


def test_answering_a_question_saves_answer_and_answered_at(
    session: Session, requirement: Requirement
) -> None:
    question = Question(
        requirement_id=requirement.id, topic="Scope", text="?", position=0, number=1
    )
    session.add(question)
    session.commit()

    question.status = QuestionStatus.ANSWERED
    question.answer = "Yes"
    question.answered_at = datetime.now(UTC)
    session.commit()
    session.expire_all()

    assert question.status == QuestionStatus.ANSWERED
    assert question.answer == "Yes"
    assert question.answered_at is not None


def test_changing_suggestions_in_place_is_saved(
    session: Session, requirement: Requirement
) -> None:
    question = Question(
        requirement_id=requirement.id,
        topic="Scope",
        text="?",
        position=0,
        number=1,
        suggestions=["A"],
    )
    session.add(question)
    session.commit()

    question.suggestions.append("B")
    session.commit()
    session.expire_all()

    assert question.suggestions == ["A", "B"]


def test_suggestions_must_be_a_list(session: Session, requirement: Requirement) -> None:
    # Raw SQL, since MutableList already refuses a non-list in Python.
    with pytest.raises(IntegrityError, match="ck_question_suggestions_is_array"):
        session.connection().execute(
            text(
                "INSERT INTO question (id, requirement_id, topic, text, position, "
                "number, suggestions) VALUES (:id, :requirement_id, 'Scope', '?', "
                "0, 1, '\"A\"'::jsonb)"
            ),
            {"id": uuid.uuid4(), "requirement_id": requirement.id},
        )


def test_numbers_are_unique_within_a_requirement(
    session: Session, requirement: Requirement
) -> None:
    for position in (0, 1):
        session.add(
            Question(
                requirement_id=requirement.id,
                topic="Scope",
                text="?",
                position=position,
                number=1,
            )
        )

    with pytest.raises(IntegrityError, match="uq_question_requirement_id_number"):
        session.commit()
