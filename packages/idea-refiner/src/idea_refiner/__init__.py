"""Refines an idea through Questions, until it's clear enough to act on.

Consumers depend on RefinementAgent and choose an implementation, such as
StubAgent.
"""

from idea_refiner.base import (
    AgentUnavailable,
    AskedQuestion,
    QuestionDraft,
    RefinementAgent,
    Subject,
)
from idea_refiner.stub import StubAgent

__all__ = [
    "AgentUnavailable",
    "AskedQuestion",
    "QuestionDraft",
    "RefinementAgent",
    "StubAgent",
    "Subject",
]
