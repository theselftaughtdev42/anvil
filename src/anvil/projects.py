import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select
from sqlmodel.sql.expression import Select

from anvil.auth import CurrentUserDep
from anvil.db import SessionDep
from anvil.models import PointOfContact, Project, Requirement
from anvil.models.project import NAME_MAX_LENGTH

CONTEXT_MAX_LENGTH = 20_000

router = APIRouter(prefix="/projects", tags=["projects"])

ProjectName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH),
]


class ProjectCreate(BaseModel):
    name: ProjectName


class ProjectUpdate(BaseModel):
    name: ProjectName | None = None
    context: Annotated[str, StringConstraints(max_length=CONTEXT_MAX_LENGTH)] | None = (
        None
    )


class ProjectPublic(BaseModel):
    id: uuid.UUID
    name: str
    context: str
    # False while the Project Context is blank.
    has_context: bool
    requirement_count: int
    # Whether the current user is the Project Owner, so may edit it.
    is_owner: bool


class ProjectList(BaseModel):
    items: list[ProjectPublic]


def select_with_counts() -> Select:
    """Each Project with its Requirement count, in one query however many there are."""
    counts = (
        select(Requirement.project_id, func.count().label("requirement_count"))
        .group_by(col(Requirement.project_id))
        .subquery()
    )
    return select(Project, counts.c.requirement_count).outerjoin(
        counts, counts.c.project_id == Project.id
    )


def project_public(
    project: Project, requirement_count: int | None, user: PointOfContact
) -> ProjectPublic:
    return ProjectPublic(
        id=project.id,
        name=project.name,
        context=project.context,
        has_context=bool(project.context.strip()),
        requirement_count=requirement_count or 0,
        is_owner=project.owner_id == user.id,
    )


def get_project_public(
    session: Session, project_id: uuid.UUID, user: PointOfContact
) -> ProjectPublic:
    row = session.exec(select_with_counts().where(Project.id == project_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project, requirement_count = row
    return project_public(project, requirement_count, user)


def commit_or_409(session: Session, name: str) -> None:
    """Commits, turning a clash on the case-insensitive unique name into a 409."""
    try:
        session.commit()
    except IntegrityError as e:
        session.rollback()
        if "uq_project_name_lower" in str(e.orig):
            raise HTTPException(
                status_code=409, detail=f'A Project called "{name}" already exists'
            ) from e
        raise


@router.get("")
def list_projects(session: SessionDep, user: CurrentUserDep) -> ProjectList:
    """Every Project, by name. Anyone can see every Project."""
    query = select_with_counts().order_by(func.lower(Project.name))
    return ProjectList(
        items=[
            project_public(project, count, user)
            for project, count in session.exec(query)
        ]
    )


@router.post("", status_code=201)
def create_project(
    body: ProjectCreate, session: SessionDep, user: CurrentUserDep
) -> ProjectPublic:
    project = Project(owner_id=user.id, name=body.name)
    session.add(project)
    commit_or_409(session, body.name)
    return get_project_public(session, project.id, user)


@router.get("/{project_id}")
def get_project(
    project_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> ProjectPublic:
    return get_project_public(session, project_id, user)


@router.patch("/{project_id}")
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    session: SessionDep,
    user: CurrentUserDep,
) -> ProjectPublic:
    """Only the Project Owner can rename a Project or change its Project Context."""
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(
            status_code=403, detail="Only the Project Owner can change this Project"
        )
    if body.name is not None:
        project.name = body.name
    if body.context is not None:
        project.context = body.context
    commit_or_409(session, project.name)
    return get_project_public(session, project_id, user)
