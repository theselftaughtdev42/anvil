# Import every model module here so its tables register on SQLModel.metadata;
# Alembic autogenerate only sees tables that have been imported.
from anvil.models.point_of_contact import PointOfContact
from anvil.models.requirement import Requirement, RequirementStatus

__all__ = ["PointOfContact", "Requirement", "RequirementStatus"]
