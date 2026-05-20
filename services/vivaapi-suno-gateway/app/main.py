import logging
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.routes.callback import router as callback_router
from app.routes.suno import router as suno_router
from app.schemas import GatewayResponse
from app.vivaapi_client import normalize_provider_response, redact

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("vivaapi_suno_gateway")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ViVaAPI Suno Music Gateway",
        version=get_settings().service_version,
        description="Secure typed HTTP gateway for Dify to call ViVaAPI Suno endpoints without exposing provider tokens.",
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
                provider_code="gateway_error",
                message="Internal gateway error",
                error={"code": "gateway_error", "message": "Internal gateway error"},
            )
            return JSONResponse(status_code=500, content=jsonable_encoder(payload))

    async def require_gateway_key(
        x_gateway_key: Annotated[str | None, Header(alias="X-Gateway-Key")] = None,
        settings: Settings = Depends(get_settings),
    ) -> None:
        if not settings.gateway_api_key:
            raise HTTPException(status_code=503, detail="GATEWAY_API_KEY is not configured")
        if x_gateway_key != settings.gateway_api_key:
            raise HTTPException(status_code=401, detail="gateway unauthorized")

    protected_dependencies = [Depends(require_gateway_key)]
    app.include_router(suno_router, dependencies=protected_dependencies)
    app.include_router(callback_router, dependencies=protected_dependencies)

    @app.get("/health", tags=["health"])
    async def health(settings: Settings = Depends(get_settings)) -> dict[str, object]:
        return {
            "success": True,
            "service": "suno-gateway",
            "version": settings.service_version,
            "viva_base_url": settings.viva_base_url,
        }

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        payload = GatewayResponse(
            success=False,
            status_code=exc.status_code,
            provider_code="gateway_error",
            message=str(exc.detail),
            error={"code": "gateway_error", "message": str(exc.detail)},
        )
        return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(payload))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        payload = GatewayResponse(
            success=False,
            status_code=422,
            provider_code="validation_error",
            message="Request validation failed",
            error={"code": "validation_error", "details": exc.errors()},
        )
        return JSONResponse(status_code=422, content=jsonable_encoder(payload))

    @app.exception_handler(ValueError)
    async def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
        payload = normalize_provider_response(
            {"message": str(exc)},
            422,
            error={"code": "validation_error", "message": str(exc)},
        )
        payload.success = False
        payload.provider_code = "validation_error"
        return JSONResponse(status_code=422, content=jsonable_encoder(payload))

    return app


app = create_app()
