from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ProviderName = Literal["auto", "tavily", "brave"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gateway_api_key: str = Field(default="", alias="GATEWAY_API_KEY")
    search_provider: ProviderName = Field(default="auto", alias="SEARCH_PROVIDER")
    search_provider_order: str = Field(default="tavily,brave", alias="SEARCH_PROVIDER_ORDER")
    request_timeout_seconds: float = Field(default=30, alias="REQUEST_TIMEOUT_SECONDS")
    environment: Literal["local", "test", "production"] = Field(default="local", alias="ENVIRONMENT")
    service_version: str = Field(default="0.1.0", alias="SERVICE_VERSION")

    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")
    tavily_base_url: str = Field(default="https://api.tavily.com", alias="TAVILY_BASE_URL")

    brave_api_key: str = Field(default="", alias="BRAVE_API_KEY")
    brave_base_url: str = Field(default="https://api.search.brave.com/res/v1", alias="BRAVE_BASE_URL")

    @field_validator("tavily_base_url", "brave_base_url")
    @classmethod
    def strip_base_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def provider_order(self) -> list[str]:
        providers = [item.strip().lower() for item in self.search_provider_order.split(",")]
        return [provider for provider in providers if provider in {"tavily", "brave"}]

    def has_provider_key(self, provider: str) -> bool:
        if provider == "tavily":
            return bool(self.tavily_api_key.strip())
        if provider == "brave":
            return bool(self.brave_api_key.strip())
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()
