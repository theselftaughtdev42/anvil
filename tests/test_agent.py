import ast
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from idea_refiner import StubAgent
from idea_refiner.model import ModelAgent

from anvil.agent import AgentDep, create_agent, get_agent
from anvil.settings import Settings

IMPLEMENTATIONS = {"StubAgent", "ModelAgent"}
IMPLEMENTATION_MODULES = {"idea_refiner.stub", "idea_refiner.model"}
URL = "postgresql+psycopg://user:pass@localhost:5432/db"


def imports_an_implementation(path: Path) -> bool:
    return any(
        node.module in IMPLEMENTATION_MODULES
        or any(alias.name in IMPLEMENTATIONS for alias in node.names)
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.ImportFrom)
    )


def test_only_the_agent_module_imports_an_implementation() -> None:
    src = Path(__file__).parents[1] / "src" / "anvil"
    importers = [
        path.relative_to(src)
        for path in src.rglob("*.py")
        if path != src / "agent.py" and imports_an_implementation(path)
    ]

    assert importers == []


def test_routes_get_the_agent_from_its_dep() -> None:
    calls: list[tuple[str, str | None]] = []

    class FakeAgent:
        def name_idea(self, idea: str, context: str | None) -> str:
            calls.append((idea, context))
            return "Fake title"

    app = FastAPI()

    @app.post("/name")
    def name(agent: AgentDep) -> str:
        return agent.name_idea("an idea", None)

    app.dependency_overrides[get_agent] = FakeAgent

    assert TestClient(app).post("/name").json() == "Fake title"
    assert calls == [("an idea", None)]


def start_app(**env: str) -> subprocess.CompletedProcess[str]:
    """Starts the app in a fresh process, since the startup checks run on import."""
    return subprocess.run(
        [sys.executable, "-c", "from anvil.main import app"],
        check=False,
        env=os.environ | env,
        capture_output=True,
        text=True,
    )


def test_unknown_agent_stops_the_app() -> None:
    result = start_app(AGENT="unknown")

    assert result.returncode != 0
    assert "agent" in result.stderr
    assert "'unknown'" in result.stderr


def test_unknown_model_provider_stops_the_app() -> None:
    result = start_app(AGENT="model", AGENT_MODEL="unknown:some-model")

    assert result.returncode != 0
    assert "unknown:some-model" in result.stderr


def test_the_stub_is_the_default_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT", raising=False)

    assert isinstance(
        create_agent(Settings(_env_file=None, database_url=URL)), StubAgent
    )


def test_model_agent_uses_the_configured_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "not-a-real-key")
    settings = Settings(
        _env_file=None,
        database_url=URL,
        agent="model",
        agent_model="anthropic:claude-sonnet-5-5",
    )

    agent = create_agent(settings)

    assert isinstance(agent, ModelAgent)
    assert agent.model.system == "anthropic"
    assert agent.model.model_name == "claude-sonnet-5-5"
