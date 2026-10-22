from collections.abc import Sequence
from typing import Annotated, Protocol

from pydantic import BaseModel, Field

TITLE_MAX_LENGTH = 80
# Matches the question table's topic column, so a draft always fits its row.
TOPIC_MAX_LENGTH = 40
# The agent's own cap; the table deliberately has none.
SUGGESTIONS_MAX = 3


class RequirementBrief(BaseModel, frozen=True):
    """What the agent is told about the Requirement it's refining."""

    title: str
    idea: str


class AskedQuestion(BaseModel, frozen=True):
    """A Question the agent has already asked about this Requirement."""

    topic: str
    text: str
    answer: str | None = None
    """None while the Question is still Open."""


class QuestionDraft(BaseModel, frozen=True, str_strip_whitespace=True):
    """A new Question from the agent, before it's saved.

    Whitespace is stripped, so a blank value can't reach a card.
    """

    topic: str = Field(min_length=1, max_length=TOPIC_MAX_LENGTH)
    """A short label shown on the card, for example "Edge cases"."""
    text: str = Field(min_length=1)
    why: str | None = None
    """Why Anvil is asking, in one sentence."""
    suggestions: tuple[Annotated[str, Field(min_length=1)], ...] = Field(
        default=(), max_length=SUGGESTIONS_MAX
    )


class RefinementAgent(Protocol):
    """The one way into AI behaviour: refines a Requirement through Questions.

    `context` is the Project Context, or None when there isn't one.
    """

    def name_requirement(self, idea: str, context: str | None) -> str:
        """A short title, at most TITLE_MAX_LENGTH characters, for a new idea."""
        ...

    def ask_questions(
        self,
        requirement: RequirementBrief,
        asked: Sequence[AskedQuestion],
        context: str | None,
    ) -> list[QuestionDraft]:
        """The next batch of Questions. An empty list means nothing more to ask.

        `asked` is every Question asked so far, Open or not, in the order they were
        asked, so the agent never asks one twice.
        """
        ...

    # Judging when a Requirement is clear enough to suggest it's Complete goes
    # here next.
