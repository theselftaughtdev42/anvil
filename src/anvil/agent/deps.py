import logging
from pathlib import Path
from typing import Annotated

from fastapi import Depends

from anvil import PROJECT_ROOT
from anvil.agent.base import RefinementAgent
from anvil.agent.stub import StubAgent
from anvil.settings import Settings, settings

logger = logging.getLogger(__name__)


class ProjectContextError(Exception):
    pass


def create_agent(settings: Settings) -> RefinementAgent:
    # Settings has already rejected any AGENT that isn't listed here.
    match settings.agent:
        case "stub":
            return StubAgent(delay_ms=settings.stub_agent_delay_ms)


# A relative path is relative to the repo root, like .env. No path, or no file
# at it, means no Project Context; a file that can't be read raises.
def load_project_context(path: Path | None) -> str | None:
    if path is None:
        return None
    full_path = PROJECT_ROOT / path
    try:
        return full_path.read_text()
    except FileNotFoundError:
        logger.warning(
            "No PROJECT_CONTEXT_FILE at %s, so no Project Context", full_path
        )
        return None
    except (OSError, UnicodeDecodeError) as e:
        raise ProjectContextError(
            f"PROJECT_CONTEXT_FILE {full_path} can't be read: {e}"
        ) from e


# Both built once, on import, so a bad configuration stops the app starting.
agent = create_agent(settings)
project_context = load_project_context(settings.project_context_file)


def get_agent() -> RefinementAgent:
    return agent


def get_project_context() -> str | None:
    return project_context


AgentDep = Annotated[RefinementAgent, Depends(get_agent)]
ProjectContextDep = Annotated[str | None, Depends(get_project_context)]
