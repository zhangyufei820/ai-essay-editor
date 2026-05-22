from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.config import Settings, get_settings
from app.relaydance_client import RelayDanceClient, public_body, validate_model
from app.schemas import (
    AssetCreateRequest,
    DifyVideoCreateRequest,
    GatewayResponse,
    GenerationMetadata,
    ImageUrl,
    RawRequest,
    UploadUrlRequest,
    VideoContentItem,
    VideoGenerationRequest,
)

router = APIRouter(prefix="/api/v1", tags=["video"])


def client_dep(settings: Settings = Depends(get_settings)) -> RelayDanceClient:
    return RelayDanceClient(settings)


def build_generation_from_dify(body: DifyVideoCreateRequest, settings: Settings) -> tuple[VideoGenerationRequest, list[str]]:
    warnings: list[str] = []
    content: list[VideoContentItem] = []
    if body.first_frame_url:
        content.append(VideoContentItem(image_url=ImageUrl(url=body.first_frame_url), role="first_frame"))
    if body.last_frame_url:
        if settings.enable_last_frame:
            content.append(VideoContentItem(image_url=ImageUrl(url=body.last_frame_url), role="last_frame"))
        else:
            warnings.append("last_frame_url was provided but RelayDance PDF does not document last_frame support; it was not forwarded")

    metadata = GenerationMetadata(
        ratio=body.ratio,
        resolution=body.resolution,
        generate_audio=body.generate_audio,
        watermark=body.watermark,
        content=content or None,
    )
    return VideoGenerationRequest(
        model=body.model,
        prompt=body.prompt,
        seconds=body.seconds,
        metadata=metadata,
    ), warnings


@router.post("/video/generations", response_model=GatewayResponse)
async def submit_generation(
    body: VideoGenerationRequest,
    client: RelayDanceClient = Depends(client_dep),
    settings: Settings = Depends(get_settings),
) -> GatewayResponse:
    validate_model(body.model, settings)
    return await client.request(
        "POST",
        "/v1/video/generations",
        json_body=public_body(body),
    )


@router.post("/video/create", response_model=GatewayResponse)
async def create_video(
    body: DifyVideoCreateRequest,
    client: RelayDanceClient = Depends(client_dep),
    settings: Settings = Depends(get_settings),
) -> GatewayResponse:
    generation, warnings = build_generation_from_dify(body, settings)
    validate_model(generation.model, settings)
    return await client.request(
        "POST",
        "/v1/video/generations",
        json_body=public_body(generation),
        warnings=warnings,
    )


@router.get("/videos/{task_id}", response_model=GatewayResponse)
async def get_video_task(
    task_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    return await client.request("GET", f"/v1/videos/{task_id}", retry=True)


@router.get("/videos/{task_id}/content")
async def get_video_content(
    task_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> Response:
    status_code, content_type, content, headers = await client.content(task_id)
    return Response(content=content, status_code=status_code, media_type=content_type, headers=headers)


@router.get("/upload-url", response_model=GatewayResponse)
async def get_upload_url(
    ext: str,
    md5: str,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    request = UploadUrlRequest(ext=ext, md5=md5)
    return await client.request(
        "GET",
        "/api/upload-url",
        query=public_body(request),
        base_url="https://pay.relaydance.com",
    )


@router.post("/assets/virtual/create", response_model=GatewayResponse)
async def create_asset(
    body: AssetCreateRequest,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    return await client.request(
        "POST",
        "/api/assets/virtual/create",
        json_body=public_body(body),
        base_url="https://pay.relaydance.com",
    )


@router.get("/assets/{asset_id}/status", response_model=GatewayResponse)
async def get_asset_status(
    asset_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    return await client.request(
        "GET",
        f"/api/assets/{asset_id}/status",
        base_url="https://pay.relaydance.com",
        retry=True,
    )


@router.post("/raw", response_model=GatewayResponse)
async def raw(
    body: RawRequest,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    base_url = "https://pay.relaydance.com" if body.path.startswith("/api/") else None
    return await client.request(
        body.method.value,
        body.path,
        json_body=body.body,
        query=body.query,
        base_url=base_url,
    )
