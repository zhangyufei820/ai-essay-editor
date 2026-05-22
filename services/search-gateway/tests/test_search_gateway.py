import json

import respx
from httpx import Response

from app.config import get_settings


def test_missing_gateway_key_returns_401(client):
    response = client.post("/api/v1/search", json={"query": "test"})

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["message"] == "gateway unauthorized"


@respx.mock
def test_tavily_search_normalizes_results(client, auth_headers, tavily_base):
    route = respx.post(f"{tavily_base}/search").mock(
        return_value=Response(
            200,
            json={
                "answer": "short answer",
                "results": [
                    {
                        "title": "Result A",
                        "url": "https://example.com/a",
                        "content": "Useful snippet",
                        "score": 0.91,
                    }
                ],
            },
        ),
    )

    response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={"query": "AI writing education", "max_results": 3, "include_answer": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["provider"] == "tavily"
    assert body["answer"] == "short answer"
    assert body["results"][0]["url"] == "https://example.com/a"
    assert route.calls.last.request.headers["Authorization"] == "Bearer tavily-token"
    sent = json.loads(route.calls.last.request.content)
    assert sent["max_results"] == 3
    assert sent["include_answer"] is True


@respx.mock
def test_auto_falls_back_to_brave_when_tavily_fails(client, auth_headers, tavily_base, brave_base):
    respx.post(f"{tavily_base}/search").mock(return_value=Response(503, json={"message": "down"}))
    brave_route = respx.get(f"{brave_base}/web/search").mock(
        return_value=Response(
            200,
            json={
                "web": {
                    "results": [
                        {
                            "title": "Brave Result",
                            "url": "https://example.com/brave",
                            "description": "Brave snippet",
                        }
                    ]
                }
            },
        ),
    )

    response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={"query": "fallback search", "max_results": 2},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["provider"] == "brave"
    assert body["results"][0]["source"] == "brave"
    assert "X-Subscription-Token" in brave_route.calls.last.request.headers
    assert "tavily failed" in body["warnings"][0]


@respx.mock
def test_brave_search_can_be_requested_directly(client, auth_headers, brave_base):
    route = respx.get(f"{brave_base}/web/search").mock(
        return_value=Response(
            200,
            json={
                "web": {
                    "results": [
                        {
                            "title": "Direct Brave Result",
                            "url": "https://example.com/direct",
                            "extra_snippets": ["snippet one", "snippet two"],
                        }
                    ]
                }
            },
        ),
    )

    response = client.post(
        "/api/v1/search",
        headers=auth_headers,
        json={"query": "direct", "provider": "brave", "max_results": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "brave"
    assert body["results"][0]["snippet"] == "snippet one snippet two"
    assert route.calls.last.request.url.params["q"] == "direct"


def test_returns_503_when_no_provider_is_configured(client, auth_headers, monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "")
    monkeypatch.setenv("BRAVE_API_KEY", "")
    get_settings.cache_clear()

    response = client.post("/api/v1/search", headers=auth_headers, json={"query": "test"})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["status_code"] == 503
    assert body["provider_code"] == "search_provider_not_configured"


@respx.mock
def test_extract_uses_tavily_and_blocks_private_urls(client, auth_headers, tavily_base):
    route = respx.post(f"{tavily_base}/extract").mock(
        return_value=Response(
            200,
            json={"results": [{"url": "https://example.com/page", "raw_content": "content"}]},
        ),
    )

    ok = client.post(
        "/api/v1/extract",
        headers=auth_headers,
        json={"urls": ["https://example.com/page"]},
    )
    blocked = client.post(
        "/api/v1/extract",
        headers=auth_headers,
        json={"urls": ["http://127.0.0.1:3000/admin"]},
    )

    assert ok.status_code == 200
    assert ok.json()["success"] is True
    assert route.called
    assert blocked.status_code == 200
    assert blocked.json()["success"] is False
    assert blocked.json()["status_code"] == 422
