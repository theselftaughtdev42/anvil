from datetime import datetime

from sqlmodel import Session, col, func, select

from anvil.agent import AskedQuestion, RefinementAgent, RequirementBrief
from anvil.models import (
    Project,
    Question,
    QuestionStatus,
    Requirement,
    RequirementStatus,
)


# What the agent gets as Project Context: the Project's, or None when it's blank.
def project_context(project: Project) -> str | None:
    return project.context if project.context.strip() else None


# Asks the agent for the next batch of Questions and puts them at the bottom of
# the stack, with its Project's Project Context as it is now. An empty batch
# marks the Requirement exhausted, and an exhausted one isn't asked again. The
# caller commits.
def deal_questions(
    session: Session, requirement: Requirement, agent: RefinementAgent
) -> None:
    # Locks the Requirement until the caller commits, so two requests can't deal
    # twice. populate_existing reloads it, in case another request has just
    # dealt or exhausted it.
    session.exec(
        select(Requirement)
        .where(Requirement.id == requirement.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    if requirement.questions_exhausted_at is not None:
        return

    project = session.get_one(Project, requirement.project_id, populate_existing=True)
    asked = session.exec(
        select(Question)
        .where(Question.requirement_id == requirement.id)
        .order_by(col(Question.number))
    ).all()
    drafts = agent.ask_questions(
        RequirementBrief(title=requirement.title, idea=requirement.idea),
        [AskedQuestion(topic=q.topic, text=q.text, answer=q.answer) for q in asked],
        project_context(project),
    )
    if not drafts:
        requirement.questions_exhausted_at = database_now(session)
        return

    position = bottom_position(session, requirement)
    number = len(asked) + 1
    for offset, draft in enumerate(drafts):
        session.add(
            Question(
                requirement_id=requirement.id,
                topic=draft.topic,
                text=draft.text,
                why=draft.why,
                suggestions=list(draft.suggestions),
                position=position + offset,
                number=number + offset,
            )
        )


# The time the transaction started, from Postgres. Every timestamp a request
# sets comes from here, so they agree with the server defaults (created_at) and
# with updated_at's onupdate, which use the same clock and the same instant.
def database_now(session: Session) -> datetime:
    return session.exec(select(func.now())).one()


# The position below every Question in the Requirement's stack.
def bottom_position(session: Session, requirement: Requirement) -> int:
    query = select(func.max(Question.position)).where(
        Question.requirement_id == requirement.id
    )
    highest = session.exec(query).one()
    return 0 if highest is None else highest + 1


def open_questions(session: Session, requirement: Requirement) -> list[Question]:
    query = (
        select(Question)
        .where(
            Question.requirement_id == requirement.id,
            Question.status == QuestionStatus.OPEN,
        )
        .order_by(col(Question.position))
    )
    return list(session.exec(query))


def answered_questions(session: Session, requirement: Requirement) -> list[Question]:
    query = (
        select(Question)
        .where(
            Question.requirement_id == requirement.id,
            Question.status == QuestionStatus.ANSWERED,
        )
        .order_by(col(Question.answered_at))
    )
    return list(session.exec(query))


# Records the Answer. The first Answer moves a Draft Requirement to In progress.
def record_answer(
    session: Session, requirement: Requirement, question: Question, answer: str
) -> None:
    now = database_now(session)
    question.status = QuestionStatus.ANSWERED
    question.answer = answer
    question.answered_at = now
    if requirement.status == RequirementStatus.DRAFT:
        requirement.status = RequirementStatus.IN_PROGRESS
    # Set explicitly: updated_at's onupdate only fires when another column
    # changes, and the status usually doesn't.
    requirement.updated_at = now
