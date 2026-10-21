from typing import Annotated

from fastapi import Depends

from anvil.agent.base import RefinementAgent
from anvil.agent.stub import StubAgent
from anvil.settings import Settings, settings


def create_agent(settings: Settings) -> RefinementAgent:
    # Settings has already rejected any AGENT that isn't listed here.
    match settings.agent:
        case "stub":
            return StubAgent(delay_ms=settings.stub_agent_delay_ms)


# Built once, on import, so a bad configuration stops the app starting.
agent = create_agent(settings)


def get_agent() -> RefinementAgent:
    return agent


AgentDep = Annotated[RefinementAgent, Depends(get_agent)]
