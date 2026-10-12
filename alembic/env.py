from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection
from sqlmodel import SQLModel

import anvil.models  # noqa: F401  (registers tables on SQLModel.metadata)
from anvil.db import engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Emit migration SQL to stdout (`alembic upgrade head --sql`)."""
    context.configure(
        url=engine.url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Tests pass their own connection (to the test database) via
    # Config.attributes; normal CLI runs use the app's engine.
    connection = config.attributes.get("connection")
    if connection is not None:
        run_migrations(connection)
        return

    with engine.connect() as connection:
        run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
