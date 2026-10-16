import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from anvil.models import PointOfContact, Requirement, RequirementStatus


@pytest.fixture
def session(migrated_db: Engine):
    with Session(migrated_db) as session:
        yield session


@pytest.fixture
def point_of_contact(session: Session) -> PointOfContact:
    person = PointOfContact(name="Ada", email="ada@example.com")
    session.add(person)
    session.commit()
    return person


def test_new_requirement_defaults_to_draft_with_timestamps(
    session: Session, point_of_contact: PointOfContact
) -> None:
    requirement = Requirement(
        point_of_contact_id=point_of_contact.id,
        idea="Let people export their requirements as PDF",
        title="PDF export",
    )
    session.add(requirement)
    session.commit()
    session.refresh(requirement)

    assert requirement.status == RequirementStatus.DRAFT
    assert requirement.created_at is not None
    assert requirement.updated_at == requirement.created_at


def test_updating_a_requirement_bumps_updated_at(
    session: Session, point_of_contact: PointOfContact
) -> None:
    requirement = Requirement(
        point_of_contact_id=point_of_contact.id, idea="An idea", title="Idea"
    )
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    created_at = requirement.created_at

    requirement.status = RequirementStatus.IN_PROGRESS
    session.commit()
    session.refresh(requirement)

    assert requirement.created_at == created_at
    assert requirement.updated_at is not None and created_at is not None
    assert requirement.updated_at > created_at


def test_requirement_needs_an_existing_point_of_contact(session: Session) -> None:
    session.add(
        Requirement(point_of_contact_id=uuid.uuid4(), idea="An idea", title="Idea")
    )

    with pytest.raises(IntegrityError, match="foreign key"):
        session.commit()


def test_questions_exhausted_at_starts_empty_and_can_be_set(
    session: Session, point_of_contact: PointOfContact
) -> None:
    requirement = Requirement(
        point_of_contact_id=point_of_contact.id, idea="An idea", title="Idea"
    )
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    assert requirement.questions_exhausted_at is None

    exhausted_at = datetime.now(UTC)
    requirement.questions_exhausted_at = exhausted_at
    session.commit()
    session.expire_all()

    assert requirement.questions_exhausted_at == exhausted_at
