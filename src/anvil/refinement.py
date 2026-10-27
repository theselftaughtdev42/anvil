"""Refinement: dealing a Requirement's Questions, recording their Answers, and
confirming or reopening the Requirement.
"""

from datetime import datetime

from idea_refiner import AskedQuestion, RefinementAgent, Subject
from sqlmodel import Session, col, func, select

from anvil.models import (
    Project,
    Question,
    QuestionStatus,
    ReopenNote,
    Requirement,
    RequirementStatus,
)


def project_context(project: Project) -> str | None:
    """The Project Context for the agent: the Project's, or None when it's blank."""
    return project.context if project.context.strip() else None


def deal_questions(
    session: Session, requirement: Requirement, agent: RefinementAgent
) -> None:
    """Asks the agent for the next batch of Questions and puts them at the bottom of the
    stack, with its Project's Project Context as it is now and its Reopen notes. An
    empty batch marks the Requirement exhausted, and an exhausted one isn't asked
    again. The caller commits.
    """
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
        Subject(title=requirement.title, idea=requirement.idea),
        [AskedQuestion(topic=q.topic, text=q.text, answer=q.answer) for q in asked],
        project_context(project),
        [note.note for note in reopen_notes(session, requirement)],
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


def database_now(session: Session) -> datetime:
    """The time the transaction started, from Postgres. Every timestamp a request sets
    comes from here, so they agree with the server defaults (created_at) and with
    updated_at's onupdate, which use the same clock and the same instant.
    """
    return session.exec(select(func.now())).one()


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


def record_answer(
    session: Session, requirement: Requirement, question: Question, answer: str
) -> None:
    """Records the Answer. The first Answer moves a Draft Requirement to In progress."""
    now = database_now(session)
    question.status = QuestionStatus.ANSWERED
    question.answer = answer
    question.answered_at = now
    if requirement.status == RequirementStatus.DRAFT:
        requirement.status = RequirementStatus.IN_PROGRESS
    # Set explicitly: updated_at's onupdate only fires when another column
    # changes, and the status usually doesn't.
    requirement.updated_at = now


def reopen_notes(session: Session, requirement: Requirement) -> list[ReopenNote]:
    query = (
        select(ReopenNote)
        .where(ReopenNote.requirement_id == requirement.id)
        .order_by(col(ReopenNote.created_at))
    )
    return list(session.exec(query))


def nothing_new_since_reopen(session: Session, requirement: Requirement) -> bool:
    """Whether the Requirement was reopened and Anvil asked no Questions after.

    A Question dealt in the same transaction as the note has the same created_at.
    """
    latest_note = session.exec(
        select(func.max(ReopenNote.created_at)).where(
            ReopenNote.requirement_id == requirement.id
        )
    ).one()
    if latest_note is None:
        return False
    latest_question = session.exec(
        select(func.max(Question.created_at)).where(
            Question.requirement_id == requirement.id
        )
    ).one()
    return latest_question is None or latest_question < latest_note


def reopen(
    session: Session, requirement: Requirement, note: str, agent: RefinementAgent
) -> None:
    """Moves a Complete Requirement back to In progress with the note, and asks the
    agent again right away. The caller commits.
    """
    requirement.status = RequirementStatus.IN_PROGRESS
    requirement.questions_exhausted_at = None
    session.add(ReopenNote(requirement_id=requirement.id, note=note))
    session.flush()
    deal_questions(session, requirement, agent)
