import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, StringConstraints
from sqlalchemy import ColumnElement, and_, delete, func
from sqlmodel import Session, col, select
from sqlmodel.sql.expression import Select

from anvil.agent import AgentDep
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
    nothing_new_since_reopen,
    open_questions,
    project_context,
    record_answer,
    reopen,
)

IDEA_MAX_LENGTH = 5000
ANSWER_MAX_LENGTH = 2000
REOPEN_NOTE_MAX_LENGTH = 2000

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


class ProjectSummary(BaseModel, use_attribute_docstrings=True):
    id: uuid.UUID
    name: str


class Progress(BaseModel, use_attribute_docstrings=True):
    answered: int
    total: int
    """Open and answered Questions; Dismissed ones don't count."""


class RequirementPublic(BaseModel, use_attribute_docstrings=True):
    id: uuid.UUID
    title: str
    idea: str
    project: ProjectSummary
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime
    progress: Progress | None
    """Null while the Requirement has no Questions. The UI shows "Not started"."""


class RequirementList(BaseModel, use_attribute_docstrings=True):
    items: list[RequirementPublic]


class OpenQuestion(BaseModel, use_attribute_docstrings=True):
    id: uuid.UUID
    topic: str
    text: str
    why: str | None
    suggestions: list[str]
    number: int
    """The "#3" on the card: its order of creation within the Requirement."""


class AnsweredQuestion(BaseModel, use_attribute_docstrings=True):
    id: uuid.UUID
    topic: str
    text: str
    answer: str
    number: int


class QuestionStack(BaseModel, use_attribute_docstrings=True):
    open: list[OpenQuestion]
    """Top of the stack first."""
    answered: list[AnsweredQuestion]
    """In the order they were answered."""
    exhausted: bool
    """True once Anvil has nothing more to ask, so suggests the Requirement looks
    clear enough to act on."""
    nothing_new_since_reopen: bool
    """True when the Requirement was reopened and Anvil had no new Questions."""


class ReopenCreate(BaseModel, use_attribute_docstrings=True):
    note: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=REOPEN_NOTE_MAX_LENGTH
        ),
    ]
    """The Point of Contact's Reopen note: what the Complete Requirement is missing."""


class AnswerCreate(BaseModel):
    answer: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=ANSWER_MAX_LENGTH
        ),
    ]


def is_own_requirement(
    requirement_id: uuid.UUID, user: PointOfContact
) -> ColumnElement[bool]:
    """Matches the Point of Contact's own Requirement. Another Point of Contact's
    Requirement is a 404 too, so ids don't leak.
    """
    return and_(
        col(Requirement.id) == requirement_id,
        col(Requirement.point_of_contact_id) == user.id,
    )


def requirement_or_404[T](row: T | None) -> T:
    if row is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return row


def get_own_requirement(
    session: Session,
    requirement_id: uuid.UUID,
    user: PointOfContact,
    *,
    for_update: bool = False,
) -> Requirement:
    """The Point of Contact's own Requirement, or a 404.

    `for_update` locks it until the request commits, so answers to the same
    Requirement can't interleave.
    """
    query = select(Requirement).where(is_own_requirement(requirement_id, user))
    if for_update:
        query = query.with_for_update()
    return requirement_or_404(session.exec(query).first())


def get_open_question(
    session: Session, requirement: Requirement, question_id: uuid.UUID
) -> Question:
    """An open Question of the Requirement: 404 if it isn't the Requirement's, 409 if
    it's no longer open.
    """
    question = session.get(Question, question_id)
    if question is None or question.requirement_id != requirement.id:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.status != QuestionStatus.OPEN:
        raise HTTPException(status_code=409, detail="Question isn't open")
    return question


def get_project_or_422(session: Session, project_id: uuid.UUID) -> Project:
    """422 rather than 404: the Project is part of the body, not the path. Anyone can
    pick any Project.
    """
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=422, detail="Project not found")
    return project


def select_with_progress() -> Select:
    """Each Requirement with its Project and Question counts, in one query however many
    there are. Callers add the where and order_by; read rows with requirement_public.
    """
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
        nothing_new_since_reopen=nothing_new_since_reopen(session, requirement),
    )


@router.post("", status_code=201)
def create_requirement(
    body: RequirementCreate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
) -> RequirementPublic:
    project = get_project_or_422(session, body.project_id)
    requirement = Requirement(
        point_of_contact_id=user.id,
        project_id=project.id,
        idea=body.idea,
        title=agent.name_idea(body.idea, project_context(project)),
        status=RequirementStatus.DRAFT,
    )
    session.add(requirement)
    # So the Requirement opens with its first batch of Questions.
    deal_questions(session, requirement, agent)
    session.commit()
    return get_own_requirement_public(session, requirement.id, user)


@router.get("")
def list_requirements(
    session: SessionDep,
    user: CurrentUserDep,
    project_id: Annotated[uuid.UUID | None, Query()] = None,
) -> RequirementList:
    """The Point of Contact's Requirements, most recently updated first: all of them, or
    only those in project_id.
    """
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


@router.patch("/{requirement_id}")
def update_requirement(
    requirement_id: uuid.UUID,
    body: RequirementUpdate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
) -> RequirementPublic:
    """Moves a Draft Requirement to another Project. Its Open Questions were asked with
    the old Project Context, so they're removed and a new batch is dealt. Locked once a
    Question is answered.
    """
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
        deal_questions(session, requirement, agent)
    session.commit()
    return get_own_requirement_public(session, requirement.id, user)


@router.get("/{requirement_id}/questions")
def get_questions(
    requirement_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> QuestionStack:
    """Only reads: never asks the agent."""
    requirement = get_own_requirement(session, requirement_id, user)
    return question_stack(session, requirement)


@router.post("/{requirement_id}/questions/{question_id}/answer")
def answer_question(
    requirement_id: uuid.UUID,
    question_id: uuid.UUID,
    body: AnswerCreate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
) -> QuestionStack:
    """Answering the last open Question deals the next batch."""
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    question = get_open_question(session, requirement, question_id)
    record_answer(session, requirement, question, body.answer)
    session.flush()
    if not open_questions(session, requirement):
        deal_questions(session, requirement, agent)
    session.commit()
    return question_stack(session, requirement)


@router.post("/{requirement_id}/questions/{question_id}/later")
def put_off_question(
    requirement_id: uuid.UUID,
    question_id: uuid.UUID,
    session: SessionDep,
    user: CurrentUserDep,
) -> QuestionStack:
    """Moves the Question to the bottom of the stack.

    A no-op if it's the only open one.
    """
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    question = get_open_question(session, requirement, question_id)
    if open_questions(session, requirement)[-1].id != question.id:
        question.position = bottom_position(session, requirement)
    session.commit()
    return question_stack(session, requirement)


@router.post("/{requirement_id}/confirm")
def confirm_requirement(
    requirement_id: uuid.UUID, session: SessionDep, user: CurrentUserDep
) -> RequirementPublic:
    """Moves the Requirement to Complete. 409 unless Anvil has nothing more to ask, or
    if it's Complete already.
    """
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    if requirement.status == RequirementStatus.COMPLETE:
        raise HTTPException(status_code=409, detail="Requirement is already Complete")
    if requirement.questions_exhausted_at is None:
        raise HTTPException(status_code=409, detail="Anvil still has Questions to ask")
    requirement.status = RequirementStatus.COMPLETE
    session.commit()
    return get_own_requirement_public(session, requirement.id, user)


@router.post("/{requirement_id}/reopen")
def reopen_requirement(
    requirement_id: uuid.UUID,
    body: ReopenCreate,
    session: SessionDep,
    user: CurrentUserDep,
    agent: AgentDep,
) -> QuestionStack:
    """Moves a Complete Requirement back to In progress, and asks for new Questions
    with the note. 409 unless it's Complete.
    """
    requirement = get_own_requirement(session, requirement_id, user, for_update=True)
    if requirement.status != RequirementStatus.COMPLETE:
        raise HTTPException(
            status_code=409, detail="Only a Complete Requirement can be reopened"
        )
    reopen(session, requirement, body.note, agent)
    session.commit()
    return question_stack(session, requirement)
