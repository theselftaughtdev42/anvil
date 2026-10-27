import ast
import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from anvil.agent import AgentDep, get_agent


def imports_stub(path: Path) -> bool:
    return any(
        node.module == "idea_refiner.stub"
        or any(alias.name == "StubAgent" for alias in node.names)
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.ImportFrom)
    )


def test_only_the_agent_module_imports_an_implementation() -> None:
    src = Path(__file__).parents[1] / "src" / "anvil"
    importers = [
        path.relative_to(src)
        for path in src.rglob("*.py")
        if path != src / "agent.py" and imports_stub(path)
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
