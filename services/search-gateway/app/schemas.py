from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ProviderName = Literal["auto", "tavily", "brave"]


class FlexibleModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class SearchResult(FlexibleModel):
    title: str = ""
    url: str = ""
    snippet: str = ""
    source: str = ""
    published_at: str | None = None
    score: float | None = None
    raw_content: str | None = None


class GatewayResponse(BaseModel):
    success: bool = True
    status_code: int = 200
    provider_code: str = "success"
    message: str = ""
    provider: str = ""
    query: str = ""
    answer: str = ""
    results: list[SearchResult] = Field(default_factory=list)
    data: Any = None
    provider_response: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    error: Any = None


class SearchRequest(FlexibleModel):
    query: str
    provider: ProviderName = "auto"
    max_results: int = 5
    search_depth: Literal["basic", "advanced"] = "basic"
    include_answer: bool = False
    include_raw_content: bool = False

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("query must not be empty")
        if len(text) > 500:
            raise ValueError("query must not exceed 500 characters")
        return text

    @field_validator("max_results")
    @classmethod
    def validate_max_results(cls, value: int) -> int:
        if value < 1 or value > 10:
            raise ValueError("max_results must be between 1 and 10")
        return value


class ExtractRequest(FlexibleModel):
    urls: list[str]
    include_images: bool = False
    extract_depth: Literal["basic", "advanced"] = "basic"

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, value: list[str]) -> list[str]:
        urls = [url.strip() for url in value if isinstance(url, str) and url.strip()]
        if not urls:
            raise ValueError("urls must not be empty")
        if len(urls) > 5:
            raise ValueError("urls must include at most 5 URLs")
        return urls
