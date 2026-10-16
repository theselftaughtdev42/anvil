from collections.abc import Sequence
from typing import Annotated, Protocol

from pydantic import BaseModel, Field

TITLE_MAX_LENGTH = 80
# Matches the question table's topic column, so a draft always fits its row.
TOPIC_MAX_LENGTH = 40
# The agent's own cap; the table deliberately has none.
SUGGESTIONS_MAX = 3


# What the agent is told about the Requirement it's refining.
class RequirementBrief(BaseModel, frozen=True):
    title: str
    idea: str


# A Question the agent has already asked about this Requirement.
class AskedQuestion(BaseModel, frozen=True):
    topic: str
    text: str
    # None while the Question is still Open.
    answer: str | None = None


# A new Question from the agent, before it's saved. Whitespace is stripped, so
# a blank value can't reach a card.
class QuestionDraft(BaseModel, frozen=True, str_strip_whitespace=True):
    # A short label shown on the card, for example "Edge cases".
    topic: str = Field(min_length=1, max_length=TOPIC_MAX_LENGTH)
    text: str = Field(min_length=1)
    # Why Anvil is asking, in one sentence.
    why: str | None = None
    # Suggested Answers.
    suggestions: tuple[Annotated[str, Field(min_length=1)], ...] = Field(
        default=(), max_length=SUGGESTIONS_MAX
    )


class RefinementAgent(Protocol):
    # `context` is the Project Context, or None when there isn't one.
    def name_requirement(self, idea: str, context: str | None) -> str:
        """A short title, at most TITLE_MAX_LENGTH characters, for a new idea."""
        ...

    # `asked` is every Question asked so far, Open or not, in the order they
    # were asked, so the agent never asks one twice.
    def ask_questions(
        self,
        requirement: RequirementBrief,
        asked: Sequence[AskedQuestion],
        context: str | None,
    ) -> list[QuestionDraft]:
        """The next batch of Questions. An empty list means nothing more to ask."""
        ...

    # Judging when a Requirement is clear enough to suggest it's Complete goes
    # here next.
