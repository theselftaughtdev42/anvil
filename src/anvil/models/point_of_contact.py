import uuid

from pydantic import EmailStr
from sqlmodel import Field, SQLModel


# The person whose requirements we're helping to flesh out.
class PointOfContact(SQLModel, table=True):
    __tablename__ = "point_of_contact"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    email: EmailStr = Field(max_length=320, unique=True)
