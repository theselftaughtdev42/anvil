"""The Project table: what Requirements are gathered for."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

NAME_MAX_LENGTH = 120


class Project(SQLModel, table=True):
    """The undertaking that Requirements are gathered for, such as a product, a
    system or an opportunity.

    Each Project has one Project Owner, who writes its Project Context. Names are
    unique ignoring case, and stored trimmed.
    """

    __tablename__ = "project"
    __table_args__ = (
        sa.Index(
            "uq_project_name_lower", sa.func.lower(sa.column("name")), unique=True
        ),
        sa.CheckConstraint(
            "name <> '' AND name = btrim(name)", name="ck_project_name_trimmed"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # point_of_contact stands in for a users table until real Users (#63).
    owner_id: uuid.UUID = Field(foreign_key="point_of_contact.id", index=True)
    name: str = Field(max_length=NAME_MAX_LENGTH)
    context: str = Field(
        default="", sa_type=sa.Text, sa_column_kwargs={"server_default": ""}
    )
    created_at: datetime | None = Field(
        default=None,
        sa_type=sa.DateTime(timezone=True),
        sa_column_kwargs={"server_default": sa.func.now()},
        nullable=False,
    )
    updated_at: datetime | None = Field(
        default=None,
        sa_type=sa.DateTime(timezone=True),
        sa_column_kwargs={"server_default": sa.func.now(), "onupdate": sa.func.now()},
        nullable=False,
    )
