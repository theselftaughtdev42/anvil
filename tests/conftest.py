from collections.abc import Iterator

import pytest
from sqlalchemy import URL, Engine, create_engine, make_url, text

from anvil.settings import settings


@pytest.fixture(scope="session")
def test_db_url() -> Iterator[URL]:
    """A throwaway `<db>_test` database on the same server as DATABASE_URL."""
    url = make_url(str(settings.database_url))
    test_url = url.set(database=f"{url.database}_test")

    # CREATE/DROP DATABASE can't run inside a transaction, hence AUTOCOMMIT.
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{test_url.database}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{test_url.database}"'))

    yield test_url

    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{test_url.database}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture
def empty_db(test_db_url: URL) -> Iterator[Engine]:
    """An engine on the test database, with the public schema wiped first."""
    engine = create_engine(test_db_url)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    yield engine
    engine.dispose()
