import ipaddress
import json
import socket
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Request


class GatewayError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def validate_text_length(text: str, max_chars: int) -> None:
    if len(text) > max_chars:
        raise GatewayError(
            code="TEXT_TOO_LONG",
            message=f"Text exceeds max length of {max_chars} characters.",
            status_code=400,
        )


def validate_voice_id(voice_id: str, allowed_voice_ids: list[str]) -> None:
    if voice_id not in allowed_voice_ids:
        raise GatewayError(
            code="VOICE_NOT_ALLOWED",
            message="Requested voice_id is not allowed.",
            status_code=400,
        )


def validate_public_audio_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise GatewayError("INVALID_AUDIO_URL", "audio_url must be an http or https URL.", 400)
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"}:
        raise GatewayError("SSRF_BLOCKED", "Localhost URLs are not allowed.", 400)
    try:
        ip = ipaddress.ip_address(host)
        _reject_private_ip(ip)
        return
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise GatewayError("INVALID_AUDIO_URL", "audio_url hostname cannot be resolved.", 400) from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        _reject_private_ip(ip)


def _reject_private_ip(ip: ipaddress._BaseAddress) -> None:
    if any(ip in network for network in PRIVATE_NETWORKS) or ip.is_private or ip.is_loopback or ip.is_link_local:
        raise GatewayError("SSRF_BLOCKED", "Private or local network URLs are not allowed.", 400)


def write_audit_log(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")

