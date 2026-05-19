# Security Policy

## Enforced In Code

1. All `/v1/*` routes require `X-API-Key`.
2. `/healthz`, `/openapi.json`, and `/media/{filename}` do not require API Key.
3. `voice_id` must be listed in `ALLOWED_VOICE_IDS`.
4. `text` is limited by `MAX_TEXT_CHARS`.
5. In-memory rate limiting is applied per client IP.
6. Concurrent jobs are limited by `MAX_CONCURRENT_JOBS`.
7. Voice clone is disabled by default with `ENABLE_VOICE_CLONE=false`.
8. Voice clone requires `consent_confirmed=true`.
9. Voice clone writes an audit JSONL entry before continuing.
10. Voice clone `audio_url` allows only HTTP/HTTPS and blocks localhost, private, loopback, link-local, and internal address ranges.
11. Errors use a safe JSON envelope and do not expose stack traces, environment variables, or local file paths.
12. OmniVoice port `3900` is only exposed inside Docker Compose; public traffic reaches only the gateway.

## Operational Requirements

- Use a long random `VOICE_GATEWAY_API_KEY`.
- Keep `.env` out of git.
- Put `voice-api.shenxiang.school` behind HTTPS.
- Do not publish OmniVoice `3900` on the host.
- Keep `ENABLE_VOICE_CLONE=false` until there is a formal consent, review, and takedown process.
- Review OmniVoice-Studio license before commercial use.

## Clone Governance

Cloned profiles are not automatically usable. Even when clone is enabled, the returned profile ID remains out of `ALLOWED_VOICE_IDS` until an administrator approves it.

