from collections.abc import Sequence
from typing import Annotated, Protocol

from pydantic import BaseModel, Field


class Subject(BaseModel, frozen=True):
    """What's being refined."""

    title: str
    idea: str
    """The original wording, as its author wrote it."""


class AskedQuestion(BaseModel, frozen=True):
    """A Question the agent has already asked about this Subject."""

    topic: str
    text: str
    answer: str | None = None
    """`None` while the Question is unanswered."""


class QuestionDraft(BaseModel, frozen=True, str_strip_whitespace=True):
    """A new Question from the agent.

    Whitespace is stripped, so a blank value can't get through.
    """

    topic: str = Field(min_length=1)
    """A short label of 2 to 4 words, for example "Edge cases"."""
    text: str = Field(min_length=1)
    why: str | None = None
    """Why the agent is asking, in one sentence."""
    suggestions: tuple[Annotated[str, Field(min_length=1)], ...] = ()
    """At most three short suggested answers. Consumers may show only the first
    three."""


class RefinementAgent(Protocol):
    """Refines an idea through Questions.

    `context` is background about where the idea comes from, or None when there
    isn't any.

    The lengths asked for here and on QuestionDraft aren't validated, so a
    model-backed agent should state them in its prompt or output-schema field
    descriptions.
    """

    def name_idea(self, idea: str, context: str | None) -> str:
        """A short title for a new idea: a few words that read as a headline."""
        ...

    def ask_questions(
        self,
        subject: Subject,
        asked: Sequence[AskedQuestion],
        context: str | None,
        feedback: Sequence[str],
    ) -> list[QuestionDraft]:
        """The next batch of Questions. An empty list means nothing more to ask, which
        is the agent's whole verdict that the Subject is clear enough to act on.

        `asked` is every Question asked so far, answered or not, in the order they
        were asked, so the agent never asks one twice. `feedback` is what the
        Subject's author said was still missing each time they disagreed with that
        verdict, oldest first.
        """
        ...
