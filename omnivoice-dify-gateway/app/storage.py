import mimetypes
import os
import wave
from pathlib import Path

import aiofiles


MIME_BY_FORMAT = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "flac": "audio/flac",
    "opus": "audio/ogg",
}


def safe_media_path(media_dir: Path, filename: str) -> Path:
    base = os.path.basename(filename)
    if base != filename:
        raise ValueError("invalid filename")
    candidate = (media_dir / base).resolve()
    media_root = media_dir.resolve()
    if media_root not in candidate.parents and candidate != media_root:
        raise ValueError("invalid filename")
    return candidate


async def save_audio_bytes(media_dir: Path, filename: str, content: bytes) -> Path:
    media_dir.mkdir(parents=True, exist_ok=True)
    path = safe_media_path(media_dir, filename)
    async with aiofiles.open(path, "wb") as handle:
        await handle.write(content)
    return path


def mime_type_for(filename: str, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


def duration_seconds(path: Path) -> float | None:
    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path), "rb") as wav:
                frames = wav.getnframes()
                rate = wav.getframerate()
                if rate:
                    return round(frames / float(rate), 2)
        except Exception:
            return None
    return None


def public_url(public_base_url: str, filename: str) -> str:
    return f"{public_base_url.rstrip('/')}/media/{filename}"

