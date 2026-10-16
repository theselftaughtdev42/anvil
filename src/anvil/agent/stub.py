import time
from collections.abc import Sequence

from anvil.agent.base import (
    TITLE_MAX_LENGTH,
    AnsweredQuestion,
    QuestionDraft,
    RequirementBrief,
)

TITLE_MAX_WORDS = 6
ELLIPSIS = "…"
# Closing brackets and quotes stay, so `the "login" button` keeps its quote.
TRAILING_PUNCTUATION = ".,;:!?-–—…"

QUESTIONS_PER_BATCH = 3
# Generic enough to suit any Requirement, asked in this order.
QUESTIONS = (
    QuestionDraft(
        topic="Who it's for",
        text="Who will use this most?",
        why="Knowing who it's for shapes what good looks like.",
        suggestions=("Customers", "Our own staff", "Both"),
    ),
    QuestionDraft(
        topic="The problem",
        text="What happens today, without it?",
        why="The current workaround shows what this has to beat.",
        suggestions=(
            "People do it by hand",
            "People ask someone else to do it",
            "It doesn't happen at all",
        ),
    ),
    QuestionDraft(
        topic="Success",
        text="How will you know it works?",
        why="A clear sign of success tells us when it's done.",
        suggestions=(
            "Fewer support requests",
            "People use it without help",
            "A number we already track goes up",
        ),
    ),
    QuestionDraft(
        topic="Edge cases",
        text="What should happen when it goes wrong?",
        why="Failures are where most of the unanswered detail hides.",
        suggestions=(
            "Show a clear error and let them retry",
            "Fall back to the old way",
            "Tell someone on our side",
        ),
    ),
    QuestionDraft(
        topic="Timing",
        text="When do you need it by?",
        why="A deadline decides how much can be in the first version.",
        suggestions=("This month", "This quarter", "No fixed date"),
    ),
    QuestionDraft(
        topic="Out of scope",
        text="What should this not try to do?",
        why="Saying what's left out keeps the Requirement from growing.",
        suggestions=(
            "Nothing beyond the idea",
            "Anything needing a new system",
            "Changes for other teams",
        ),
    ),
)


class StubAgent:
    """A deterministic, offline RefinementAgent, so Anvil runs with no model."""

    # delay_ms makes every call slow, to exercise the UI's loading states.
    def __init__(self, delay_ms: int = 0) -> None:
        self.delay_ms = delay_ms

    # The idea's first few words. Ignores the Project Context.
    def name_requirement(self, idea: str, context: str | None) -> str:
        time.sleep(self.delay_ms / 1000)
        words = idea.split()
        title = " ".join(words[:TITLE_MAX_WORDS])
        cut = len(words) > TITLE_MAX_WORDS
        if len(title) > TITLE_MAX_LENGTH - len(ELLIPSIS):
            title = title[: TITLE_MAX_LENGTH - len(ELLIPSIS)]
            cut = True
        title = title.rstrip().rstrip(TRAILING_PUNCTUATION).rstrip()
        if not title:
            return "Untitled"
        title = title[0].upper() + title[1:]
        return title + ELLIPSIS if cut else title

    # The next few of QUESTIONS not yet asked, matched on text. Ignores the
    # Requirement and the Project Context.
    def ask_questions(
        self,
        requirement: RequirementBrief,
        answered: Sequence[AnsweredQuestion],
        context: str | None,
    ) -> list[QuestionDraft]:
        time.sleep(self.delay_ms / 1000)
        # TODO: once Questions can be Dismissed, they won't be in `answered`, so
        # this would ask them again. Pass every asked Question instead.
        asked = {question.text for question in answered}
        unasked = [question for question in QUESTIONS if question.text not in asked]
        return unasked[:QUESTIONS_PER_BATCH]
