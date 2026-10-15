from typing import Protocol

TITLE_MAX_LENGTH = 80


class RefinementAgent(Protocol):
    # `context` is the Project Context, or None when there isn't one.
    def name_requirement(self, idea: str, context: str | None) -> str:
        """A short title, at most TITLE_MAX_LENGTH characters, for a new idea."""
        ...

    # Refinement's methods go here next: asking the next Question, and judging
    # when a Requirement is clear enough to suggest it's Complete.
