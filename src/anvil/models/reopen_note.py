import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class ReopenNote(SQLModel, table=True):
    """What a Point of Contact said was missing when they reopened a Complete
    Requirement. A Requirement keeps one per reopen, in order.
    """

    __tablename__ = "reopen_note"
    __table_args__ = (
        sa.CheckConstraint("btrim(note) <> ''", name="ck_reopen_note_note_not_blank"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    requirement_id: uuid.UUID = Field(foreign_key="requirement.id", index=True)
    note: str = Field(sa_type=sa.Text)
    created_at: datetime | None = Field(
        default=None,
        sa_type=sa.DateTime(timezone=True),
        sa_column_kwargs={"server_default": sa.func.now()},
        nullable=False,
    )
    """Set by the database, so None until the row is flushed."""
