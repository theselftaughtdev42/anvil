import time

from anvil.agent.base import TITLE_MAX_LENGTH

TITLE_MAX_WORDS = 6
ELLIPSIS = "…"
# Closing brackets and quotes stay, so `the "login" button` keeps its quote.
TRAILING_PUNCTUATION = ".,;:!?-–—…"


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
