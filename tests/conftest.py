from collections.abc import Generator, Iterator
from contextlib import contextmanager

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import URL, Engine, create_engine, inspect, make_url, text

from anvil import PROJECT_ROOT
from anvil.settings import settings


@contextmanager
def throwaway_database(suffix: str) -> Generator[URL]:
    """Create `<db>_<suffix>` on the same server as DATABASE_URL, and drop it after."""
    url = make_url(str(settings.database_url))
    test_url = url.set(database=f"{url.database}_{suffix}")
    drop = text(f'DROP DATABASE IF EXISTS "{test_url.database}" WITH (FORCE)')

    # CREATE/DROP DATABASE can't run inside a transaction, hence AUTOCOMMIT.
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(drop)
        conn.execute(text(f'CREATE DATABASE "{test_url.database}"'))

    yield test_url

    with admin.connect() as conn:
        conn.execute(drop)
    admin.dispose()


@pytest.fixture(scope="session")
def test_db_url() -> Iterator[URL]:
    """A throwaway database for tests that build the schema themselves."""
    with throwaway_database("test") as url:
        yield url


@pytest.fixture
def empty_db(test_db_url: URL) -> Iterator[Engine]:
    """An engine on the test database, with the public schema wiped first."""
    engine = create_engine(test_db_url)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def migrated_db_once() -> Iterator[Engine]:
    """A second throwaway database, migrated to head once per session."""
    # Separate from test_db_url because the migration tests wipe that one's schema.
    with throwaway_database("test_migrated") as url:
        engine = create_engine(url)
        # No ini file: alembic.ini only configures logging, which would
        # otherwise reset pytest's log capture.
        config = Config(toml_file=PROJECT_ROOT / "pyproject.toml")
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield engine
        engine.dispose()


@pytest.fixture
def migrated_db(migrated_db_once: Engine) -> Engine:
    """The migrated test database, emptied of rows."""
    tables = [
        f'"{name}"'
        for name in inspect(migrated_db_once).get_table_names()
        if name != "alembic_version"
    ]
    with migrated_db_once.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    return migrated_db_once
