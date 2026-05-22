from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Mode = Literal["auto", "sync", "async"]
RiskLevel = Literal["normal", "needs_clarification", "unsafe", "unsupported"]


class RunRequest(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    task_type: str = Field(default="general_chat", max_length=120)
    user_intent: str = Field(default="", max_length=160)
    user_query: str = Field(..., min_length=1, max_length=20000)
    language: str = Field(default="zh", max_length=20)
    user_level: str = Field(default="未知", max_length=80)
    output_format: str = Field(default="structured_markdown", max_length=80)
    mode: Mode = "auto"
    need_image: bool = False
    need_file: bool = False
    risk_level: RiskLevel = "normal"
    params: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SkillFile(BaseModel):
    path: str = Field(..., min_length=1, max_length=240)
    content: str = Field(..., max_length=50000)


class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    display_name: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=500)
    files: list[SkillFile] = Field(default_factory=list, max_length=20)
    submit_for_review: bool = True


class AdminRunRequest(RunRequest):
    admin_reason: str = Field(..., min_length=8, max_length=500)
    allow_admin_intent: bool = True


class SkillPublic(BaseModel):
    name: str
    display_name: str
    category: str
    description: str
    queue: str
    timeout: int
    cost_points: int


class ChatMessage(BaseModel):
    role: str
    content: str | list[dict[str, Any]]


class ChatCompletionsRequest(BaseModel):
    model: str = "codex-skill-gateway"
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    model: str | None = None
    n: int = Field(default=1, ge=1, le=4)
    size: str = Field(default="1024x1024", max_length=40)
    quality: str | None = Field(default=None, max_length=40)
    style: str | None = Field(default=None, max_length=80)
    response_format: str | None = Field(default=None, max_length=40)
    user: str | None = Field(default=None, max_length=200)
