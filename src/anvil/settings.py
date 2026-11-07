from pathlib import Path

from dotenv import load_dotenv
from pydantic import EmailStr, Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

from anvil import PROJECT_ROOT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")
    """Real environment variables take precedence over .env, so deployments can skip the
    file entirely. extra="ignore" lets .env also hold variables meant for other tools
    (e.g. compose's POSTGRES_*).
    """

    database_url: PostgresDsn
    git_commit: str = "unknown"
    """Baked into the image at build time; nothing sets it in local dev."""
    stub_user_name: str = "Dev User"
    """The person every request acts as until there is authentication."""
    stub_user_email: EmailStr = "dev@example.com"
    agent_model: str | None = None
    """The `provider:model`, such as `anthropic:claude-sonnet-5-5`, that the model
    agent asks. Unset or empty, Anvil uses the offline StubAgent instead.
    """
    agent_timeout_seconds: float = Field(default=60, gt=0)
    """How long the model agent may take over one call, retries included."""
    stub_agent_delay_ms: int = Field(default=0, ge=0)
    """Makes every StubAgent call this slow, to exercise the UI's loading states."""
    idea_placeholder: str = (
        "Drivers should see route changes on their phone without calling the depot"
    )
    """The example idea in the home page's empty prompt, served by /api/config."""


def load_settings(env_file: Path = PROJECT_ROOT / ".env") -> Settings:
    """Settings from the environment and env_file, which is also exported to os.environ.

    pydantic-settings keeps .env values to itself, but model providers (such as
    pydantic-ai's) read their API keys from os.environ. Real environment variables
    still win.
    """
    load_dotenv(env_file)
    return Settings(_env_file=env_file)


settings = load_settings()
