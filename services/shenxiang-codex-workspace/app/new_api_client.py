from __future__ import annotations

import json
import logging
import hashlib
from typing import Any

import httpx
from redis import Redis

from app.config import Settings, secret_values_for_redaction
from app.security import public_error_message, redact

logger = logging.getLogger(__name__)

class NewApiAuthError(RuntimeError):
    pass


class NewApiClient:
    def __init__(self, settings: Settings, redis_client: Redis | None = None) -> None:
        self.settings = settings
        self.redis = redis_client
        self.dashboard_base = settings.new_api_base_url.removesuffix("/v1")

    async def bootstrap_user(
        self,
        user_id: str,
        cookie_header: str,
    ) -> dict[str, Any]:
        requested_user_id = str(user_id or "").strip()
        if not requested_user_id:
            raise NewApiAuthError("缺少登录用户 ID，请先登录。")
        cache_key = self._user_bootstrap_cache_key(requested_user_id, cookie_header)
        cached = self._cache_get_json(cache_key)
        if cached:
            return cached
        headers = self._dashboard_headers(requested_user_id, cookie_header)
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0), follow_redirects=False) as client:
            self_payload = await self._get_json(client, "/api/user/self", headers)
            if not self_payload.get("success", False):
                raise NewApiAuthError(public_error_message(str(self_payload.get("message") or ""), "登录态无效，请重新登录。"))
            user = self_payload.get("data") or {}
            actual_user_id = str(user.get("id") or "")
            if actual_user_id and actual_user_id != requested_user_id:
                raise NewApiAuthError("登录身份不一致，请退出后重新登录。")
            token_keys = await self.ensure_mode_tokens(client, actual_user_id or requested_user_id, headers, user)
            token_key = token_keys["codex"]
        result = {
            "user": user,
            "api_key": token_key,
            "api_keys": token_keys,
            "key_hint": self._key_hint(token_key),
        }
        self._cache_set_json(cache_key, result, self.settings.user_bootstrap_cache_seconds)
        return result

    async def ensure_current_user_tokens(
        self,
        user_id: str,
        cookie_header: str,
    ) -> dict[str, Any]:
        requested_user_id = str(user_id or "").strip()
        if not requested_user_id:
            raise NewApiAuthError("缺少登录用户 ID，请先登录。")
        headers = self._dashboard_headers(requested_user_id, cookie_header)
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0), follow_redirects=False) as client:
            self_payload = await self._get_json(client, "/api/user/self", headers)
            if not self_payload.get("success", False):
                raise NewApiAuthError(public_error_message(str(self_payload.get("message") or ""), "登录态无效，请重新登录。"))
            user = self_payload.get("data") or {}
            actual_user_id = str(user.get("id") or "")
            if actual_user_id and actual_user_id != requested_user_id:
                raise NewApiAuthError("登录身份不一致，请退出后重新登录。")
            token_keys = await self.ensure_mode_tokens(client, actual_user_id or requested_user_id, headers, user)
        return {"user": user, "api_keys": token_keys}

    async def ensure_mode_tokens(
        self,
        client: httpx.AsyncClient,
        user_id: str,
        headers: dict[str, str],
        user: dict[str, Any],
    ) -> dict[str, str]:
        profiles = {
            "codex": (self.settings.auto_token_name, self.settings.codex_allowed_models),
            "claude": (self.settings.claude_token_name, self.settings.claude_allowed_models),
            "image": (self.settings.image_token_name, self.settings.image_allowed_models),
            "video": (self.settings.video_token_name, self.settings.video_allowed_models),
        }
        tokens = await self._list_tokens(client, headers)
        result: dict[str, str] = {}
        for mode, (name, models) in profiles.items():
            result[mode] = await self._ensure_named_token(client, user_id, headers, user, tokens, name, models)
        return result

    async def _ensure_codex_token(
        self,
        client: httpx.AsyncClient,
        user_id: str,
        headers: dict[str, str],
        user: dict[str, Any],
    ) -> str:
        return await self._ensure_named_token(
            client,
            user_id,
            headers,
            user,
            await self._list_tokens(client, headers),
            self.settings.auto_token_name,
            self.settings.codex_allowed_models,
        )

    async def _list_tokens(self, client: httpx.AsyncClient, headers: dict[str, str]) -> list[dict[str, Any]]:
        payload = await self._get_json(client, "/api/token/?p=1&size=100", headers)
        if not payload.get("success", False):
            return []
        data = payload.get("data") or {}
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return []
        return [item for item in items if isinstance(item, dict)]

    async def _ensure_named_token(
        self,
        client: httpx.AsyncClient,
        user_id: str,
        headers: dict[str, str],
        user: dict[str, Any],
        tokens: list[dict[str, Any]],
        token_name: str,
        models: tuple[str, ...],
    ) -> str:
        expected_models = ",".join(models)
        models_digest = hashlib.sha256(expected_models.encode("utf-8")).hexdigest()[:24]
        cache_key = f"codex:auto-token:{user_id}:{token_name}:{models_digest}"
        cached = self._cache_get(cache_key)
        if cached:
            return cached

        existing = self._find_existing_token(tokens, token_name, models)
        if existing:
            token_id = existing.get("id")
            await self._relax_existing_token_if_needed(client, headers, existing, user, token_name, models)
        else:
            token_id = await self._create_codex_token(client, headers, user, token_name, models)

        token_key = await self._fetch_token_key(client, headers, token_id)
        self._cache_set(cache_key, token_key)
        return token_key

    def _find_existing_token(
        self,
        tokens: list[dict[str, Any]],
        token_name: str,
        models: tuple[str, ...] | None = None,
    ) -> dict[str, Any] | None:
        candidates: list[dict[str, Any]] = []
        for item in tokens:
            if not isinstance(item, dict):
                continue
            if item.get("name") == token_name and int(item.get("status") or 0) == 1:
                candidates.append(item)
        if not candidates:
            return None

        expected_models = ",".join(models or ())

        def token_id(item: dict[str, Any]) -> int:
            try:
                return int(item.get("id") or 0)
            except (TypeError, ValueError):
                return 0

        if expected_models:
            exact = [
                item
                for item in candidates
                if item.get("model_limits_enabled")
                and str(item.get("model_limits") or "") == expected_models
            ]
            if exact:
                return max(exact, key=token_id)
        return max(candidates, key=token_id)

    async def _create_codex_token(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        user: dict[str, Any],
        token_name: str,
        models: tuple[str, ...],
    ) -> int:
        payload = {
            "name": token_name,
            "remain_quota": 0,
            "expired_time": -1,
            "unlimited_quota": True,
            "model_limits_enabled": True,
            "model_limits": ",".join(models),
            "allow_ips": "",
            "group": str(user.get("group") or ""),
            "cross_group_retry": True,
        }
        result = await self._post_json(client, "/api/token/", headers, payload)
        if not result.get("success", False):
            raise NewApiAuthError(public_error_message(str(result.get("message") or ""), "自动创建专用 Key 失败。"))
        existing = self._find_existing_token(await self._list_tokens(client, headers), token_name, models)
        if not existing or not existing.get("id"):
            raise NewApiAuthError("自动创建专用 Key 后未能读取令牌 ID。")
        return int(existing["id"])

    async def _relax_existing_token_if_needed(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        token: dict[str, Any],
        user: dict[str, Any],
        token_name: str,
        models: tuple[str, ...],
    ) -> None:
        expected_models = ",".join(models)
        if (
            token.get("model_limits_enabled")
            and str(token.get("model_limits") or "") == expected_models
            and token.get("unlimited_quota")
        ):
            return
        payload = {
            "id": int(token["id"]),
            "name": token_name,
            "remain_quota": 0,
            "expired_time": int(token.get("expired_time") or -1),
            "unlimited_quota": True,
            "model_limits_enabled": True,
            "model_limits": expected_models,
            "allow_ips": token.get("allow_ips") or "",
            "group": str(user.get("group") or token.get("group") or ""),
            "cross_group_retry": True,
        }
        result = await self._put_json(client, "/api/token/", headers, payload)
        if not result.get("success", False):
            logger.warning("failed to relax codex auto token user=%s message=%s", user.get("id"), result.get("message", ""))

    async def _fetch_token_key(self, client: httpx.AsyncClient, headers: dict[str, str], token_id: Any) -> str:
        result = await self._post_json(client, f"/api/token/{int(token_id)}/key", headers, {})
        data = result.get("data") if isinstance(result, dict) else None
        token_key = data.get("key") if isinstance(data, dict) else None
        if not result.get("success", False) or not token_key:
            raise NewApiAuthError(public_error_message(str(result.get("message") or ""), "无法读取专用 Key。"))
        return str(token_key)

    async def _get_json(self, client: httpx.AsyncClient, path: str, headers: dict[str, str]) -> dict[str, Any]:
        response = await client.get(f"{self.dashboard_base}{path}", headers=headers)
        return self._decode_response(path, response)

    async def _post_json(
        self,
        client: httpx.AsyncClient,
        path: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        response = await client.post(f"{self.dashboard_base}{path}", headers=headers, json=payload)
        return self._decode_response(path, response)

    async def _put_json(
        self,
        client: httpx.AsyncClient,
        path: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        response = await client.put(f"{self.dashboard_base}{path}", headers=headers, json=payload)
        return self._decode_response(path, response)

    def _decode_response(self, path: str, response: httpx.Response) -> dict[str, Any]:
        safe_text = redact(response.text[:500], secret_values_for_redaction(self.settings))
        if response.status_code >= 400:
            logger.warning("account sync request failed path=%s status=%s body=%s", path, response.status_code, safe_text)
            raise NewApiAuthError("账户同步失败，请重新登录后再试。")
        try:
            payload = response.json()
        except ValueError as exc:
            raise NewApiAuthError("账户同步失败，请重新登录后再试。") from exc
        if isinstance(payload, dict):
            return payload
        return {"success": False, "message": "账户同步返回格式异常", "data": payload}

    def _dashboard_headers(self, user_id: str, cookie_header: str) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "New-Api-User": user_id,
        }
        if cookie_header:
            headers["Cookie"] = cookie_header
        return headers

    def _cache_get(self, key: str) -> str:
        if self.redis is None:
            return ""
        raw = self.redis.get(key)
        if raw is None:
            return ""
        return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)

    def _cache_set(self, key: str, value: str) -> None:
        if self.redis is None:
            return
        self.redis.set(key, value, ex=self.settings.auto_token_cache_seconds)

    def _cache_get_json(self, key: str) -> dict[str, Any] | None:
        raw = self._cache_get(key)
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except ValueError:
            return None
        return payload if isinstance(payload, dict) else None

    def _cache_set_json(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        if self.redis is None:
            return
        self.redis.set(key, json.dumps(value, ensure_ascii=False, separators=(",", ":")), ex=max(1, ttl_seconds))

    def _user_bootstrap_cache_key(self, user_id: str, cookie_header: str) -> str:
        digest = hashlib.sha256(f"{user_id}\n{cookie_header}".encode("utf-8")).hexdigest()
        return f"codex:user-bootstrap:{digest}"

    def _key_hint(self, key: str) -> str:
        if len(key) <= 12:
            return "sk-****"
        return f"{key[:6]}...{key[-4:]}"


def safe_json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
