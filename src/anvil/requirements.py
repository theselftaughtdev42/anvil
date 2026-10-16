import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlmodel import col, select

from anvil.agent import AgentDep, ProjectContextDep
from anvil.auth import CurrentUserDep
from anvil.db import SessionDep
from anvil.models import Requirement, RequirementStatus

IDEA_MAX_LENGTH = 5000

router = APIRouter(prefix="/requirements", tags=["requirements"])


class RequirementCreate(BaseModel):
    idea: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=IDEA_MAX_LENGTH
        ),
    ]


class RequirementPublic(BaseModel):
    id: uuid.UUID
    title: str
    idea: str
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime
    # Always null until Requirements have Questions; then it becomes
    # {"answered": n, "total": n}. The UI shows "Not started" while it's null.
    progress: None = None


class RequirementList(BaseModel):
    items: list[RequirementPublic]


@router.post("", status_code=201)
def create_requirement(
    body: RequirementCreate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
    context: ProjectContextDep,
) -> RequirementPublic:
    requirement = Requirement(
        point_of_contact_id=user.id,
        idea=body.idea,
        title=agent.name_requirement(body.idea, context),
        status=RequirementStatus.DRAFT,
    )
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    return RequirementPublic.model_validate(requirement, from_attributes=True)


# All of the Point of Contact's Requirements, most recently updated first.
@router.get("")
def list_requirements(session: SessionDep, user: CurrentUserDep) -> RequirementList:
    query = (
        select(Requirement)
        .where(Requirement.point_of_contact_id == user.id)
        .order_by(col(Requirement.updated_at).desc())
    )
    items = [
        RequirementPublic.model_validate(requirement, from_attributes=True)
        for requirement in session.exec(query)
    ]
    return RequirementList(items=items)


# Another Point of Contact's Requirement is a 404 too, so ids don't leak.
@router.get("/{requirement_id}")
def get_requirement(
    requirement_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> RequirementPublic:
    requirement = session.get(Requirement, requirement_id)
    if requirement is None or requirement.point_of_contact_id != user.id:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return RequirementPublic.model_validate(requirement, from_attributes=True)
