import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select
from sqlmodel.sql.expression import Select

from anvil.auth import CurrentUserDep
from anvil.db import SessionDep
from anvil.models import PointOfContact, Project, Requirement
from anvil.models.project import NAME_MAX_LENGTH
from anvil.requirements import (
    RequirementList,
    delete_requirements,
    requirement_public,
    select_with_progress,
)

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


class ProjectPublic(BaseModel, use_attribute_docstrings=True):
    id: uuid.UUID
    name: str
    context: str
    has_context: bool
    """False while the Project Context is blank."""
    requirement_count: int
    is_owner: bool
    """Whether the current user is the Project Owner, so may edit it."""


class ProjectList(BaseModel, use_attribute_docstrings=True):
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


def get_own_project(
    session: Session,
    project_id: uuid.UUID,
    user: PointOfContact,
    action: str,
    *,
    for_update: bool = True,
) -> Project:
    """The Project; 404 if missing, 403 unless `user` is its Project Owner.
    `for_update` locks it until the request commits.
    """
    query = select(Project).where(Project.id == project_id)
    if for_update:
        query = query.with_for_update()
    project = session.exec(query).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(
            status_code=403, detail=f"Only the Project Owner can {action}"
        )
    return project


@router.patch("/{project_id}")
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    session: SessionDep,
    user: CurrentUserDep,
) -> ProjectPublic:
    """Only the Project Owner can rename a Project or change its Project Context."""
    project = get_own_project(session, project_id, user, "change this Project")
    if body.name is not None:
        project.name = body.name
    if body.context is not None:
        project.context = body.context
    commit_or_409(session, project.name)
    return get_project_public(session, project_id, user)


@router.get("/{project_id}/requirements")
def list_project_requirements(
    project_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> RequirementList:
    """Every Requirement in the Project, whoever its Point of Contact, most recently
    updated first. Only the Project Owner can see them all.
    """
    project = get_own_project(
        session,
        project_id,
        user,
        "see every Requirement in this Project",
        for_update=False,
    )
    query = (
        select_with_progress()
        .where(col(Requirement.project_id) == project.id)
        .order_by(col(Requirement.updated_at).desc())
    )
    return RequirementList(
        items=[requirement_public(*row) for row in session.exec(query)]
    )


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: uuid.UUID,
    session: SessionDep,
    user: CurrentUserDep,
    with_requirements: Annotated[bool, Query()] = False,
    requirement_count: Annotated[int | None, Query(ge=0)] = None,
) -> None:
    """Deletes the Project for good; only its Project Owner can. A Project with
    Requirements is a 409 unless `with_requirements` is set, which deletes them too,
    whoever their Point of Contact is. `requirement_count` is how many the caller
    expects to delete; any other number is a 409, so nothing unseen goes.
    """
    project = get_own_project(session, project_id, user, "delete this Project")
    requirement_ids = list(
        session.exec(select(Requirement.id).where(Requirement.project_id == project.id))
    )
    count = len(requirement_ids)
    has = f"This Project has {count} {'Requirement' if count == 1 else 'Requirements'}"
    if requirement_ids and not with_requirements:
        raise HTTPException(
            status_code=409,
            detail=f"{has}; pass with_requirements=true to delete them too",
        )
    if requirement_count is not None and requirement_count != count:
        raise HTTPException(status_code=409, detail=f"{has}, not {requirement_count}")
    delete_requirements(session, requirement_ids)
    session.delete(project)
    session.commit()
