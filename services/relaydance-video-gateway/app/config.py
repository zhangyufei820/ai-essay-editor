from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    relaydance_base_url: str = Field(default="https://relaydance.com", alias="RELAYDANCE_BASE_URL")
    relaydance_api_token: str = Field(default="", alias="RELAYDANCE_API_TOKEN")
    gateway_api_key: str = Field(default="", alias="GATEWAY_API_KEY")
    request_timeout_seconds: float = Field(default=180, alias="REQUEST_TIMEOUT_SECONDS")
    strict_model_validation: bool = Field(default=True, alias="STRICT_MODEL_VALIDATION")
    enable_last_frame: bool = Field(default=False, alias="ENABLE_LAST_FRAME")
    environment: Literal["local", "test", "production"] = Field(default="local", alias="ENVIRONMENT")
    service_version: str = Field(default="0.1.0", alias="SERVICE_VERSION")

    @field_validator("relaydance_base_url")
    @classmethod
    def strip_base_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def relaydance_authorization(self) -> str:
        token = self.relaydance_api_token.strip()
        if not token:
            return ""
        return token if token.lower().startswith("bearer ") else f"Bearer {token}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
