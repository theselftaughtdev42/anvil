import time
from collections.abc import Sequence

from idea_refiner.base import AskedQuestion, QuestionDraft, Subject

TITLE_MAX_WORDS = 6
ELLIPSIS = "…"
# Closing brackets and quotes stay, so `the "login" button` keeps its quote.
TRAILING_PUNCTUATION = ".,;:!?-–—…"

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

    def __init__(self, delay_ms: int = 0) -> None:
        self.delay_ms = delay_ms

    def name_idea(self, idea: str, context: str | None) -> str:
        """The idea's first few words. Ignores the context."""
        time.sleep(self.delay_ms / 1000)
        words = idea.split()
        title = " ".join(words[:TITLE_MAX_WORDS])
        cut = len(words) > TITLE_MAX_WORDS
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
        feedback: Sequence[str],
    ) -> list[QuestionDraft]:
        """The next few of QUESTIONS, then one follow-up per piece of feedback, that
        haven't been asked, matched on text. So the same feedback twice asks nothing
        new. Ignores the Subject and the context.
        """
        time.sleep(self.delay_ms / 1000)
        asked_texts = {question.text for question in asked}
        candidates = [*QUESTIONS, *(follow_up(note) for note in feedback)]
        unasked = [q for q in candidates if q.text not in asked_texts]
        return unasked[:QUESTIONS_PER_BATCH]


def follow_up(feedback: str) -> QuestionDraft:
    return QuestionDraft(
        topic="What's missing",
        text=f"You said this is missing: “{feedback}”. What should it cover?",
        why="You said the idea wasn't clear enough yet.",
    )
