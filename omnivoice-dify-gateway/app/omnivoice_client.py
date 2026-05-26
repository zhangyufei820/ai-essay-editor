import base64
import logging
import uuid
import wave
from pathlib import Path

import httpx

from .config import Settings
from .schemas import TTSRequest
from .storage import MIME_BY_FORMAT, duration_seconds, save_audio_bytes

logger = logging.getLogger("voice_gateway.omnivoice")


class OmniVoiceClientError(Exception):
    pass


class OmniVoiceClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.timeout = httpx.Timeout(settings.request_timeout_seconds)

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(f"{self.settings.omnivoice_base_url.rstrip('/')}/health")
                return response.status_code < 500
        except httpx.HTTPError:
            return False

    async def list_voices(self) -> dict:
        upstream_voices: dict[str, dict] = {}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(f"{self.settings.omnivoice_base_url.rstrip('/')}/v1/audio/voices")
                if response.status_code < 400:
                    payload = response.json()
                    upstream_voices = {
                        item.get("voice_id"): item
                        for item in payload.get("voices", [])
                        if isinstance(item, dict) and item.get("voice_id")
                    }
                else:
                    logger.warning(
                        "Upstream voice list unavailable: status=%s url=%s",
                        response.status_code,
                        response.request.url if response.request else self.settings.omnivoice_base_url,
                    )
        except Exception as exc:
            logger.warning("Could not list upstream voices: %s", exc)

        voices = []
        for voice_id in self.settings.allowed_voice_ids:
            upstream_voice = upstream_voices.get(voice_id, {})
            voices.append(
                {
                    "voice_id": voice_id,
                    "name": upstream_voice.get("name") or voice_id,
                    "language": upstream_voice.get("language") or "zh-CN",
                    "description": upstream_voice.get("description") or "",
                    "enabled": True,
                }
            )

        return {"voices": voices, "engines": []}

    async def synthesize(self, request: TTSRequest, voice_id: str) -> dict:
        fmt = request.format
        filename = f"{uuid.uuid4().hex}.{fmt}"
        mime_type = MIME_BY_FORMAT.get(fmt, "application/octet-stream")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                if self.settings.prefer_generate_endpoint:
                    content, mime_type, filename = await self._synthesize_generate(client, request, voice_id, filename)
                else:
                    content, mime_type, filename = await self._synthesize_openai_compat(
                        client,
                        request,
                        voice_id,
                        filename,
                        mime_type,
                    )
            path = await save_audio_bytes(self.settings.media_dir, filename, content)
        except Exception as exc:
            if self.settings.mock_tts_when_omnivoice_unavailable:
                path = await self._write_mock_wav(filename=f"{Path(filename).stem}.wav")
                filename = path.name
                mime_type = "audio/wav"
            else:
                logger.exception("OmniVoice synthesis failed")
                raise OmniVoiceClientError("OmniVoice synthesis failed. Please check service health and model readiness.") from exc
        return {
            "filename": filename,
            "mime_type": mime_type,
            "duration_seconds": duration_seconds(path),
            "path": str(path),
        }

    async def _synthesize_openai_compat(
        self,
        client: httpx.AsyncClient,
        request: TTSRequest,
        voice_id: str,
        filename: str,
        mime_type: str,
    ) -> tuple[bytes, str, str]:
        payload = {
            "model": "omnivoice",
            "input": request.text,
            "voice": self._map_voice_id(voice_id),
            "response_format": request.format,
            "speed": request.speed,
            "language": self._map_language(request.language),
            "instruct": self._map_instruct(voice_id, request.emotion),
        }
        response = await client.post(
            f"{self.settings.omnivoice_base_url.rstrip('/')}/v1/audio/speech",
            json=payload,
        )
        if response.status_code in {404, 405}:
            return await self._synthesize_generate(client, request, voice_id, filename)
        response.raise_for_status()
        content = response.content
        mime_type = response.headers.get("content-type", mime_type).split(";")[0]
        disposition = response.headers.get("content-disposition", "")
        if "filename=" in disposition and "." in disposition:
            upstream_ext = disposition.rsplit(".", 1)[-1].strip("\"'")
            if upstream_ext and upstream_ext != request.format:
                filename = f"{Path(filename).stem}.{upstream_ext}"
        return content, mime_type, filename

    async def _synthesize_generate(
        self,
        client: httpx.AsyncClient,
        request: TTSRequest,
        voice_id: str,
        filename: str,
    ) -> tuple[bytes, str, str]:
        upstream_voice = self._map_voice_id(voice_id)
        data = {
            "text": request.text,
            "language": self._map_language(request.language),
            "instruct": self._map_instruct(voice_id, request.emotion),
            "speed": str(request.speed),
        }
        if upstream_voice and upstream_voice != "default":
            data["profile_id"] = upstream_voice
        response = await client.post(
            f"{self.settings.omnivoice_base_url.rstrip('/')}/generate",
            data=data,
        )
        response.raise_for_status()
        generated_name = response.headers.get("x-audio-path")
        if generated_name and "." in generated_name:
            filename = f"{Path(filename).stem}{Path(generated_name).suffix}"
        else:
            filename = f"{Path(filename).stem}.wav"
        mime_type = response.headers.get("content-type", "audio/wav").split(";")[0]
        return response.content, mime_type, filename

    async def clone_voice(self, *, speaker_name: str, audio_bytes: bytes, suffix: str = ".wav", ref_text: str = "") -> dict:
        files = {"ref_audio": (f"reference{suffix}", audio_bytes, "audio/wav")}
        data = {
            "name": speaker_name,
            "ref_text": ref_text,
            "language": "Auto",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.settings.omnivoice_base_url.rstrip('/')}/profiles",
                    data=data,
                    files=files,
                )
                response.raise_for_status()
                return response.json()
        except Exception as exc:
            logger.exception("OmniVoice clone profile creation failed")
            raise OmniVoiceClientError("Voice clone failed. Please check OmniVoice profile API.") from exc

    async def clone_voice_from_base64(self, *, speaker_name: str, base64_audio: str) -> dict:
        try:
            audio_bytes = base64.b64decode(base64_audio, validate=True)
        except Exception as exc:
            raise OmniVoiceClientError("base64_audio is invalid.") from exc
        return await self.clone_voice(speaker_name=speaker_name, audio_bytes=audio_bytes)

    def _map_voice_id(self, voice_id: str) -> str:
        return self.settings.voice_id_aliases.get(voice_id, voice_id)

    def _map_language(self, language: str | None) -> str:
        if not language:
            return "zh"
        normalized = language.strip().lower()
        if normalized in {"zh-cn", "zh_hans", "zh-hans", "chinese", "中文"}:
            return "zh"
        if "-" in normalized:
            return normalized.split("-", 1)[0]
        return normalized

    def _map_instruct(self, voice_id: str, emotion: str | None) -> str:
        allowed_items = {
            "东北话", "中年", "中音调", "云南话", "低音调", "儿童", "四川话", "女", "宁夏话",
            "少年", "极低音调", "极高音调", "桂林话", "河南话", "济南话", "甘肃话", "男",
            "石家庄话", "老年", "耳语", "贵州话", "陕西话", "青岛话", "青年", "高音调",
            "american accent", "australian accent", "british accent", "canadian accent", "child",
            "chinese accent", "elderly", "female", "high pitch", "indian accent", "japanese accent",
            "korean accent", "low pitch", "male", "middle-aged", "moderate pitch", "portuguese accent",
            "russian accent", "teenager", "very high pitch", "very low pitch", "whisper", "young adult",
        }
        default = "男，青年，中音调" if "male" in voice_id else "女，青年，中音调"
        if not emotion:
            return default
        raw = emotion.strip()
        if raw in {"friendly", "亲切", "亲切、鼓励、像老师面对面讲评", "encouraging"}:
            return default
        separator = "，" if "，" in raw or "、" in raw else ", "
        parts = [part.strip() for part in raw.replace("、", "，").replace(",", "，").split("，") if part.strip()]
        if parts and all(part in allowed_items for part in parts):
            return ("，" if any(ord(ch) > 127 for ch in raw) else separator).join(parts)
        return default

    async def _write_mock_wav(self, filename: str) -> Path:
        path = self.settings.media_dir / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        sample_rate = 16000
        frames = sample_rate // 5
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(b"\x00\x00" * frames)
        return path
