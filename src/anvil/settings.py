from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

from anvil import PROJECT_ROOT


class Settings(BaseSettings):
    # Real environment variables take precedence over .env, so deployments
    # can skip the file entirely. extra="ignore" lets .env also hold
    # variables meant for other tools (e.g. compose's POSTGRES_*).
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    database_url: PostgresDsn


settings = Settings()
