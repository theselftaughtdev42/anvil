import time
from collections.abc import Sequence

from idea_refiner.base import AskedQuestion, Limits, QuestionDraft, Subject

TITLE_MAX_WORDS = 6
ELLIPSIS = "…"
# Closing brackets and quotes stay, so `the "login" button` keeps its quote.
TRAILING_PUNCTUATION = ".,;:!?-–—…"

DEFAULT_LIMITS = Limits()

QUESTIONS_PER_BATCH = 3
# Generic enough to suit any idea, asked in this order.
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
    """A deterministic, offline RefinementAgent, so its consumer runs with no model.

    `delay_ms` makes every call slow, to exercise a UI's loading states.
    """

    def __init__(self, limits: Limits = DEFAULT_LIMITS, delay_ms: int = 0) -> None:
        self.limits = limits
        self.delay_ms = delay_ms

    def name_idea(self, idea: str, context: str | None) -> str:
        """The idea's first few words. Ignores the context."""
        time.sleep(self.delay_ms / 1000)
        words = idea.split()
        title = " ".join(words[:TITLE_MAX_WORDS])
        cut = len(words) > TITLE_MAX_WORDS
        if len(title) > self.limits.title - len(ELLIPSIS):
            title = title[: self.limits.title - len(ELLIPSIS)]
            cut = True
        title = title.rstrip().rstrip(TRAILING_PUNCTUATION).rstrip()
        if not title:
            return "Untitled"
        title = title[0].upper() + title[1:]
        return title + ELLIPSIS if cut else title

    def ask_questions(
        self,
        subject: Subject,
        asked: Sequence[AskedQuestion],
        context: str | None,
    ) -> list[QuestionDraft]:
        """The next few of QUESTIONS not yet asked, matched on text, with their
        suggestions cut to the limit. Ignores the Subject and the context.
        """
        time.sleep(self.delay_ms / 1000)
        asked_texts = {question.text for question in asked}
        unasked = [q for q in QUESTIONS if q.text not in asked_texts]
        drafts = [
            q.model_copy(
                update={"suggestions": q.suggestions[: self.limits.suggestions]}
            )
            for q in unasked[:QUESTIONS_PER_BATCH]
        ]
        for draft in drafts:
            self.limits.check(draft)
        return drafts
