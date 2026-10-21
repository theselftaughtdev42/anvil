import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, StringConstraints
from sqlalchemy import ColumnElement, and_, delete, func
from sqlmodel import Session, col, select
from sqlmodel.sql.expression import Select

from anvil.agent import AgentDep, ProjectContextDep
from anvil.auth import CurrentUserDep
from anvil.db import SessionDep
from anvil.models import (
    PointOfContact,
    Project,
    Question,
    QuestionStatus,
    Requirement,
    RequirementStatus,
)
from anvil.refinement import (
    answered_questions,
    bottom_position,
    deal_questions,
    open_questions,
    record_answer,
)

IDEA_MAX_LENGTH = 5000
ANSWER_MAX_LENGTH = 2000

router = APIRouter(prefix="/requirements", tags=["requirements"])


class RequirementCreate(BaseModel):
    project_id: uuid.UUID
    idea: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=IDEA_MAX_LENGTH
        ),
    ]


class RequirementUpdate(BaseModel):
    project_id: uuid.UUID


class ProjectSummary(BaseModel):
    id: uuid.UUID
    name: str


class Progress(BaseModel):
    answered: int
    # Open and answered Questions; Dismissed ones don't count.
    total: int


class RequirementPublic(BaseModel):
    id: uuid.UUID
    title: str
    idea: str
    project: ProjectSummary
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime
    # Null while the Requirement has no Questions. The UI shows "Not started".
    progress: Progress | None


class RequirementList(BaseModel):
    items: list[RequirementPublic]


class OpenQuestion(BaseModel):
    id: uuid.UUID
    topic: str
    text: str
    why: str | None
    suggestions: list[str]
    # The "#3" on the card: its order of creation within the Requirement.
    number: int


class AnsweredQuestion(BaseModel):
    id: uuid.UUID
    topic: str
    text: str
    answer: str
    number: int


class QuestionStack(BaseModel):
    # Top of the stack first.
    open: list[OpenQuestion]
    # In the order they were answered.
    answered: list[AnsweredQuestion]
    # True once Anvil has nothing more to ask.
    exhausted: bool


class AnswerCreate(BaseModel):
    answer: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=ANSWER_MAX_LENGTH
        ),
    ]


# Matches the Point of Contact's own Requirement. Another Point of Contact's
# Requirement is a 404 too, so ids don't leak.
def is_own_requirement(
    requirement_id: uuid.UUID, user: PointOfContact
) -> ColumnElement[bool]:
    return and_(
        col(Requirement.id) == requirement_id,
        col(Requirement.point_of_contact_id) == user.id,
    )


def requirement_or_404[T](row: T | None) -> T:
    if row is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return row


# for_update locks the Requirement until the request commits, so answers to the
# same Requirement can't interleave.
def get_own_requirement(
    session: Session,
    requirement_id: uuid.UUID,
    user: PointOfContact,
    *,
    for_update: bool = False,
) -> Requirement:
    query = select(Requirement).where(is_own_requirement(requirement_id, user))
    if for_update:
        query = query.with_for_update()
    return requirement_or_404(session.exec(query).first())


# An open Question of the Requirement: 404 if it isn't the Requirement's, 409 if
# it's no longer open.
def get_open_question(
    session: Session, requirement: Requirement, question_id: uuid.UUID
) -> Question:
    question = session.get(Question, question_id)
    if question is None or question.requirement_id != requirement.id:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.status != QuestionStatus.OPEN:
        raise HTTPException(status_code=409, detail="Question isn't open")
    return question


# 422 rather than 404: the Project is part of the body, not the path. Anyone can
# pick any Project.
def get_project_or_422(session: Session, project_id: uuid.UUID) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=422, detail="Project not found")
    return project


# Each Requirement with its Project and Question counts, in one query however
# many there are. Callers add the where and order_by; read rows with
# requirement_public.
def select_with_progress() -> Select:
    counts = (
        select(
            Question.requirement_id,
            func.count()
            .filter(col(Question.status) == QuestionStatus.ANSWERED)
            .label("answered"),
            func.count().label("total"),
        )
        .where(col(Question.status).in_([QuestionStatus.OPEN, QuestionStatus.ANSWERED]))
        .group_by(col(Question.requirement_id))
        .subquery()
    )
    return (
        select(Requirement, Project, counts.c.answered, counts.c.total)
        .join(Project, col(Project.id) == Requirement.project_id)
        .outerjoin(counts, counts.c.requirement_id == Requirement.id)
    )


def requirement_public(
    requirement: Requirement,
    project: Project,
    answered: int | None,
    total: int | None,
) -> RequirementPublic:
    return RequirementPublic.model_validate(
        {
            **requirement.model_dump(),
            "project": ProjectSummary(id=project.id, name=project.name),
            "progress": Progress(answered=answered, total=total)
            if answered is not None and total is not None
            else None,
        }
    )


# The Point of Contact's own Requirement with its progress.
def get_own_requirement_public(
    session: Session, requirement_id: uuid.UUID, user: PointOfContact
) -> RequirementPublic:
    query = select_with_progress().where(is_own_requirement(requirement_id, user))
    return requirement_public(*requirement_or_404(session.exec(query).first()))


def question_stack(session: Session, requirement: Requirement) -> QuestionStack:
    return QuestionStack(
        open=[
            OpenQuestion.model_validate(question, from_attributes=True)
            for question in open_questions(session, requirement)
        ],
        answered=[
            AnsweredQuestion.model_validate(question, from_attributes=True)
            for question in answered_questions(session, requirement)
        ],
        exhausted=requirement.questions_exhausted_at is not None,
    )


@router.post("", status_code=201)
def create_requirement(
    body: RequirementCreate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
    context: ProjectContextDep,
) -> RequirementPublic:
    project = get_project_or_422(session, body.project_id)
    requirement = Requirement(
        point_of_contact_id=user.id,
        project_id=project.id,
        idea=body.idea,
        title=agent.name_requirement(body.idea, context),
        status=RequirementStatus.DRAFT,
    )
    session.add(requirement)
    # So the Requirement opens with its first batch of Questions.
    deal_questions(session, requirement, agent, context)
    session.commit()
    return get_own_requirement_public(session, requirement.id, user)


# The Point of Contact's Requirements, most recently updated first: all of them,
# or only those in project_id.
@router.get("")
def list_requirements(
    session: SessionDep,
    user: CurrentUserDep,
    project_id: Annotated[uuid.UUID | None, Query()] = None,
) -> RequirementList:
    query = select_with_progress().where(
        col(Requirement.point_of_contact_id) == user.id
    )
    if project_id is not None:
        query = query.where(col(Requirement.project_id) == project_id)
    query = query.order_by(col(Requirement.updated_at).desc())
    return RequirementList(
        items=[requirement_public(*row) for row in session.exec(query)]
    )


@router.get("/{requirement_id}")
def get_requirement(
    requirement_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> RequirementPublic:
    return get_own_requirement_public(session, requirement_id, user)


# Moves a Draft Requirement to another Project. Its Open Questions were asked
# with the old Project Context, so they're removed and a new batch is dealt.
# Locked once a Question is answered.
@router.patch("/{requirement_id}")
def update_requirement(
    requirement_id: uuid.UUID,
    body: RequirementUpdate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
    context: ProjectContextDep,
) -> RequirementPublic:
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    if requirement.status != RequirementStatus.DRAFT:
        raise HTTPException(
            status_code=409,
            detail="The Project is locked once a Question is answered",
        )
    project = get_project_or_422(session, body.project_id)
    if project.id != requirement.project_id:
        requirement.project_id = project.id
        # A Draft has no answered Questions, so this leaves only Dismissed
        # ones, if any.
        session.exec(
            delete(Question).where(
                col(Question.requirement_id) == requirement.id,
                col(Question.status) == QuestionStatus.OPEN,
            )
        )
        requirement.questions_exhausted_at = None
        session.flush()
        deal_questions(session, requirement, agent, context)
    session.commit()
    return get_own_requirement_public(session, requirement.id, user)


# Only reads: never asks the agent.
@router.get("/{requirement_id}/questions")
def get_questions(
    requirement_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> QuestionStack:
    requirement = get_own_requirement(session, requirement_id, user)
    return question_stack(session, requirement)


# Answering the last open Question deals the next batch.
@router.post("/{requirement_id}/questions/{question_id}/answer")
def answer_question(
    requirement_id: uuid.UUID,
    question_id: uuid.UUID,
    body: AnswerCreate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
    context: ProjectContextDep,
) -> QuestionStack:
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    question = get_open_question(session, requirement, question_id)
    record_answer(session, requirement, question, body.answer)
    session.flush()
    if not open_questions(session, requirement):
        deal_questions(session, requirement, agent, context)
    session.commit()
    return question_stack(session, requirement)


# Moves the Question to the bottom of the stack. A no-op if it's the only open
# one.
@router.post("/{requirement_id}/questions/{question_id}/later")
def put_off_question(
    requirement_id: uuid.UUID,
    question_id: uuid.UUID,
    session: SessionDep,
    user: CurrentUserDep,
) -> QuestionStack:
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    question = get_open_question(session, requirement, question_id)
    if open_questions(session, requirement)[-1].id != question.id:
        question.position = bottom_position(session, requirement)
    session.commit()
    return question_stack(session, requirement)
