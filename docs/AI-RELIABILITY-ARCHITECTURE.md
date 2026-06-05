# AI Reliability Architecture

This project separates realtime AI requests from durable media generation.

## Realtime Requests

Realtime text calls should go through the internal OpenAI-compatible gateway:

```text
http://llm-gateway:4000/v1
model: sx-fast-chat
```

The gateway is configured in `services/llm-gateway/config.yaml` and wired in `docker-compose.prod.yml`. Provider keys must live only in `.env.production` on the server. The default low-latency alias is `sx-fast-chat`; business aliases also include `sx-chinese-text`, `sx-math-text`, `sx-general-text`, and `sx-image-vision`.

Dify can use Chinese display aliases while sending ASCII gateway model names:

| Dify display model | Gateway `endpoint_model_name` | Route intent |
|---|---|---|
| `沈翔快速对话` | `sx-fast-chat` | fastest stable text chat |
| `沈翔语文优先` | `sx-chinese-text` | Chinese-language writing and humanities tasks, Claude-first |
| `沈翔数学推理` | `sx-math-text` | math and reasoning tasks, OpenAI/Gemini-first |
| `沈翔通用文本` | `sx-general-text` | general text tasks |
| `沈翔图像识别` | `sx-image-vision` | multimodal image recognition / visual understanding |

Keep LiteLLM gateway model names ASCII-only. Dify's Chinese label belongs in Dify's model display/provider configuration, while `endpoint_model_name` points at the `sx-*` route. This avoids non-ASCII model names being reflected into OpenAI-compatible response headers.

Use this path for:

- text chat
- short assistant calls
- image recognition / visual understanding through multimodal chat payloads
- Dify OpenAI-compatible provider routing
- OpenClaw realtime text routing
- Codex Skill Gateway realtime text routing
- essay-ai-suite OCR / image-recognition calls

Do not use this path for long image, music, or video generation.

### Active Health And Circuit Breaking

The LLM gateway uses LiteLLM's background health checks and health-check-driven routing:

- hot aliases are single-primary routes
- the primary is the fastest measured deployment for that business alias
- provider failures enter cooldown through `allowed_fails` / `allowed_fails_policy`
- explicit `router_settings.fallbacks` define the deterministic backup order
- health checks are low-frequency and serial: 180 second interval, concurrency 1, max 3 output tokens, 6-10 second per-deployment timeout
- health probe 429/408 responses are treated as routing signals, so overloaded providers can be avoided before a user request lands there

This is true dynamic failover on the request path, not random load spreading. The product objective is fastest stable responses: hold the fastest healthy primary, then switch away quickly when it is unhealthy.

As of 2026-06-05 production verification, the hot GPT text aliases (`sx-fast-chat`, `sx-math-text`, `sx-general-text`) use TokenFlux as the primary because same-model smoke tests from the production environment measured it fastest after adding the required Codex-style `User-Agent` header for TokenFlux's TLS router checks.

The business-specialized primaries were also tightened from the same environment:

- `sx-chinese-text`: `Moonapix claude-sonnet-4-6` primary, because it was materially faster than the Viva Claude route while staying stable.
- `sx-image-vision`: `TokenFlux gpt-5.4-mini` primary, with `Viva gpt-5.4-mini` then Moonapix as fallbacks, because it was the fastest stable path for both URL-based vision requests and the base64 OCR shape used by `essay-ai-suite`.

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

Future server workers can persist these snapshots to Supabase and use the same selection functions before submitting image/music/video tasks. The realtime text and image-recognition path now relies on LiteLLM's deployment health cache; durable media generation should use the task substrate plus modality-specific provider chains.
