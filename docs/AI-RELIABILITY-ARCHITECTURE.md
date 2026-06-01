# AI Reliability Architecture

This project separates realtime AI requests from durable media generation.

## Realtime Requests

Realtime text calls should go through the internal OpenAI-compatible gateway:

```text
http://llm-gateway:4000/v1
model: sx-fast-chat
```

The gateway is configured in `services/llm-gateway/config.yaml` and wired in `docker-compose.prod.yml`. Provider keys must live only in `.env.production` on the server.

Use this path for:

- text chat
- short assistant calls
- Dify OpenAI-compatible provider routing

Do not use this path for long image, music, or video generation.

## Voice

`services/voice-gateway` owns TTS/STT. It supports provider chains:

```env
VOICE_TTS_PROVIDER_CHAIN=openai,siliconflow,minimax
VOICE_STT_PROVIDER_CHAIN=openai,siliconflow
VOICE_TTS_TIMEOUT_MS=5000
VOICE_STT_TIMEOUT_MS=20000
```

The gateway tries the configured providers in order, skips unconfigured providers, and returns the first successful result. Short TTS output is cached in memory to reduce latency for repeated phrases.

## Media Tasks

Long-running media generation must be represented by `ai_task_runs` and polled through:

```text
POST /api/media/tasks
GET /api/media/tasks/:taskId
GET /api/task-status
```

Current first-stage behavior:

- `music`: creates a unified task and submits through the existing Suno Dify workflow.
- `video`: use `/api/media/video/relaydance` for direct RelayDance submission; status is still normalized through `ai_task_runs`.
- `image`: unified task entry exists; provider-specific adapter work should extend this path instead of creating another status API.

Frontend should never wait on a provider-specific long request without a task id. It should show a task state such as queued/running/completed/failed and poll the shared status endpoints.

## Provider Health

`lib/ai-provider-health.ts` provides the first-stage provider scoring API:

- configured provider list by modality
- in-memory health snapshots
- latency/error/rate-limit scoring
- cooldown/open-circuit avoidance

Future server workers can persist these snapshots to Supabase and use the same selection functions before submitting image/music/video tasks.
