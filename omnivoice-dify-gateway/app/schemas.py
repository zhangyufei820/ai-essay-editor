from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class VoiceInfo(BaseModel):
    voice_id: str = Field(description="Voice identifier accepted by the gateway.")
    name: str = Field(description="Human friendly voice name.")
    language: str = Field(default="zh-CN", description="Primary language for this voice.")
    description: str = Field(default="", description="Recommended usage for this voice.")
    enabled: bool = Field(default=True, description="Whether this voice can currently be used.")


class VoicesResponse(BaseModel):
    voices: list[VoiceInfo] = Field(description="Voices available to Dify and shenxiang.school.")


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to synthesize into speech.")
    voice_id: str | None = Field(default=None, description="Voice ID. Must be in ALLOWED_VOICE_IDS.")
    language: str = Field(default="zh-CN", description="Language code, for example zh-CN.")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Speech speed multiplier.")
    emotion: str | None = Field(default="friendly", description="Speaking style or emotion hint.")
    format: Literal["mp3", "wav", "flac", "opus"] = Field(default="mp3", description="Audio output format.")
    return_mode: Literal["url"] = Field(default="url", description="Dify-friendly return mode. The gateway returns JSON with audio_url.")
    sync: bool = Field(default=False, description="When false, queue the job and return job_id. When true, wait for completion.")
    watermark: bool | None = Field(default=None, description="Whether the audio should be marked as AI-generated when supported.")

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text is required")
        return value


class TTSQueuedResponse(BaseModel):
    job_id: str = Field(description="Gateway job ID.")
    status: JobStatus = Field(description="Current job status.")
    message: str = Field(description="Human readable queue message.")


class TTSResultResponse(BaseModel):
    job_id: str = Field(description="Gateway job ID.")
    status: JobStatus = Field(description="Final job status.")
    audio_url: str | None = Field(default=None, description="Public URL to the generated audio.")
    filename: str | None = Field(default=None, description="Generated media filename.")
    mime_type: str | None = Field(default=None, description="Audio MIME type.")
    duration_seconds: float | None = Field(default=None, description="Best-effort audio duration in seconds.")
    voice_id: str = Field(description="Voice ID used for synthesis.")


class EssayCommentaryRequest(BaseModel):
    student_grade: str = Field(default="初中", description="Student grade, e.g. 小学/初中/高中.")
    essay_title: str = Field(default="", description="Essay title.")
    essay_text: str = Field(default="", description="Original student essay. Long text is summarized by rules and not read fully.")
    grading_report: str = Field(..., min_length=1, description="Existing grading report or commentary text.")
    voice_id: str | None = Field(default=None, description="Voice ID to synthesize.")
    style: str = Field(default="亲切、鼓励、像老师面对面讲评", description="Desired speaking style.")
    duration_target_seconds: int | None = Field(default=120, ge=30, le=900, description="Target commentary duration.")
    sync: bool = Field(default=False, description="When true, return audio_url after synthesis.")


class EssayCommentaryResponse(BaseModel):
    job_id: str = Field(description="Gateway job ID.")
    status: JobStatus = Field(description="Current or final status.")
    commentary_text: str = Field(description="Final text sent to TTS.")
    audio_url: str | None = Field(default=None, description="Public audio URL when completed.")
    filename: str | None = Field(default=None, description="Generated media filename when completed.")


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    audio_url: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    filename: str | None = None
    mime_type: str | None = None
    duration_seconds: float | None = None
    voice_id: str | None = None
    commentary_text: str | None = None


class VoiceCloneRequest(BaseModel):
    audio_url: HttpUrl | None = Field(default=None, description="HTTPS/HTTP URL of consented reference audio.")
    base64_audio: str | None = Field(default=None, description="Base64 encoded reference audio.")
    speaker_name: str = Field(..., min_length=1, max_length=100, description="Speaker display name.")
    consent_confirmed: bool = Field(..., description="Must be true. Confirms rights and consent.")
    intended_use: str = Field(..., min_length=1, max_length=500, description="Declared use case.")
    owner_contact: str | None = Field(default=None, max_length=200, description="Optional owner contact for audit.")

    @model_validator(mode="after")
    def validate_audio_source(self):
        if bool(self.audio_url) == bool(self.base64_audio):
            raise ValueError("Provide exactly one of audio_url or base64_audio")
        return self


class VoiceCloneResponse(BaseModel):
    voice_id: str | None = Field(default=None, description="Created voice profile ID when cloning is enabled.")
    status: str = Field(description="disabled|pending_admin_review|created")
    message: str = Field(description="Human readable result.")


class HealthResponse(BaseModel):
    status: str
    gateway: str
    omnivoice: str
    version: str
    time: str


class ErrorEnvelope(BaseModel):
    error: dict = Field(description="Uniform JSON error with code, message, request_id.")

