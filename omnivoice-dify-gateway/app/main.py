import logging
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .auth import require_api_key
from .config import Settings, get_settings
from .jobs import JobRecord, get_job_queue, init_job_queue
from .logging_config import configure_logging, request_logging_middleware
from .omnivoice_client import OmniVoiceClient, OmniVoiceClientError
from .rate_limit import WindowLimit, client_ip, limiter
from .safety import (
    GatewayError,
    request_id,
    validate_public_audio_url,
    validate_text_length,
    validate_voice_id,
    write_audit_log,
)
from .schemas import (
    EssayCommentaryRequest,
    EssayCommentaryResponse,
    HealthResponse,
    JobResponse,
    JobStatus,
    TTSQueuedResponse,
    TTSRequest,
    TTSResultResponse,
    VoiceCloneRequest,
    VoiceCloneResponse,
    VoiceInfo,
    VoicesResponse,
)
from .storage import mime_type_for, public_url, safe_media_path

configure_logging()
logger = logging.getLogger("voice_gateway")


app = FastAPI(
    title="Shenxiang OmniVoice Dify Gateway",
    version=get_settings().version,
    description="Dify-friendly JSON gateway for OmniVoice Studio speech generation.",
)


@app.on_event("startup")
async def startup() -> None:
    settings = get_settings()
    init_job_queue(settings.max_concurrent_jobs, settings.jobs_jsonl_path)


settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["X-API-Key", "Content-Type", "X-Request-ID"],
)
app.middleware("http")(request_logging_middleware)


@app.exception_handler(GatewayError)
async def gateway_error_handler(request: Request, exc: GatewayError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "request_id": request_id(request)}},
    )


@app.exception_handler(OmniVoiceClientError)
async def omnivoice_error_handler(request: Request, exc: OmniVoiceClientError):
    return JSONResponse(
        status_code=502,
        content={"error": {"code": "OMNIVOICE_ERROR", "message": str(exc), "request_id": request_id(request)}},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    logger.exception("unhandled error")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error.", "request_id": request_id(request)}},
    )


def _client(settings: Settings = Depends(get_settings)) -> OmniVoiceClient:
    return OmniVoiceClient(settings)


@app.get("/healthz", response_model=HealthResponse, operation_id="healthCheck")
async def healthz(settings: Settings = Depends(get_settings), client: OmniVoiceClient = Depends(_client)):
    upstream = "ok" if await client.health() else "unreachable"
    return {
        "status": "ok",
        "gateway": "ok",
        "omnivoice": upstream,
        "version": settings.version,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/v1/voices", response_model=VoicesResponse, operation_id="listVoices", dependencies=[Depends(require_api_key)])
async def list_voices(settings: Settings = Depends(get_settings), client: OmniVoiceClient = Depends(_client)):
    upstream = await client.list_voices()
    upstream_by_id = {
        item.get("voice_id"): item
        for item in upstream.get("voices", [])
        if isinstance(item, dict) and item.get("voice_id")
    }
    labels = {
        "teacher_female_01": ("沈翔智学女老师", "适合作文讲评、学习讲解"),
        "teacher_male_01": ("沈翔智学男老师", "适合课堂讲解、知识点复盘"),
        "default": ("OmniVoice 默认音色", "OmniVoice 当前默认音色或引擎预设"),
    }
    voices: list[VoiceInfo] = []
    for voice_id in settings.allowed_voice_ids:
        upstream_voice = upstream_by_id.get(voice_id, {})
        name, desc = labels.get(voice_id, (upstream_voice.get("name", voice_id), upstream_voice.get("description", "")))
        voices.append(
            VoiceInfo(
                voice_id=voice_id,
                name=name,
                language=upstream_voice.get("language") or "zh-CN",
                description=desc,
                enabled=True,
            )
        )
    return {"voices": voices}


@app.post(
    "/v1/tts",
    response_model=TTSQueuedResponse | TTSResultResponse,
    operation_id="createTTS",
    dependencies=[Depends(require_api_key)],
)
async def create_tts(
    req: TTSRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    client: OmniVoiceClient = Depends(_client),
):
    _enforce_common_limits(req.text, req.voice_id or settings.default_voice_id, request, settings)
    voice_id = req.voice_id or settings.default_voice_id
    queue = get_job_queue()
    job = queue.create_job(voice_id=voice_id)

    async def handler(record: JobRecord) -> dict:
        result = await client.synthesize(req, voice_id=voice_id)
        result["audio_url"] = public_url(settings.public_base_url, result["filename"])
        return result

    if req.sync:
        completed = await queue.run_job(job, handler)
        if completed.status == JobStatus.failed:
            raise GatewayError("TTS_FAILED", completed.error or "TTS job failed.", 502)
        return _tts_result(completed, voice_id)

    queue.enqueue(job, handler)
    return {"job_id": job.job_id, "status": job.status, "message": "TTS job queued"}


@app.post(
    "/v1/essay-commentary",
    response_model=EssayCommentaryResponse,
    operation_id="createEssayCommentary",
    dependencies=[Depends(require_api_key)],
)
async def create_essay_commentary(
    req: EssayCommentaryRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    client: OmniVoiceClient = Depends(_client),
):
    commentary_text = build_commentary_text(req)
    voice_id = req.voice_id or settings.default_voice_id
    _enforce_common_limits(commentary_text, voice_id, request, settings)
    tts_req = TTSRequest(
        text=commentary_text,
        voice_id=voice_id,
        language="zh-CN",
        speed=1.0,
        emotion=req.style,
        format="mp3",
        sync=req.sync,
    )
    queue = get_job_queue()
    job = queue.create_job(voice_id=voice_id, commentary_text=commentary_text)

    async def handler(record: JobRecord) -> dict:
        result = await client.synthesize(tts_req, voice_id=voice_id)
        result["audio_url"] = public_url(settings.public_base_url, result["filename"])
        return result

    if req.sync:
        completed = await queue.run_job(job, handler)
        if completed.status == JobStatus.failed:
            raise GatewayError("COMMENTARY_TTS_FAILED", completed.error or "Commentary TTS job failed.", 502)
        return {
            "job_id": completed.job_id,
            "status": completed.status,
            "commentary_text": commentary_text,
            "audio_url": completed.audio_url,
            "filename": completed.filename,
        }

    queue.enqueue(job, handler)
    return {"job_id": job.job_id, "status": job.status, "commentary_text": commentary_text, "audio_url": None, "filename": None}


@app.get("/v1/jobs/{job_id}", response_model=JobResponse, operation_id="getJobStatus", dependencies=[Depends(require_api_key)])
async def get_job_status(job_id: str):
    job = get_job_queue().get(job_id)
    if not job:
        raise GatewayError("JOB_NOT_FOUND", "Job not found.", 404)
    return job


@app.post("/v1/voice-clone", response_model=VoiceCloneResponse, operation_id="cloneVoice", dependencies=[Depends(require_api_key)])
async def clone_voice(
    req: VoiceCloneRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    client: OmniVoiceClient = Depends(_client),
):
    limiter.check(f"clone:{client_ip(request)}", WindowLimit(settings.clone_rate_limit_per_hour, 3600))
    audit_payload = {
        "request_id": request_id(request),
        "client_ip": client_ip(request),
        "speaker_name": req.speaker_name,
        "intended_use": req.intended_use,
        "owner_contact": req.owner_contact,
        "consent_confirmed": req.consent_confirmed,
        "enabled": settings.enable_voice_clone,
    }
    write_audit_log(settings.audit_log_path, audit_payload)
    if not settings.enable_voice_clone:
        raise GatewayError("VOICE_CLONE_DISABLED", "Voice clone is disabled by administrator.", 403)
    if not req.consent_confirmed:
        raise GatewayError("CONSENT_REQUIRED", "Voice cloning requires consent_confirmed=true.", 400)
    if req.audio_url:
        validate_public_audio_url(str(req.audio_url))
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
            response = await http.get(str(req.audio_url))
            response.raise_for_status()
            result = await client.clone_voice(speaker_name=req.speaker_name, audio_bytes=response.content)
    else:
        result = await client.clone_voice_from_base64(speaker_name=req.speaker_name, base64_audio=req.base64_audio or "")
    voice_id = result.get("id") or result.get("voice_id")
    return {
        "voice_id": voice_id,
        "status": "pending_admin_review",
        "message": "Voice profile created but is not added to ALLOWED_VOICE_IDS until administrator approval.",
    }


@app.get("/media/{filename}", operation_id="getMedia")
async def get_media(filename: str, settings: Settings = Depends(get_settings)):
    return _media_response(filename, settings)


@app.head("/media/{filename}", include_in_schema=False)
async def head_media(filename: str, settings: Settings = Depends(get_settings)):
    return _media_response(filename, settings)


def _media_response(filename: str, settings: Settings) -> FileResponse:
    try:
        path = safe_media_path(settings.media_dir, filename)
    except ValueError as exc:
        raise GatewayError("MEDIA_NOT_FOUND", "Media not found.", 404) from exc
    if not path.exists() or not path.is_file():
        raise GatewayError("MEDIA_NOT_FOUND", "Media not found.", 404)
    return FileResponse(path, media_type=mime_type_for(filename), filename=filename)


def _enforce_common_limits(text: str, voice_id: str, request: Request, settings: Settings) -> None:
    limiter.check(f"api:{client_ip(request)}", WindowLimit(settings.rate_limit_per_minute, 60))
    validate_text_length(text, settings.max_text_chars)
    validate_voice_id(voice_id, settings.allowed_voice_ids)


def _tts_result(job: JobRecord, voice_id: str) -> TTSResultResponse:
    return TTSResultResponse(
        job_id=job.job_id,
        status=job.status,
        audio_url=job.audio_url,
        filename=job.filename,
        mime_type=job.mime_type,
        duration_seconds=job.duration_seconds,
        voice_id=voice_id,
    )


def build_commentary_text(req: EssayCommentaryRequest) -> str:
    title = req.essay_title.strip() or "这篇作文"
    report = _compress(req.grading_report, 2600)
    essay_hint = _compress(req.essay_text, 450)
    opening = f"同学你好，我是沈翔智学的 AI 老师。我们来讲评《{title}》。"
    grade = f"这是一篇{req.student_grade}作文，我会用{req.style}的方式，帮你抓住优点和下一步提升方向。"
    if essay_hint:
        focus = f"我先快速回顾一下作文的主要内容：{essay_hint}"
    else:
        focus = "我会根据批改报告，直接讲重点，不机械朗读全文。"
    body = f"下面是这次讲评的重点：{report}"
    ending = "最后给你一个小建议：修改时先抓一个最关键的问题，不要一次改太多。把开头、结尾和一处细节描写改扎实，作文就会明显更有力量。"
    return "\n".join([opening, grade, focus, body, ending])


def _compress(text: str, max_chars: int) -> str:
    text = " ".join((text or "").split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 12].rstrip() + "……"
