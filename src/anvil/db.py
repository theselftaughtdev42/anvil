from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, create_engine

from anvil.settings import settings

engine = create_engine(str(settings.database_url))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
