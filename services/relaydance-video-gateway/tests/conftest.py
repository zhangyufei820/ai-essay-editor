import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings


@pytest.fixture(autouse=True)
def test_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RELAYDANCE_BASE_URL", "https://provider.test")
    monkeypatch.setenv("RELAYDANCE_API_TOKEN", "test-token")
    monkeypatch.setenv("GATEWAY_API_KEY", "gateway-secret")
    monkeypatch.setenv("REQUEST_TIMEOUT_SECONDS", "5")
    monkeypatch.setenv("STRICT_MODEL_VALIDATION", "true")
    monkeypatch.setenv("ENABLE_LAST_FRAME", "false")
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
def provider_base() -> str:
    return os.environ["RELAYDANCE_BASE_URL"]
