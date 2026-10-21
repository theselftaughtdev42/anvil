import uuid
from typing import Annotated

from fastapi import Depends
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import select

from anvil.db import SessionDep
from anvil.models import PointOfContact
from anvil.settings import settings


def get_current_user(session: SessionDep) -> PointOfContact:
    """A stand-in for real authentication.

    Every request acts as the Point of Contact configured by STUB_USER_EMAIL,
    created on first use. When auth arrives, this function is the only thing to
    replace.
    """
    email = settings.stub_user_email
    query = select(PointOfContact).where(PointOfContact.email == email)
    if user := session.exec(query).first():
        return user
    # First use. ON CONFLICT DO NOTHING so concurrent first requests can't race
    # into the unique email constraint; whichever loses reads the winner's row.
    session.exec(
        insert(PointOfContact)
        .values(id=uuid.uuid4(), name=settings.stub_user_name, email=email)
        .on_conflict_do_nothing(index_elements=["email"])
    )
    session.commit()
    return session.exec(query).one()


CurrentUserDep = Annotated[PointOfContact, Depends(get_current_user)]
