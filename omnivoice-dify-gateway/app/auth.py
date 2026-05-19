import secrets

from fastapi import Depends, Request, Security
from fastapi.security import APIKeyHeader

from .config import Settings, get_settings
from .safety import GatewayError

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(
    request: Request,
    x_api_key: str | None = Security(api_key_header),
    settings: Settings = Depends(get_settings),
) -> None:
    if settings.voice_gateway_api_key == "change-me":
        raise GatewayError(
            code="API_KEY_NOT_CONFIGURED",
            message="Voice gateway API key is not configured.",
            status_code=503,
        )
    if not x_api_key or not secrets.compare_digest(x_api_key, settings.voice_gateway_api_key):
        raise GatewayError(
            code="UNAUTHORIZED",
            message="Missing or invalid X-API-Key.",
            status_code=401,
        )
