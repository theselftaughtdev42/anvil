from pathlib import Path
from typing import Literal

from pydantic import EmailStr, Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

from anvil import PROJECT_ROOT


class Settings(BaseSettings):
    # Real environment variables take precedence over .env, so deployments
    # can skip the file entirely. extra="ignore" lets .env also hold
    # variables meant for other tools (e.g. compose's POSTGRES_*).
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    database_url: PostgresDsn
    # Baked into the image at build time; nothing sets it in local dev.
    git_commit: str = "unknown"
    # The person every request acts as until there is authentication.
    stub_user_name: str = "Dev User"
    stub_user_email: EmailStr = "dev@example.com"
    # Which RefinementAgent to use. Anything not listed fails validation.
    agent: Literal["stub"] = "stub"
    # Makes every StubAgent call this slow, to exercise the UI's loading states.
    stub_agent_delay_ms: int = Field(default=0, ge=0)
    # The Project Context, as a text or Markdown file. Relative to the repo root.
    project_context_file: Path | None = None
    # The example idea in the home page's empty prompt, served by /api/config.
    idea_placeholder: str = (
        "Drivers should see route changes on their phone without calling the depot"
    )


settings = Settings()
