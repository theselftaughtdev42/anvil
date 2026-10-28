"""The refinement agent, from idea-refiner.

The API and UI get the configured agent from AgentDep, never by naming an
implementation.
"""

from typing import Annotated

from fastapi import Depends
from idea_refiner import RefinementAgent, StubAgent
from idea_refiner.model import ModelAgent

from anvil.settings import Settings, settings


def create_agent(settings: Settings) -> RefinementAgent:
    # Settings has already rejected any AGENT that isn't listed here.
    match settings.agent:
        case "stub":
            return StubAgent(delay_ms=settings.stub_agent_delay_ms)
        case "model":
            assert settings.agent_model
            return ModelAgent(settings.agent_model)


# Built once, on import, so a bad configuration stops the app starting.
agent = create_agent(settings)


def get_agent() -> RefinementAgent:
    return agent


AgentDep = Annotated[RefinementAgent, Depends(get_agent)]
