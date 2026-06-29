from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ALLOWED_MODELS = {
    "dreamina-seedance-2-0-260128",
    "dreamina-seedance-2-0-fast-260128",
    "dreamina-seedance-2-0-mini-260615",
    "doubao-seedance-2-0-fast-260128",
    "doubao-seedance-2-0-720p",
    "doubao-seedance-2-0-1080p",
    "seedance-nsfw",
}
MODEL_ALIASES = {
    "seedance-nsfw-4k": "seedance-nsfw",
}
ALLOWED_SECONDS = {str(value) for value in range(4, 16)}
ALLOWED_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}
ALLOWED_RESOLUTIONS = {"720p", "1080p"}
COMPLETED_STATUSES = {"completed", "succeeded", "success"}
FAILED_STATUSES = {"failed", "failure", "error"}


def canonical_model(model: str) -> str:
    return MODEL_ALIASES.get(model, model)


class FlexibleModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class GatewayResponse(BaseModel):
    success: bool = True
    status_code: int = 200
    provider_code: str = "success"
    message: str = ""
    task_id: str = ""
    status: str = ""
    progress: int | None = None
    video_url: str = ""
    video_urls: list[str] = Field(default_factory=list)
    upload_url: str = ""
    source_url: str = ""
    asset_id: str = ""
    warnings: list[str] = Field(default_factory=list)
    data: Any = Field(default=None, exclude=True)
    provider_response: dict[str, Any] = Field(default_factory=dict, exclude=True)
    error: Any = None


class ImageUrl(FlexibleModel):
    url: str


class VideoContentItem(FlexibleModel):
    type: Literal["image_url"] = "image_url"
    image_url: ImageUrl
    role: str = "first_frame"


class GenerationMetadata(FlexibleModel):
    ratio: str
    resolution: str
    generate_audio: bool = False
    watermark: bool | None = None
    content: list[VideoContentItem] | None = None

    @field_validator("ratio")
    @classmethod
    def validate_ratio(cls, value: str) -> str:
        if value not in ALLOWED_RATIOS:
            raise ValueError(f"ratio must be one of: {', '.join(sorted(ALLOWED_RATIOS))}")
        return value

    @field_validator("resolution")
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in ALLOWED_RESOLUTIONS:
            raise ValueError("resolution must be 720p or 1080p")
        return value


class VideoGenerationRequest(FlexibleModel):
    model: str
    prompt: str
    seconds: str
    metadata: GenerationMetadata

    @field_validator("seconds", mode="before")
    @classmethod
    def stringify_seconds(cls, value: Any) -> str:
        return str(value)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        text = value.strip()
        if len(text) < 1:
            raise ValueError("prompt must not be empty")
        if len(text) > 2000:
            raise ValueError("prompt must not exceed 2000 characters")
        return text

    @field_validator("seconds")
    @classmethod
    def validate_seconds(cls, value: str) -> str:
        if value not in ALLOWED_SECONDS:
            raise ValueError("seconds must be an integer from 4 to 15")
        return value

    @model_validator(mode="after")
    def validate_model_resolution(self) -> "VideoGenerationRequest":
        if self.model == "doubao-seedance-2-0-fast-260128" and self.metadata.resolution == "1080p":
            raise ValueError("fast model does not support 1080p")
        if self.model.endswith("-720p") and self.metadata.resolution != "720p":
            raise ValueError("model resolution suffix must match metadata.resolution")
        if self.model.endswith("-1080p") and self.metadata.resolution != "1080p":
            raise ValueError("model resolution suffix must match metadata.resolution")
        return self


class DifyVideoCreateRequest(FlexibleModel):
    prompt: str
    model: str = "doubao-seedance-2-0-720p"
    seconds: str = "5"
    ratio: str = "16:9"
    resolution: str = "720p"
    generate_audio: bool = False
    watermark: bool | None = None
    first_frame_url: str | None = None
    last_frame_url: str | None = None

    @field_validator("seconds", mode="before")
    @classmethod
    def stringify_seconds(cls, value: Any) -> str:
        return str(value)


class UploadUrlRequest(FlexibleModel):
    ext: str = "jpg"
    md5: str

    @field_validator("ext")
    @classmethod
    def validate_ext(cls, value: str) -> str:
        ext = value.lower().lstrip(".")
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise ValueError("ext must be jpg, jpeg, png, or webp")
        return ext

    @field_validator("md5")
    @classmethod
    def validate_md5(cls, value: str) -> str:
        text = value.strip().lower()
        if len(text) != 32 or any(char not in "0123456789abcdef" for char in text):
            raise ValueError("md5 must be a 32-character hex digest")
        return text


class AssetCreateRequest(FlexibleModel):
    source_url: str
    asset_type: str = "Image"


class RawMethod(str, Enum):
    GET = "GET"
    POST = "POST"


class RawRequest(FlexibleModel):
    method: RawMethod
    path: str
    body: dict[str, Any] | None = None
    query: dict[str, Any] | None = None

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if value.startswith("http://") or value.startswith("https://"):
            raise ValueError("path must be a relative RelayDance API path")
        if value.startswith("//"):
            raise ValueError("path must not be a protocol-relative URL")
        allowed_prefixes = ("/v1/video/", "/v1/videos/", "/api/upload-url", "/api/assets/")
        if not value.startswith(allowed_prefixes):
            raise ValueError("path must start with an allowed RelayDance API path")
        return value
