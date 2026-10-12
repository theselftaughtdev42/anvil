from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    # Real environment variables take precedence over .env, so deployments
    # can skip the file entirely. extra="ignore" lets .env also hold
    # variables meant for other tools (e.g. compose's POSTGRES_*).
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str


settings = Settings()
