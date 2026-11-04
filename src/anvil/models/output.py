import uuid
from datetime import datetime
from enum import StrEnum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class OutputFormat(StrEnum):
    GHERKIN = "gherkin"


# A Postgres enum, for the reasons given on requirement_status.
format_type = sa.Enum(
    OutputFormat,
    name="output_format",
    values_callable=lambda formats: [output_format.value for output_format in formats],
)


class Output(SQLModel, table=True):
    """A Complete Requirement written up in one Output format, as rendered text. A
    Requirement has at most one per format; generating again replaces it.
    """

    __tablename__ = "output"
    __table_args__ = (
        # Leading with requirement_id also covers lookups on the foreign key.
        sa.UniqueConstraint(
            "requirement_id", "format", name="uq_output_requirement_id_format"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    requirement_id: uuid.UUID = Field(foreign_key="requirement.id")
    format: OutputFormat = Field(sa_type=format_type)
    content: str = Field(sa_type=sa.Text)
    generated_at: datetime = Field(sa_type=sa.DateTime(timezone=True))
