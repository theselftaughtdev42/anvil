"""Refines an idea through Questions, until it's clear enough to act on.

Consumers depend on RefinementAgent and choose an implementation, such as
StubAgent, passing the Limits their output has to fit.
"""

from idea_refiner.base import (
    AskedQuestion,
    Limits,
    QuestionDraft,
    RefinementAgent,
    Subject,
)
from idea_refiner.stub import StubAgent

__all__ = [
    "AskedQuestion",
    "Limits",
    "QuestionDraft",
    "RefinementAgent",
    "StubAgent",
    "Subject",
]
