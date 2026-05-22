import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings


@pytest.fixture(autouse=True)
def test_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GATEWAY_API_KEY", "gateway-secret")
    monkeypatch.setenv("SEARCH_PROVIDER", "auto")
    monkeypatch.setenv("SEARCH_PROVIDER_ORDER", "tavily,brave")
    monkeypatch.setenv("REQUEST_TIMEOUT_SECONDS", "5")
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-token")
    monkeypatch.setenv("TAVILY_BASE_URL", "https://tavily.test")
    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setenv("BRAVE_BASE_URL", "https://brave.test/res/v1")
    monkeypatch.setenv("ENVIRONMENT", "test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    from app.main import create_app

    return TestClient(create_app())


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Gateway-Key": "gateway-secret"}


@pytest.fixture
def tavily_base() -> str:
    return os.environ["TAVILY_BASE_URL"]


@pytest.fixture
def brave_base() -> str:
    return os.environ["BRAVE_BASE_URL"]
