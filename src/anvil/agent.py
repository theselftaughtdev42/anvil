"""The refinement agent, from idea-refiner.

The API and UI get the configured agent from AgentDep, never by naming an
implementation.
"""

from typing import Annotated

from fastapi import Depends
from idea_refiner import Limits, RefinementAgent, StubAgent

from anvil.models.question import TOPIC_MAX_LENGTH
from anvil.settings import Settings, settings

LIMITS = Limits(title=80, topic=TOPIC_MAX_LENGTH, suggestions=3)


def create_agent(settings: Settings) -> RefinementAgent:
    # Settings has already rejected any AGENT that isn't listed here.
    match settings.agent:
        case "stub":
            return StubAgent(limits=LIMITS, delay_ms=settings.stub_agent_delay_ms)


# Built once, on import, so a bad configuration stops the app starting.
agent = create_agent(settings)


def get_agent() -> RefinementAgent:
    return agent


AgentDep = Annotated[RefinementAgent, Depends(get_agent)]
