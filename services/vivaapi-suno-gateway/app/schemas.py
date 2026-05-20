from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ALLOWED_MODELS = {
    "chirp-v3-0",
    "chirp-v3-5",
    "chirp-v4",
    "chirp-auk",
    "chirp-v5",
    "chirp-fenix",
    "chirp-v3-5-upload",
    "chirp-v3-5-tau",
    "chirp-v4-tau",
}


class FlexibleModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class GatewayResponse(BaseModel):
    success: bool = True
    status_code: int = 200
    provider_code: str = "success"
    message: str = ""
    task_id: str = ""
    clip_id: str = ""
    upload_id: str = ""
    status: str = ""
    audio_urls: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    wav_url: str = ""
    timing: Any = None
    data: Any = None
    provider_response: dict[str, Any] = Field(default_factory=dict)
    error: Any = None


class BaseTaskRequest(FlexibleModel):
    notify_hook: str | None = None


class MusicInspirationRequest(BaseTaskRequest):
    gpt_description_prompt: str
    make_instrumental: bool | None = False
    mv: str = "chirp-v5"
    prompt: str | None = None


class MusicCustomRequest(BaseTaskRequest):
    prompt: str
    mv: str = "chirp-v5"
    title: str
    tags: str = ""
    negative_tags: str | None = ""
    generation_type: str | None = "TEXT"
    metadata: dict[str, Any] | None = None


class MusicExtendRequest(BaseTaskRequest):
    prompt: str
    mv: str = "chirp-v5"
    title: str | None = None
    tags: str | None = ""
    negative_tags: str | None = ""
    continue_at: float
    continue_clip_id: str
    task: str | None = None

    @model_validator(mode="after")
    def default_task(self) -> "MusicExtendRequest":
        if not self.task:
            self.task = "extend"
        return self


class MusicPersonaRequest(BaseTaskRequest):
    prompt: str
    generation_type: str | None = "TEXT"
    tags: str | None = ""
    negative_tags: str | None = ""
    mv: str = "chirp-v4-tau"
    title: str | None = None
    task: str | None = None
    persona_id: str
    artist_clip_id: str
    vocal_gender: str | None = ""

    @model_validator(mode="after")
    def default_task(self) -> "MusicPersonaRequest":
        if not self.task:
            self.task = "artist_consistency"
        return self


class MusicUploadExtendRequest(BaseTaskRequest):
    prompt: str
    tags: str | None = ""
    negative_tags: str | None = ""
    mv: str = "chirp-v4"
    title: str | None = None
    continue_clip_id: str
    continue_at: float
    task: str | None = None

    @model_validator(mode="after")
    def default_task(self) -> "MusicUploadExtendRequest":
        if not self.task:
            self.task = "upload_extend"
        return self


class MusicCoverRequest(BaseTaskRequest):
    prompt: str | None = ""
    generation_type: str | None = "TEXT"
    tags: str | None = ""
    negative_tags: str | None = ""
    mv: str = "chirp-v3-5-tau"
    title: str | None = None
    continue_clip_id: str | None = None
    continue_at: float | None = None
    continued_aligned_prompt: str | None = None
    infill_start_s: float | None = None
    infill_end_s: float | None = None
    task: str | None = None
    cover_clip_id: str

    @model_validator(mode="after")
    def default_task(self) -> "MusicCoverRequest":
        if not self.task:
            self.task = "cover"
        return self


class ClipActionRequest(FlexibleModel):
    clip_id: str
    is_infill: bool = False


class LyricsRequest(BaseTaskRequest):
    prompt: str


class UploadAuthorizeRequest(FlexibleModel):
    extension: str


class UploadFinishRequest(FlexibleModel):
    upload_type: str = "file_upload"
    upload_filename: str


class EmptyBody(FlexibleModel):
    pass


class GenerateInspirationRequest(FlexibleModel):
    gpt_description_prompt: str


class GenerateCustomRequest(FlexibleModel):
    prompt: str
    mv: str = "chirp-v3-5"
    title: str
    tags: str


class GenerateInstrumentalRequest(FlexibleModel):
    prompt: str | None = ""
    tags: str
    mv: str = "chirp-v3-5"
    title: str
    continue_clip_id: str | None = None
    continue_at: float | None = None
    infill_start_s: float | None = None
    infill_end_s: float | None = None


class BatchFetchRequest(FlexibleModel):
    ids: list[str]

    @field_validator("ids")
    @classmethod
    def ids_not_empty(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("ids must not be empty")
        return value


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
            raise ValueError("path must be a relative /suno/ path")
        if value.startswith("//"):
            raise ValueError("path must not be a protocol-relative URL")
        if not value.startswith("/suno/"):
            raise ValueError("path must start with /suno/")
        return value


class FullUploadCreateFields(FlexibleModel):
    prompt: str
    title: str
    tags: str = ""
    negative_tags: str = ""
    mv: str = "chirp-v4"
    continue_at: float = 10
    task: str = "upload_extend"
    notify_hook: str | None = None


ProviderStatus = Literal["complete", "completed"]
