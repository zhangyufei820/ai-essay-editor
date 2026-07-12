import asyncio

import httpx
import pytest

from app.config import Settings
from app.new_api_client import NewApiAuthError, NewApiClient


def test_validate_bearer_token_accepts_only_new_api_authenticated_tokens() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"object": "list", "data": []})

    async def run() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            await NewApiClient(Settings()).validate_bearer_token("sk-valid-token-value", client=client)

    asyncio.run(run())

    assert len(requests) == 1
    assert requests[0].url == httpx.URL("https://api.aiphui.top/v1/models")
    assert requests[0].headers["Authorization"] == "Bearer sk-valid-token-value"


@pytest.mark.parametrize("status_code", [401, 403])
def test_validate_bearer_token_rejects_unknown_or_disabled_tokens(status_code: int) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={"error": {"message": "invalid token"}})

    async def run() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(NewApiAuthError, match="用户令牌无效或不可用"):
                await NewApiClient(Settings()).validate_bearer_token("sk-invalid-token-value", client=client)

    asyncio.run(run())
