# OmniVoice Dify Gateway

FastAPI gateway for deploying OmniVoice Studio as a JSON-first speech generation service for Dify and shenxiang.school.

Public entry:

- `https://voice-api.shenxiang.school`
- Dify import: `https://voice-api.shenxiang.school/openapi.json`
- Auth header: `X-API-Key: <VOICE_GATEWAY_API_KEY>`

## Architecture

```text
Dify / shenxiang.school
        |
        v
https://voice-api.shenxiang.school
        |
        v
Caddy or nginx
        |
        v
FastAPI gateway :8000  -- API key, rate limit, queue, JSON response, media
        |
        v
OmniVoice Studio :3900 -- internal Docker network only
```

Default compose binds the gateway to host `127.0.0.1:8010` and keeps OmniVoice internal. Put the existing OpenResty/1Panel gateway in front of `http://127.0.0.1:8010`.

## Local Start

```bash
cp deploy/env.example .env
python scripts/generate_api_key.py
# copy the generated key into .env
docker compose -f deploy/docker-compose.yml up -d --build
```

The `.env` file must stay in this gateway root directory. `deploy/docker-compose.yml`
loads it with `env_file: ../.env`, which prevents rebuilds from starting the
gateway with an empty API key.

## GPU Start

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.gpu.yml up -d --build
```

## Logs

```bash
docker compose -f deploy/docker-compose.yml logs -f omnivoice
docker compose -f deploy/docker-compose.yml logs -f gateway
```

## Health Check

```bash
curl https://voice-api.shenxiang.school/healthz
```

## TTS Test

```bash
curl -X POST https://voice-api.shenxiang.school/v1/tts \
  -H "X-API-Key: $VOICE_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是一段沈翔智学 AI 老师语音讲评测试。","voice_id":"teacher_female_01","sync":true}'
```

## Dify

See `docs/dify_import.md`.

## Security

- Do not expose OmniVoice `3900` to the public internet.
- Keep `VOICE_GATEWAY_API_KEY` secret.
- Keep `ENABLE_VOICE_CLONE=false` unless there is a consent and review process.
- Restrict usable voices with `ALLOWED_VOICE_IDS`.
- See `docs/security_policy.md`.

## License Notice

OmniVoice-Studio uses FSL-1.1-ALv2. Review the license boundary before commercial use, especially if selling a competing public speech service.
