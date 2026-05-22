# RelayDance Video Gateway

Secure HTTP gateway for Dify and Next.js to call RelayDance video APIs without exposing the RelayDance `sk-` token to browsers or Dify workflows.

## What It Does

- Keeps `RELAYDANCE_API_TOKEN` server-side.
- Exposes typed endpoints protected by `X-Gateway-Key`.
- Normalizes responses into one JSON envelope.
- Preserves full `provider_response` for debugging.
- Supports RelayDance's documented submit, status, content, upload-url, and private asset-library flows.

## Environment

Copy `.env.example` to `.env` on the server and fill real values there. Do not commit `.env`.

```env
RELAYDANCE_BASE_URL=https://relaydance.com
RELAYDANCE_API_TOKEN=your_relaydance_token_here
GATEWAY_API_KEY=replace-with-dify-gateway-key
REQUEST_TIMEOUT_SECONDS=180
STRICT_MODEL_VALIDATION=true
ENABLE_LAST_FRAME=false
HOST_PORT=8013
```

## Run Locally

```bash
cd services/relaydance-video-gateway
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Docker

```bash
cd services/relaydance-video-gateway
docker compose config
docker compose up -d --build
```

The compose file binds to `127.0.0.1:${HOST_PORT:-8013}:8000` and joins the external `shenxiang-net` network.

## Dify-Friendly Create Endpoint

```bash
curl -X POST http://127.0.0.1:8013/api/v1/video/create \
  -H "X-Gateway-Key: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Slow cinematic dolly-in, golden hour lighting.",
    "model": "doubao-seedance-2-0-720p",
    "seconds": "5",
    "ratio": "16:9",
    "resolution": "720p",
    "generate_audio": false,
    "first_frame_url": "https://cdn.example.com/first-frame.jpg"
  }'
```

Response:

```json
{
  "success": true,
  "task_id": "task_01J7H8K2P3Q4R5S6T7U8V9W0XY",
  "provider_response": {
    "task_id": "task_01J7H8K2P3Q4R5S6T7U8V9W0XY"
  }
}
```

`last_frame_url` is accepted for workflow compatibility, but it is not forwarded unless `ENABLE_LAST_FRAME=true`. The uploaded PDF only documents `first_frame`, so the safe default is to ignore tail-frame input and return a warning.

## Status Polling

```bash
curl -H "X-Gateway-Key: $GATEWAY_API_KEY" \
  http://127.0.0.1:8013/api/v1/videos/task_01J7H8K2P3Q4R5S6T7U8V9W0XY
```

Completed responses expose `video_url` from RelayDance `metadata.url`. This is a temporary signed URL, approximately 30 minutes according to the uploaded PDF.

## Upload URL

```bash
curl -H "X-Gateway-Key: $GATEWAY_API_KEY" \
  "http://127.0.0.1:8013/api/v1/upload-url?ext=jpg&md5=<32-char-md5>"
```

Use the returned `upload_url` for direct PUT and pass `source_url` as `first_frame_url`.

## Private Asset Library

```bash
curl -X POST http://127.0.0.1:8013/api/v1/assets/virtual/create \
  -H "X-Gateway-Key: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_url":"https://cdn.example.com/photo.jpg","asset_type":"Image"}'
```

Then poll:

```bash
curl -H "X-Gateway-Key: $GATEWAY_API_KEY" \
  http://127.0.0.1:8013/api/v1/assets/asset_123/status
```

When active, pass `asset://asset_123` as `first_frame_url`.

## Dify Tool Parameters

For a Dify HTTP Request or OpenAPI tool, expose only:

- `prompt`
- `model`
- `seconds`
- `ratio`
- `resolution`
- `generate_audio`
- `first_frame_url`
- `last_frame_url`

Keep `RELAYDANCE_API_TOKEN` only in `.env` on the server.
