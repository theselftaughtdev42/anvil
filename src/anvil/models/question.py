import uuid
from datetime import datetime
from enum import StrEnum

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableList
from sqlmodel import Field, SQLModel


class QuestionStatus(StrEnum):
    OPEN = "open"
    ANSWERED = "answered"
    # Nothing sets this yet; it's here so the enum needn't change when
    # dismissing arrives.
    DISMISSED = "dismissed"


# A Postgres enum, for the reasons given on requirement_status.
status_type = sa.Enum(
    QuestionStatus,
    name="question_status",
    values_callable=lambda statuses: [status.value for status in statuses],
)


# One thing Anvil asks about a Requirement during Refinement. Its Answer lives
# on the row, since a Question has at most one.
class Question(SQLModel, table=True):
    __tablename__ = "question"
    __table_args__ = (
        # Reads a Requirement's stack in order. Leading with requirement_id also
        # covers lookups on the foreign key.
        sa.Index(
            "ix_question_requirement_id_status_position",
            "requirement_id",
            "status",
            "position",
        ),
        # A Question's number is its "#3" on the card, so it's never reused.
        sa.UniqueConstraint(
            "requirement_id", "number", name="uq_question_requirement_id_number"
        ),
        # An Answer always carries the time it was given, and vice versa.
        sa.CheckConstraint(
            "(answer IS NULL) = (answered_at IS NULL)",
            name="ck_question_answer_with_answered_at",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(suggestions) = 'array'",
            name="ck_question_suggestions_is_array",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    requirement_id: uuid.UUID = Field(foreign_key="requirement.id")
    # A short label shown on the card, for example "Edge cases".
    topic: str = Field(max_length=40)
    text: str = Field(sa_type=sa.Text)
    # Why Anvil is asking, in one sentence.
    why: str | None = Field(default=None, sa_type=sa.Text)
    # Suggested Answers. The agent's output schema should cap these at three;
    # the database doesn't, so offering more later needs no migration.
    # MutableList makes in-place changes (append, extend) get saved.
    suggestions: list[str] = Field(
        default_factory=list,
        sa_type=MutableList.as_mutable(JSONB),
        sa_column_kwargs={"server_default": sa.text("'[]'::jsonb")},
    )
    # Order in the stack; lower is nearer the top. Changes if user marks it for later.
    position: int
    # Order of creation within the Requirement, from 1. Never changes.
    number: int
    status: QuestionStatus = Field(
        default=QuestionStatus.OPEN,
        sa_type=status_type,
        sa_column_kwargs={"server_default": QuestionStatus.OPEN.value},
    )
    answer: str | None = Field(default=None, sa_type=sa.Text)
    answered_at: datetime | None = Field(
        default=None, sa_type=sa.DateTime(timezone=True)
    )
    # Set by the database, so None until the row is flushed.
    created_at: datetime | None = Field(
        default=None,
        sa_type=sa.DateTime(timezone=True),
        sa_column_kwargs={"server_default": sa.func.now()},
        nullable=False,
    )
