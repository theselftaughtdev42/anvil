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

    Whitespace is stripped, so a blank value can't get through. Length limits are
    the consumer's, checked by the agent with Limits.
    """

    topic: str = Field(min_length=1)
    """A short label, for example "Edge cases"."""
    text: str = Field(min_length=1)
    why: str | None = None
    """Why the agent is asking, in one sentence."""
    suggestions: tuple[Annotated[str, Field(min_length=1)], ...] = ()


class Limits(BaseModel, frozen=True):
    """The longest output the consumer can take, for example to fit its database
    columns. Lengths are in characters.
    """

    title: int = Field(default=80, ge=10)
    """At least 10, so a cut title has room for a word and its ellipsis."""
    topic: int = Field(default=40, ge=1)
    suggestions: int = Field(default=3, ge=0)
    """The most suggested answers on one Question."""

    def check(self, draft: QuestionDraft) -> None:
        """Raises ValueError when the draft is over a limit."""
        if len(draft.topic) > self.topic:
            raise ValueError(f"topic is longer than {self.topic}: {draft.topic!r}")
        if len(draft.suggestions) > self.suggestions:
            raise ValueError(
                f"more than {self.suggestions} suggestions: {draft.suggestions!r}"
            )


class RefinementAgent(Protocol):
    """Refines an idea through Questions.

    `context` is background about where the idea comes from, or None when there
    isn't any.
    """

    def name_idea(self, idea: str, context: str | None) -> str:
        """A short title for a new idea, within the agent's title limit."""
        ...

    def ask_questions(
        self,
        subject: Subject,
        asked: Sequence[AskedQuestion],
        context: str | None,
    ) -> list[QuestionDraft]:
        """The next batch of Questions. An empty list means nothing more to ask.

        `asked` is every Question asked so far, answered or not, in the order they
        were asked, so the agent never asks one twice.
        """
        ...

    # Judging when a Subject is clear enough to suggest it's done goes here next.
