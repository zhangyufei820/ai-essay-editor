# LLM Gateway

Self-hosted OpenAI-compatible routing layer for realtime text and image-recognition calls. It keeps provider keys server-side and exposes stable business aliases backed by ordered provider pools.

- `sx-fast-chat`
- `sx-chinese-text`
- `sx-math-text`
- `sx-general-text`
- `sx-image-vision`
- `gpt-4o-mini`
- `gpt-5.2`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-pro`
- `gpt-5.5`
- `claude-sonnet-4-5-20250929`
- `claude-opus-4-5-20251101`
- `gemini-2.5-flash`
- `gemini-2.5-pro`

Hot business aliases are multi-deployment pools in `config.yaml`. LiteLLM filters unhealthy deployments from background health state, then honors deployment `order`:

- `order: 1`: fastest measured primary
- `order: 2+`: fallback providers
- `fallbacks`: last-resort cross-alias fallback after the deployment pool is exhausted

Deployment `model_info.id` values are shared across equivalent text aliases where the same provider/model pair is reused. This makes cooldown and circuit state follow the real upstream deployment instead of one alias only.

Production should point Dify / Next.js OpenAI-compatible providers at:

```text
http://llm-gateway:4000/v1
```

Use `LITELLM_MASTER_KEY` as the internal gateway key. Do not expose provider keys to browsers, Dify workflow variables, logs, or committed files.

For Dify model-provider display, use the Chinese aliases directly as model names:

| Dify display model | Gateway `endpoint_model_name` |
|---|---|
| `沈翔快速对话` | `sx-fast-chat` |
| `沈翔语文优先` | `sx-chinese-text` |
| `沈翔数学推理` | `sx-math-text` |
| `沈翔通用文本` | `sx-general-text` |
| `沈翔图像识别` | `sx-image-vision` |

Keep LiteLLM gateway model names ASCII-only. Dify can show Chinese names through `display_name` / Dify's provider model name, while the credential's `endpoint_model_name` points at the stable `sx-*` route. This avoids non-ASCII model names being written into OpenAI-compatible response headers.

## Health

```bash
curl http://127.0.0.1:4000/health/liveliness
curl http://127.0.0.1:4000/health/readiness
curl -H "Authorization: Bearer $LITELLM_MASTER_KEY" http://127.0.0.1:4000/health
```

Active health checks are intentionally bounded for production safety:

- `background_health_checks: true`
- `enable_health_check_routing: true`
- `health_check_interval: 180`
- `health_check_concurrency: 1`
- `health_check_max_tokens: 3` on actively probed deployments
- `health_check_timeout: 6-10` seconds per deployment
- `health_check_skip_disabled_background_models: true`
- `health_check_ignore_transient_errors: false`, so 429/408 probes can move traffic away before users hit provider pressure

Most long-tail/direct aliases set `disable_background_health_check: true`. The active probe set stays small so health checks do not compete with user traffic.

## Production Start

The compose service is behind the `ai-reliability` profile so an ordinary Next.js redeploy cannot accidentally start an unconfigured gateway.

```bash
docker compose -f docker-compose.prod.yml --profile ai-reliability up -d llm-gateway
```

## Provider Slots

Configure real values only in `.env.production` on the server:

```env
LITELLM_MASTER_KEY=replace-with-internal-gateway-key
VIVAAPI_LLM_BASE_URL=https://www.vivaapi.cn/v1
VIVAAPI_LLM_API_KEY=replace-with-vivaapi-key
TOKENFLUX_LLM_BASE_URL=https://tokenflux.dev/v1
TOKENFLUX_LLM_API_KEY=replace-with-tokenflux-key
MOONAPIX_LLM_BASE_URL=https://moonapix.com/v1
MOONAPIX_LLM_API_KEY=replace-with-moonapix-key
```

`config.yaml` only includes deployments that have been verified for realtime text chat. A provider can be present in server env before it is added to a model route.

Keep media generation on the media task stack. This gateway is for low-latency realtime text routing and lightweight visual understanding; image, music, and video generation should stay on durable task queues.
