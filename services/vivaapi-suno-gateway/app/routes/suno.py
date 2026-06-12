import json
import tempfile
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import Settings, get_settings
from app.schemas import (
    BatchFetchRequest,
    ClipActionRequest,
    EmptyBody,
    FullUploadCreateFields,
    GatewayResponse,
    GenerateCustomRequest,
    GenerateInspirationRequest,
    GenerateInstrumentalRequest,
    LyricsRequest,
    MusicCoverRequest,
    MusicCustomRequest,
    MusicExtendRequest,
    MusicInspirationRequest,
    MusicPersonaRequest,
    MusicUploadExtendRequest,
    RawRequest,
    UploadAuthorizeRequest,
    UploadFinishRequest,
)
from app.vivaapi_client import (
    VivaAPIClient,
    normalize_provider_response,
    poll_until_complete,
    public_body,
    validate_mv,
)

router = APIRouter(prefix="/api/v1/suno", tags=["suno"])


def get_client(settings: Settings = Depends(get_settings)) -> VivaAPIClient:
    return VivaAPIClient(settings)


async def provider_post(
    path: str,
    body: dict[str, Any],
    client: VivaAPIClient,
    *,
    retry_create: bool = False,
) -> GatewayResponse:
    validate_mv(body, client.settings)
    return await client.request("POST", path, json_body=body, retry=retry_create)


@router.post("/music/inspiration", response_model=GatewayResponse)
async def music_inspiration(
    request: MusicInspirationRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/music/custom", response_model=GatewayResponse)
async def music_custom(
    request: MusicCustomRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/music/extend", response_model=GatewayResponse)
async def music_extend(
    request: MusicExtendRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/music/persona", response_model=GatewayResponse)
async def music_persona(
    request: MusicPersonaRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/music/upload-extend", response_model=GatewayResponse)
async def music_upload_extend(
    request: MusicUploadExtendRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/music/cover", response_model=GatewayResponse)
async def music_cover(
    request: MusicCoverRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/music/stitch-submit", response_model=GatewayResponse)
async def music_stitch_submit(
    request: ClipActionRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await provider_post("/suno/submit/music", public_body(request), client, retry_create=retry_create)


@router.post("/lyrics", response_model=GatewayResponse)
async def lyrics(request: LyricsRequest, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("POST", "/suno/submit/lyrics", json_body=public_body(request))


@router.post("/concat", response_model=GatewayResponse)
async def concat(
    request: ClipActionRequest,
    retry_create: bool = False,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await client.request("POST", "/suno/submit/concat", json_body=public_body(request), retry=retry_create)


@router.post("/upload/authorize", response_model=GatewayResponse)
async def upload_authorize(
    request: UploadAuthorizeRequest,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await client.request("POST", "/suno/uploads/audio", json_body=public_body(request))


@router.post("/upload/{upload_id}/finish", response_model=GatewayResponse)
async def upload_finish(
    upload_id: str,
    request: UploadFinishRequest,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await client.request("POST", f"/suno/uploads/audio/{upload_id}/upload-finish", json_body=public_body(request))


@router.get("/upload/{upload_id}/status", response_model=GatewayResponse)
async def upload_status(upload_id: str, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("GET", f"/suno/uploads/audio/{upload_id}", retry=True)


@router.post("/upload/{upload_id}/initialize-clip", response_model=GatewayResponse)
async def upload_initialize_clip(
    upload_id: str,
    request: EmptyBody | None = None,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    _ = request
    return await client.request("POST", f"/suno/uploads/audio/{upload_id}/initialize-clip", json_body={})


async def save_upload_file(file: UploadFile, settings: Settings) -> Path:
    total = 0
    suffix = Path(file.filename or "upload.bin").suffix
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    path = Path(handle.name)
    try:
        with handle:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail=f"file too large, max {settings.max_upload_mb} MB")
                handle.write(chunk)
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise


def parse_fields_json(fields_json: str | None) -> dict[str, Any] | None:
    if not fields_json:
        return None
    try:
        parsed = json.loads(fields_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="fields_json must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="fields_json must be a JSON object")
    return parsed


@router.post("/upload/s3", response_model=GatewayResponse)
async def upload_s3(
    url: Annotated[str, Form()],
    fields_json: Annotated[str | None, Form()] = None,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    temp_path = await save_upload_file(file, settings)
    try:
        fields = parse_fields_json(fields_json)
        return await client.s3_upload(
            url=url,
            fields=fields,
            file_path=temp_path,
            filename=file.filename or "upload.bin",
            content_type=file.content_type,
        )
    finally:
        temp_path.unlink(missing_ok=True)


def infer_extension(filename: str | None, fallback: str | None = None) -> str:
    if fallback:
        return fallback.lstrip(".")
    suffix = Path(filename or "").suffix.lstrip(".")
    return suffix or "mp3"


def extract_s3_target(authorize_response: GatewayResponse) -> tuple[str, dict[str, Any] | None]:
    raw = authorize_response.provider_response
    data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    url = data.get("url") or data.get("upload_url") or data.get("uploadUrl") if isinstance(data, dict) else None
    fields = data.get("fields") if isinstance(data, dict) and isinstance(data.get("fields"), dict) else None
    if not url:
        raise HTTPException(status_code=502, detail="音乐服务暂时不可用，请稍后重试。")
    return str(url), fields


async def run_full_upload(
    *,
    file: UploadFile,
    extension: str | None,
    wait_complete: bool,
    poll_interval_seconds: float,
    poll_timeout_seconds: float,
    settings: Settings,
    client: VivaAPIClient,
) -> GatewayResponse:
    temp_path = await save_upload_file(file, settings)
    steps: dict[str, Any] = {}
    try:
        authorize = await client.request(
            "POST",
            "/suno/uploads/audio",
            json_body={"extension": infer_extension(file.filename, extension)},
        )
        steps["authorize"] = authorize.model_dump()
        if not authorize.success:
            return normalize_provider_response({"steps": steps}, authorize.status_code, error=authorize.error)

        upload_id = authorize.upload_id
        s3_url, fields = extract_s3_target(authorize)
        s3_response = await client.s3_upload(
            url=s3_url,
            fields=fields,
            file_path=temp_path,
            filename=file.filename or "upload.bin",
            content_type=file.content_type,
        )
        steps["s3_upload"] = s3_response.model_dump()
        if not s3_response.success:
            return normalize_provider_response({"steps": steps}, s3_response.status_code, error=s3_response.error)

        finish = await client.request(
            "POST",
            f"/suno/uploads/audio/{upload_id}/upload-finish",
            json_body={"upload_type": "file_upload", "upload_filename": file.filename or "upload.bin"},
        )
        steps["finish"] = finish.model_dump()
        if not finish.success:
            return normalize_provider_response({"steps": steps}, finish.status_code, error=finish.error)

        status_response = finish
        if wait_complete:
            status_response = await poll_until_complete(
                client,
                upload_id,
                interval_seconds=poll_interval_seconds,
                timeout_seconds=poll_timeout_seconds,
            )
            steps["status"] = status_response.model_dump()
            if not status_response.success:
                return normalize_provider_response({"steps": steps}, status_response.status_code, error=status_response.error)

        initialize = await client.request("POST", f"/suno/uploads/audio/{upload_id}/initialize-clip", json_body={})
        steps["initialize_clip"] = initialize.model_dump()
        result = normalize_provider_response({"steps": steps, "provider_response": initialize.provider_response}, initialize.status_code)
        result.upload_id = upload_id
        result.clip_id = initialize.clip_id
        result.status = status_response.status
        result.image_urls = list(dict.fromkeys(authorize.image_urls + status_response.image_urls + initialize.image_urls))
        result.provider_response = steps
        result.data = steps
        result.success = initialize.success
        result.error = initialize.error
        return result
    finally:
        temp_path.unlink(missing_ok=True)


@router.post("/upload/full", response_model=GatewayResponse)
async def upload_full(
    file: UploadFile = File(...),
    extension: Annotated[str | None, Form()] = None,
    wait_complete: Annotated[bool, Form()] = True,
    poll_interval_seconds: Annotated[float, Form()] = 3,
    poll_timeout_seconds: Annotated[float, Form()] = 180,
    settings: Settings = Depends(get_settings),
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await run_full_upload(
        file=file,
        extension=extension,
        wait_complete=wait_complete,
        poll_interval_seconds=poll_interval_seconds,
        poll_timeout_seconds=poll_timeout_seconds,
        settings=settings,
        client=client,
    )


@router.post("/upload/full-and-create", response_model=GatewayResponse)
async def upload_full_and_create(
    file: UploadFile = File(...),
    extension: Annotated[str | None, Form()] = None,
    prompt: Annotated[str, Form()] = "",
    title: Annotated[str, Form()] = "",
    tags: Annotated[str, Form()] = "",
    negative_tags: Annotated[str, Form()] = "",
    mv: Annotated[str, Form()] = "chirp-v4",
    continue_at: Annotated[float, Form()] = 10,
    task: Annotated[str, Form()] = "upload_extend",
    notify_hook: Annotated[str | None, Form()] = None,
    settings: Settings = Depends(get_settings),
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    upload_result = await run_full_upload(
        file=file,
        extension=extension,
        wait_complete=True,
        poll_interval_seconds=3,
        poll_timeout_seconds=settings.request_timeout_seconds,
        settings=settings,
        client=client,
    )
    if not upload_result.success:
        return upload_result
    fields = FullUploadCreateFields(
        prompt=prompt,
        title=title,
        tags=tags,
        negative_tags=negative_tags,
        mv=mv,
        continue_at=continue_at,
        task=task,
        notify_hook=notify_hook,
    ).model_dump(exclude_none=True)
    fields["continue_clip_id"] = upload_result.clip_id
    create = await provider_post("/suno/submit/music", fields, client)
    create.data = {"upload": upload_result.model_dump(), "create": create.data}
    create.provider_response = {"upload": upload_result.provider_response, "create": create.provider_response}
    create.upload_id = upload_result.upload_id
    return create


@router.post("/generate/inspiration", response_model=GatewayResponse)
async def generate_inspiration(
    request: GenerateInspirationRequest,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    return await client.request("POST", "/suno/generate", json_body=public_body(request))


@router.post("/generate/custom", response_model=GatewayResponse)
async def generate_custom(
    request: GenerateCustomRequest,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    body = public_body(request)
    validate_mv(body, client.settings)
    return await client.request("POST", "/suno/generate", json_body=body)


@router.post("/generate/instrumental", response_model=GatewayResponse)
async def generate_instrumental(
    request: GenerateInstrumentalRequest,
    client: VivaAPIClient = Depends(get_client),
) -> GatewayResponse:
    body = public_body(request)
    validate_mv(body, client.settings)
    return await client.request("POST", "/suno/generate", json_body=body)


@router.post("/tasks/batch", response_model=GatewayResponse)
async def tasks_batch(request: BatchFetchRequest, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("POST", "/suno/fetch", json_body=public_body(request))


@router.get("/tasks/{task_id}", response_model=GatewayResponse)
async def task_one(task_id: str, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("GET", f"/suno/fetch/{task_id}", retry=True)


@router.get("/clips/{clip_id}/wav", response_model=GatewayResponse)
async def clip_wav(clip_id: str, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("GET", f"/suno/act/wav/{clip_id}", retry=True)


@router.get("/timing/{id}", response_model=GatewayResponse)
async def timing(id: str, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("GET", f"/suno/act/timing/{id}", retry=True)


@router.get("/feed/{id}", response_model=GatewayResponse)
async def feed(id: str, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    return await client.request("GET", f"/suno/feed/{id}", retry=True)


@router.post("/raw", response_model=GatewayResponse)
async def raw(request: RawRequest, client: VivaAPIClient = Depends(get_client)) -> GatewayResponse:
    if request.method.value == "GET":
        return await client.request("GET", request.path, query=request.query or {}, retry=True)
    return await client.request("POST", request.path, json_body=request.body or {})
