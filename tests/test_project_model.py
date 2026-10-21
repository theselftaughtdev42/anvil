import pytest
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from anvil.models import PointOfContact, Project


@pytest.fixture
def session(migrated_db: Engine):
    with Session(migrated_db) as session:
        yield session


@pytest.fixture
def owner(session: Session) -> PointOfContact:
    person = PointOfContact(name="Ada", email="ada@example.com")
    session.add(person)
    session.commit()
    return person


def test_new_project_has_empty_context_and_timestamps(
    session: Session, owner: PointOfContact
) -> None:
    project = Project(owner_id=owner.id, name="Parcels")
    session.add(project)
    session.commit()
    session.refresh(project)

    assert project.context == ""
    assert project.created_at is not None
    assert project.updated_at == project.created_at


def test_two_projects_cannot_share_a_name_ignoring_case(
    session: Session, owner: PointOfContact
) -> None:
    session.add(Project(owner_id=owner.id, name="Parcels"))
    session.commit()

    session.add(Project(owner_id=owner.id, name="PARCELS"))
    with pytest.raises(IntegrityError, match="uq_project_name_lower"):
        session.commit()


@pytest.mark.parametrize("name", ["", " Parcels", "Parcels "])
def test_project_name_must_be_non_empty_and_trimmed(
    session: Session, owner: PointOfContact, name: str
) -> None:
    session.add(Project(owner_id=owner.id, name=name))

    with pytest.raises(IntegrityError, match="ck_project_name_trimmed"):
        session.commit()
