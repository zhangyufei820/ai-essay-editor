import logging
from collections import deque
from typing import Any

from fastapi import APIRouter, Request

from app.vivaapi_client import redact

router = APIRouter(prefix="/api/v1/suno", tags=["callbacks"])
logger = logging.getLogger("vivaapi_suno_gateway.callback")

RECENT_CALLBACKS: deque[dict[str, Any]] = deque(maxlen=100)


@router.post("/callback", summary="Receive ViVaAPI notify_hook callbacks")
async def receive_callback(request: Request) -> dict[str, bool]:
    payload = await request.json()
    RECENT_CALLBACKS.append(payload)
    logger.info("received suno callback: %s", redact(payload))
    return {"success": True}


@router.get("/callbacks/recent", summary="List recent callbacks")
async def recent_callbacks() -> dict[str, Any]:
    return {"success": True, "callbacks": list(RECENT_CALLBACKS)}
