from pathlib import Path

import pytest
from pydantic import ValidationError

from anvil.settings import Settings

URL = "postgresql+psycopg://user:pass@localhost:5432/db"


def test_database_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError, match="database_url"):
        Settings(_env_file=None)


def test_rejects_non_postgres_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "mysql://user:pass@localhost/db")

    with pytest.raises(ValidationError, match="URL scheme"):
        Settings(_env_file=None)


def test_reads_env_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(f"DATABASE_URL={URL}\nPOSTGRES_USER=ignored\n")

    assert str(Settings(_env_file=env_file).database_url) == URL


def test_environment_overrides_env_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("DATABASE_URL=postgresql+psycopg://from-file/db\n")
    monkeypatch.setenv("DATABASE_URL", URL)

    assert str(Settings(_env_file=env_file).database_url) == URL
