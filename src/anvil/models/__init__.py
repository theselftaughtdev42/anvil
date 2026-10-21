# Import every model module here so its tables register on SQLModel.metadata;
# Alembic autogenerate only sees tables that have been imported.
from anvil.models.point_of_contact import PointOfContact
from anvil.models.project import Project
from anvil.models.question import Question, QuestionStatus
from anvil.models.requirement import Requirement, RequirementStatus

__all__ = [
    "PointOfContact",
    "Project",
    "Question",
    "QuestionStatus",
    "Requirement",
    "RequirementStatus",
]
