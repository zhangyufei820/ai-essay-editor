# Deployment

## Local Or Server Setup

```bash
cd /data/ai-essay-editor/omnivoice-dify-gateway
cp deploy/env.example .env
python scripts/generate_api_key.py
```

Put the generated `VOICE_GATEWAY_API_KEY` into `.env`.

Keep `.env` in the gateway project root, next to `README.md`. The compose file
loads it through `deploy/docker-compose.yml` with `env_file: ../.env`, so running
compose from either the project root or the `deploy/` directory still injects
the same secret into `omnivoice-gateway`.

## CPU

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

The compose file publishes only `127.0.0.1:8010->gateway:8000`. Existing OpenResty/1Panel should reverse proxy `voice-api.shenxiang.school` to `http://127.0.0.1:8010`.

## GPU

Requires NVIDIA Container Toolkit.

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.gpu.yml up -d --build
```

## Logs

```bash
docker compose -f deploy/docker-compose.yml logs -f omnivoice
docker compose -f deploy/docker-compose.yml logs -f gateway
docker compose -f deploy/docker-compose.yml logs -f caddy
```

## Health

```bash
curl https://voice-api.shenxiang.school/healthz
```

## TTS

```bash
curl -X POST https://voice-api.shenxiang.school/v1/tts \
  -H "X-API-Key: $VOICE_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是一段沈翔智学 AI 老师语音讲评测试。","voice_id":"teacher_female_01","sync":true}'
```

## DNS

Create an `A` record:

- `voice-api.shenxiang.school` -> your server public IP.

If Cloudflare proxy is enabled, keep long request timeout behavior in mind for sync TTS. Async jobs are safer for long audio.

Current production note: if `voice-api.shenxiang.school` still resolves to a
non-server address, the service can be verified with the host-header check on
the server IP, but Dify cannot import the public URL until DNS points to the
server and TLS covers this hostname.
