from typing import Literal, Self

from pydantic import EmailStr, Field, PostgresDsn, model_validator
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
    agent: Literal["stub", "model"] = "stub"
    """Which RefinementAgent to use. Anything not listed fails validation."""
    agent_model: str | None = None
    """The `provider:model` the model agent uses, such as
    `anthropic:claude-sonnet-5-5`. Required when `agent` is `model`.
    """
    stub_agent_delay_ms: int = Field(default=0, ge=0)
    """Makes every StubAgent call this slow, to exercise the UI's loading states."""
    idea_placeholder: str = (
        "Drivers should see route changes on their phone without calling the depot"
    )
    """The example idea in the home page's empty prompt, served by /api/config."""

    @model_validator(mode="after")
    def model_agent_needs_a_model(self) -> Self:
        if self.agent == "model" and not self.agent_model:
            raise ValueError("AGENT_MODEL is required when AGENT is model")
        return self


settings = Settings()
