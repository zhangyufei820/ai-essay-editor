from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    viva_base_url: str = Field(default="https://www.vivaapi.cn", alias="VIVA_BASE_URL")
    viva_api_token: str = Field(default="", alias="VIVA_API_TOKEN")
    gateway_api_key: str = Field(default="", alias="GATEWAY_API_KEY")
    request_timeout_seconds: float = Field(default=180, alias="REQUEST_TIMEOUT_SECONDS")
    max_upload_mb: int = Field(default=200, alias="MAX_UPLOAD_MB")
    strict_model_validation: bool = Field(default=False, alias="STRICT_MODEL_VALIDATION")
    callback_public_base_url: str | None = Field(default=None, alias="CALLBACK_PUBLIC_BASE_URL")
    s3_send_auth: bool = Field(default=False, alias="S3_SEND_AUTH")
    environment: Literal["local", "test", "production"] = Field(default="local", alias="ENVIRONMENT")
    service_version: str = Field(default="0.1.0", alias="SERVICE_VERSION")

    @field_validator("viva_base_url")
    @classmethod
    def strip_base_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def viva_authorization(self) -> str:
        token = self.viva_api_token.strip()
        if not token:
            return ""
        return token if token.lower().startswith("bearer ") else f"Bearer {token}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
