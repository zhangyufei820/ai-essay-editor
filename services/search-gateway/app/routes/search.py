from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import ExtractRequest, GatewayResponse, SearchRequest
from app.search_client import SearchClient

router = APIRouter(prefix="/api/v1", tags=["search"])


def get_client(settings: Settings = Depends(get_settings)) -> SearchClient:
    return SearchClient(settings)


@router.post("/search", response_model=GatewayResponse)
async def search(request: SearchRequest, client: SearchClient = Depends(get_client)) -> GatewayResponse:
    return await client.search(request)


@router.post("/extract", response_model=GatewayResponse)
async def extract(request: ExtractRequest, client: SearchClient = Depends(get_client)) -> GatewayResponse:
    return await client.extract(request)
