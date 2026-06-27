# New API media image request log

Date: 2026-06-27

Scope: isolated New API stack at `/opt/shenxiang-new-api`.

## Change

- Added a submitted-phase user-visible log for media playground image calls under `/pg/images/*`.
- The log is written before the upstream image provider request starts, so users can still find a record when a long image request later times out, disconnects, or fails upstream.
- The log uses `type=4` system log with `quota=0`, not `type=2` consume log, to avoid polluting RPM or billing statistics.
- The log records model, token, channel, group, request id, request path, workflow, size, quality, count, resolution, and reserved quota.
- The log does not record prompt text, input image data, API keys, or upstream credentials.

## Deployment

- Image: `shenxiang-new-api-codex:2800fb8d-20260627-1626-media-image-log`
- Service: `shenxiang-new-api`
- Bind: `127.0.0.1:3120`

## Verification

- Docker build completed on the production host for the image above.
- Production `docker compose up -d --no-deps shenxiang-new-api` restarted only the isolated New API service.
- `docker compose ps shenxiang-new-api` showed the service running and healthy.
- `curl http://127.0.0.1:3120/api/status` returned a successful status payload.
- A live media playground request produced a submitted log row:
  - `user_id=64`
  - `type=4`
  - `model_name=gpt-image-2-4K`
  - `token_name=playground-default`
  - `channel_id=4`
  - `quota=0`
  - `request_id=202606270828562405177728268d9d6lEF9HpGA`
  - `content=媒体工坊图片请求已提交，模式 文生图，大小 1024x1024，清晰度 high，生成数量 1，分辨率 1K`

## Remaining Risk

This submitted log proves the backend accepted and routed the media playground request. It does not prove upstream completion. Final success, failure, quota settlement, or refund state still depends on the later consume/error logs.
