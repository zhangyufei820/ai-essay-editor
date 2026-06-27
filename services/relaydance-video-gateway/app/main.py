import logging
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.relaydance_client import normalize_provider_response, redact
from app.routes.video import compat_router as video_compat_router
from app.routes.video import router as video_router
from app.schemas import GatewayResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("relaydance_video_gateway")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Shenxiang Video Gateway",
        version=get_settings().service_version,
        description="Secure HTTP gateway for video generation.",
    )

    @app.middleware("http")
    async def log_errors(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.exception(
                "unhandled request error: %s",
                redact({"path": request.url.path, "headers": dict(request.headers), "error": str(exc)}),
            )
            payload = GatewayResponse(
                success=False,
                status_code=500,
                provider_code="service_error",
                message="服务暂时不可用，请稍后重试。",
                error={"code": "service_error", "message": "服务暂时不可用，请稍后重试。"},
            )
            return JSONResponse(status_code=500, content=jsonable_encoder(payload))

    async def require_gateway_key(
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
        x_gateway_key: Annotated[str | None, Header(alias="X-Gateway-Key")] = None,
        settings: Settings = Depends(get_settings),
    ) -> None:
        if not settings.gateway_api_key:
            raise HTTPException(status_code=503, detail="服务暂时不可用，请稍后重试。")
        bearer_key = ""
        if authorization:
            scheme, _, value = authorization.partition(" ")
            if scheme.lower() == "bearer":
                bearer_key = value.strip()
        if x_gateway_key != settings.gateway_api_key and bearer_key != settings.gateway_api_key:
            raise HTTPException(status_code=401, detail="未授权")

    app.include_router(video_router, dependencies=[Depends(require_gateway_key)])
    app.include_router(video_compat_router, dependencies=[Depends(require_gateway_key)])

    @app.get("/health", tags=["health"])
    async def health(settings: Settings = Depends(get_settings)) -> dict[str, object]:
            return {
                "success": True,
                "service": "video-gateway",
                "version": settings.service_version,
                "video_configured": bool(settings.relaydance_authorization),
            }

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        payload = GatewayResponse(
            success=False,
            status_code=exc.status_code,
            provider_code="service_error" if exc.status_code >= 500 else "request_error",
            message=str(exc.detail),
            error={"code": "service_error" if exc.status_code >= 500 else "request_error", "message": str(exc.detail)},
        )
        return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(payload))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        payload = GatewayResponse(
            success=False,
            status_code=422,
            provider_code="validation_error",
            message="参数格式错误，请检查后重试。",
            error={"code": "validation_error", "message": "参数格式错误，请检查后重试。"},
        )
        return JSONResponse(status_code=422, content=jsonable_encoder(payload))

    @app.exception_handler(ValueError)
    async def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
        payload = normalize_provider_response(
            {"message": "参数格式错误，请检查后重试。"},
            422,
            error={"code": "validation_error", "message": "参数格式错误，请检查后重试。"},
        )
        payload.success = False
        payload.provider_code = "validation_error"
        payload.message = "参数格式错误，请检查后重试。"
        return JSONResponse(status_code=422, content=jsonable_encoder(payload))

    return app


app = create_app()
