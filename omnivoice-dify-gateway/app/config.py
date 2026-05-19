from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    voice_gateway_api_key: str = Field(default="change-me", alias="VOICE_GATEWAY_API_KEY")
    omnivoice_base_url: str = Field(default="http://omnivoice:3900", alias="OMNIVOICE_BASE_URL")
    public_base_url: str = Field(default="https://voice-api.shenxiang.school", alias="PUBLIC_BASE_URL")
    media_dir: Path = Field(default=Path("/data/media"), alias="MEDIA_DIR")
    jobs_dir: Path = Field(default=Path("/data/jobs"), alias="JOBS_DIR")
    max_text_chars: int = Field(default=5000, alias="MAX_TEXT_CHARS")
    max_concurrent_jobs: int = Field(default=2, alias="MAX_CONCURRENT_JOBS")
    enable_voice_clone: bool = Field(default=False, alias="ENABLE_VOICE_CLONE")
    allowed_voice_ids_csv: str = Field(default="teacher_male_01,teacher_female_01,default", alias="ALLOWED_VOICE_IDS")
    voice_id_aliases_csv: str = Field(default="teacher_female_01:default,teacher_male_01:default", alias="VOICE_ID_ALIASES")
    default_voice_id: str = Field(default="teacher_female_01", alias="DEFAULT_VOICE_ID")
    enable_audio_watermark: bool = Field(default=True, alias="ENABLE_AUDIO_WATERMARK")
    request_timeout_seconds: int = Field(default=600, alias="REQUEST_TIMEOUT_SECONDS")
    cors_allow_origins_csv: str = Field(default="https://shenxiang.school,https://www.shenxiang.school", alias="CORS_ALLOW_ORIGINS")
    rate_limit_per_minute: int = Field(default=30, alias="RATE_LIMIT_PER_MINUTE")
    clone_rate_limit_per_hour: int = Field(default=3, alias="CLONE_RATE_LIMIT_PER_HOUR")
    mock_tts_when_omnivoice_unavailable: bool = Field(default=False, alias="MOCK_TTS_WHEN_OMNIVOICE_UNAVAILABLE")
    version: str = "0.1.0"

    @property
    def allowed_voice_ids(self) -> list[str]:
        return [item.strip() for item in self.allowed_voice_ids_csv.split(",") if item.strip()]

    @property
    def voice_id_aliases(self) -> dict[str, str]:
        aliases: dict[str, str] = {}
        for item in self.voice_id_aliases_csv.split(","):
            if ":" not in item:
                continue
            public_id, upstream_id = item.split(":", 1)
            public_id = public_id.strip()
            upstream_id = upstream_id.strip()
            if public_id and upstream_id:
                aliases[public_id] = upstream_id
        return aliases

    @property
    def cors_allow_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_allow_origins_csv.split(",") if item.strip()]

    @property
    def jobs_jsonl_path(self) -> Path:
        return self.jobs_dir / "jobs.jsonl"

    @property
    def audit_log_path(self) -> Path:
        return self.jobs_dir / "voice_clone_audit.jsonl"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    settings.jobs_dir.mkdir(parents=True, exist_ok=True)
    return settings
