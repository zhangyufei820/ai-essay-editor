import asyncio
import ipaddress
import json
import logging
import numbers
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import Settings, get_settings
from app.schemas import ExtractRequest, GatewayResponse, SearchRequest, SearchResult

logger = logging.getLogger("search_gateway")

SENSITIVE_KEYS = {
    "authorization",
    "token",
    "api_key",
    "apikey",
    "x-gateway-key",
    "x-subscription-token",
    "tavily_api_key",
    "brave_api_key",
}

RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


def redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): "[REDACTED]" if str(key).lower() in SENSITIVE_KEYS else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def public_body(model: Any) -> dict[str, Any]:
    return model.model_dump(exclude_none=True) if hasattr(model, "model_dump") else dict(model)


def message_from_payload(payload: Any) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(error, str):
            return error
        for key in ("message", "msg", "detail", "error_message"):
            value = payload.get(key)
            if isinstance(value, str):
                return value
    return ""


def provider_code_from_payload(payload: Any, status_code: int) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("code") is not None:
            return str(error.get("code"))
        for key in ("code", "provider_code", "status_code", "status"):
            value = payload.get(key)
            if value is not None:
                return str(value)
    return "success" if 200 <= status_code < 300 else "provider_error"


def public_provider_code(code: str, status_code: int) -> str:
    text = str(code or "").lower()
    if 200 <= status_code < 300:
        return "success"
    if "validation" in text:
        return "validation_error"
    if status_code in {408, 504, 524} or "timeout" in text:
        return "search_service_timeout"
    return "search_service_unavailable"


def normalize_error_response(
    *,
    provider: str,
    status_code: int,
    payload: Any,
    error_code: str = "provider_error",
    warnings: list[str] | None = None,
) -> GatewayResponse:
    code = public_provider_code(provider_code_from_payload(payload, status_code) or error_code, status_code)
    return GatewayResponse(
        success=False,
        status_code=status_code,
        provider_code=code,
        message="搜索服务暂时不可用，请稍后重试。",
        provider="search",
        data=None,
        provider_response={},
        warnings=warnings or [],
        error={"code": code, "message": "搜索服务暂时不可用，请稍后重试。"},
    )


def tavily_results(payload: dict[str, Any]) -> list[SearchResult]:
    results = payload.get("results")
    if not isinstance(results, list):
        return []
    normalized: list[SearchResult] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        score = item.get("score")
        normalized.append(
            SearchResult(
                title=str(item.get("title") or "").strip() or "Untitled result",
                url=url,
                snippet=str(item.get("content") or item.get("snippet") or "").strip(),
                source="web",
                published_at=str(item.get("published_date") or "").strip() or None,
                score=float(score) if isinstance(score, numbers.Real) else None,
                raw_content=str(item.get("raw_content") or "").strip() or None,
            )
        )
    return normalized


def brave_results(payload: dict[str, Any]) -> list[SearchResult]:
    web = payload.get("web")
    items = web.get("results") if isinstance(web, dict) else None
    if not isinstance(items, list):
        return []
    normalized: list[SearchResult] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        extra_snippets = item.get("extra_snippets")
        description = str(item.get("description") or "").strip()
        if isinstance(extra_snippets, list) and extra_snippets:
            description = " ".join(str(snippet).strip() for snippet in extra_snippets if str(snippet).strip()) or description
        normalized.append(
            SearchResult(
                title=str(item.get("title") or "").strip() or "Untitled result",
                url=url,
                snippet=description,
                source="web",
                published_at=str(item.get("age") or "").strip() or None,
            )
        )
    return normalized


def extract_results(payload: dict[str, Any]) -> list[SearchResult]:
    results = payload.get("results")
    if not isinstance(results, list):
        return []
    normalized: list[SearchResult] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        raw_content = str(item.get("raw_content") or item.get("content") or "").strip()
        normalized.append(
            SearchResult(
                title=str(item.get("title") or "").strip() or "Extracted page",
                url=url,
                snippet=raw_content[:500],
                source="web",
                raw_content=raw_content or None,
            )
        )
    return normalized


def normalize_search_response(
    *,
    provider: str,
    request: SearchRequest,
    payload: Any,
    status_code: int,
    warnings: list[str] | None = None,
) -> GatewayResponse:
    if not (200 <= status_code < 300):
        return normalize_error_response(provider=provider, status_code=status_code, payload=payload, warnings=warnings)

    provider_response = payload if isinstance(payload, dict) else {"raw": payload}
    results = tavily_results(provider_response) if provider == "tavily" else brave_results(provider_response)
    answer = ""
    if provider == "tavily":
        answer_value = provider_response.get("answer")
        answer = answer_value if isinstance(answer_value, str) else ""

    return GatewayResponse(
        success=True,
        status_code=status_code,
        provider_code=public_provider_code(provider_code_from_payload(payload, status_code), status_code),
        message="",
        provider="search",
        query=request.query,
        answer=answer,
        results=results,
        data={"answer": answer, "results": [result.model_dump(exclude_none=True) for result in results]},
        provider_response={},
        warnings=warnings or [],
        error=None,
    )


def is_public_http_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "0.0.0.0"} or hostname.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


class SearchClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def provider_candidates(self, requested_provider: str) -> list[str]:
        if requested_provider != "auto":
            return [requested_provider]
        if self.settings.search_provider != "auto":
            return [self.settings.search_provider]
        return self.settings.provider_order or ["tavily", "brave"]

    async def search(self, request: SearchRequest) -> GatewayResponse:
        warnings: list[str] = []
        candidates = self.provider_candidates(request.provider)
        configured = [provider for provider in candidates if self.settings.has_provider_key(provider)]

        if not configured:
            return GatewayResponse(
                success=False,
                status_code=503,
                provider_code="search_service_unavailable",
                message="搜索服务暂时不可用，请稍后重试。",
                provider="search",
                query=request.query,
                warnings=["搜索服务暂时不可用"],
                provider_response={},
                error={"code": "search_service_unavailable", "message": "搜索服务暂时不可用，请稍后重试。"},
            )

        last_error: GatewayResponse | None = None
        for provider in configured:
            result = await self._search_once(provider, request, warnings=warnings)
            if result.success:
                return result
            last_error = result
            if request.provider != "auto" or self.settings.search_provider != "auto":
                break
            warnings.append("搜索服务自动切换线路")

        if last_error is not None:
            last_error.warnings = warnings or last_error.warnings
            return last_error

        return GatewayResponse(
            success=False,
            status_code=503,
            provider_code="search_service_unavailable",
            message="搜索服务暂时不可用，请稍后重试。",
            provider="search",
            query=request.query,
            provider_response={},
            error={"code": "search_service_unavailable", "message": "搜索服务暂时不可用，请稍后重试。"},
        )

    async def extract(self, request: ExtractRequest) -> GatewayResponse:
        invalid_urls = [url for url in request.urls if not is_public_http_url(url)]
        if invalid_urls:
            return GatewayResponse(
                success=False,
                status_code=422,
                provider_code="validation_error",
                message="只允许提取公开网页链接",
                provider="search",
                provider_response={},
                error={"code": "validation_error", "message": "只允许提取公开网页链接"},
            )
        if not self.settings.tavily_api_key.strip():
            return GatewayResponse(
                success=False,
                status_code=503,
                provider_code="search_service_unavailable",
                message="搜索服务暂时不可用，请稍后重试。",
                provider="search",
                provider_response={},
                error={"code": "search_service_unavailable", "message": "搜索服务暂时不可用，请稍后重试。"},
            )
        try:
            payload = await self._post_json(
                f"{self.settings.tavily_base_url}/extract",
                headers=self._tavily_headers(),
                body=public_body(request),
                retry=True,
            )
        except httpx.HTTPError as exc:
            logger.warning("tavily extract request failed: %s", redact({"error": str(exc)}))
            return normalize_error_response(
                provider="tavily",
                status_code=502,
                payload={"provider_error_text": str(exc)},
                error_code="provider_request_failed",
            )

        provider_response = payload["body"] if isinstance(payload["body"], dict) else {"raw": payload["body"]}
        success = 200 <= payload["status_code"] < 300
        results = extract_results(provider_response)
        return GatewayResponse(
            success=success,
            status_code=payload["status_code"],
            provider_code=public_provider_code(provider_code_from_payload(provider_response, payload["status_code"]), payload["status_code"]),
            message="",
            provider="search",
            results=results,
            data={"results": [result.model_dump(exclude_none=True) for result in results]},
            provider_response={},
            error=None if success else {"code": "search_service_unavailable", "message": "搜索服务暂时不可用，请稍后重试。"},
        )

    async def _search_once(
        self,
        provider: str,
        request: SearchRequest,
        *,
        warnings: list[str],
    ) -> GatewayResponse:
        try:
            if provider == "tavily":
                payload = await self._tavily_search(request)
            elif provider == "brave":
                payload = await self._brave_search(request)
            else:
                return normalize_error_response(
                    provider=provider,
                    status_code=422,
                    payload={"message": f"Unsupported search provider: {provider}"},
                    error_code="unsupported_provider",
                )
        except httpx.HTTPError as exc:
            logger.warning("search provider request failed: %s", redact({"provider": provider, "error": str(exc)}))
            return normalize_error_response(
                provider=provider,
                status_code=502,
                payload={"provider_error_text": str(exc)},
                error_code="provider_request_failed",
                warnings=warnings,
            )
        return normalize_search_response(
            provider=provider,
            request=request,
            payload=payload["body"],
            status_code=payload["status_code"],
            warnings=warnings,
        )

    async def _tavily_search(self, request: SearchRequest) -> dict[str, Any]:
        body = {
            "query": request.query,
            "max_results": request.max_results,
            "search_depth": request.search_depth,
            "include_answer": request.include_answer,
            "include_raw_content": request.include_raw_content,
        }
        return await self._post_json(
            f"{self.settings.tavily_base_url}/search",
            headers=self._tavily_headers(),
            body=body,
            retry=True,
        )

    async def _brave_search(self, request: SearchRequest) -> dict[str, Any]:
        return await self._get_json(
            f"{self.settings.brave_base_url}/web/search",
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": self.settings.brave_api_key,
            },
            params={
                "q": request.query,
                "count": request.max_results,
                "safesearch": "moderate",
            },
            retry=True,
        )

    def _tavily_headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.settings.tavily_api_key}",
        }

    async def _post_json(
        self,
        url: str,
        *,
        headers: dict[str, str],
        body: dict[str, Any],
        retry: bool = False,
    ) -> dict[str, Any]:
        attempts = 3 if retry else 1
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                    response = await client.post(url, headers=headers, json=body)
                if response.status_code in RETRY_STATUS_CODES and attempt < attempts - 1:
                    await asyncio.sleep(min(0.5 * (2**attempt), 5))
                    continue
                return {"status_code": response.status_code, "body": self._response_payload(response)}
            except httpx.HTTPError:
                if attempt < attempts - 1:
                    await asyncio.sleep(min(0.5 * (2**attempt), 5))
                    continue
                raise
        raise httpx.HTTPError("unknown provider request failure")

    async def _get_json(
        self,
        url: str,
        *,
        headers: dict[str, str],
        params: dict[str, Any],
        retry: bool = False,
    ) -> dict[str, Any]:
        attempts = 3 if retry else 1
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                    response = await client.get(url, headers=headers, params=params)
                if response.status_code in RETRY_STATUS_CODES and attempt < attempts - 1:
                    await asyncio.sleep(min(0.5 * (2**attempt), 5))
                    continue
                return {"status_code": response.status_code, "body": self._response_payload(response)}
            except httpx.HTTPError:
                if attempt < attempts - 1:
                    await asyncio.sleep(min(0.5 * (2**attempt), 5))
                    continue
                raise
        raise httpx.HTTPError("unknown provider request failure")

    def _response_payload(self, response: httpx.Response) -> Any:
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return response.json()
        text = response.text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"provider_error_text" if response.is_error else "text": text}
