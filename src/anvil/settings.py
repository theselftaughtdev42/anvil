from pydantic import EmailStr, PostgresDsn
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


settings = Settings()
