import uuid
from datetime import datetime
from enum import StrEnum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class RequirementStatus(StrEnum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


# Stored as a Postgres enum rather than a check-constrained string: the database
# rejects unknown statuses, and adding one later is a one-line
# `ALTER TYPE requirement_status ADD VALUE` migration. Renaming or removing a
# value is harder (it means recreating the type), which we accept.
# values_callable stores the lowercase values, not the member names.
status_type = sa.Enum(
    RequirementStatus,
    name="requirement_status",
    values_callable=lambda statuses: [status.value for status in statuses],
)


class Requirement(SQLModel, table=True):
    __tablename__ = "requirement"
    __table_args__ = (
        # Lists a person's requirements, newest activity first. Leading with
        # point_of_contact_id also covers lookups on the foreign key.
        sa.Index(
            "ix_requirement_point_of_contact_id_updated_at",
            "point_of_contact_id",
            sa.text("updated_at DESC"),
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    point_of_contact_id: uuid.UUID = Field(foreign_key="point_of_contact.id")
    # What the person typed, in their own words.
    idea: str = Field(sa_type=sa.Text)
    # A short name, set by the refinement agent when the requirement is created.
    title: str = Field(max_length=255)
    status: RequirementStatus = Field(
        default=RequirementStatus.DRAFT,
        sa_type=status_type,
        sa_column_kwargs={"server_default": RequirementStatus.DRAFT.value},
    )
    # Set when the agent returns an empty batch of Questions, so it isn't asked
    # again. None means Anvil may still have Questions.
    questions_exhausted_at: datetime | None = Field(
        default=None, sa_type=sa.DateTime(timezone=True)
    )
    # Set by the database, so None until the row is flushed.
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
