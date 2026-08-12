# LLM Gateway

Self-hosted OpenAI-compatible routing layer for realtime text and image-recognition calls. It keeps upstream keys server-side and exposes stable business aliases with one managed New API primary and one Viva fallback family.

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
- `claude-sonnet-4-6`
- `claude-opus-4-7`
- `gemini-2.5-flash`
- `gemini-2.5-pro`

Hot business aliases are single-primary routes in `config.yaml`. LiteLLM keeps the primary healthy with background checks, and failover happens through explicit `router_settings.fallbacks` chains:

- primary alias: the managed New API account requested for shenxiang.school
- fallback alias chain: the matching Viva model only
- no other direct supplier is present in the active gateway configuration
- provider retry count is `0`: a failed primary immediately moves to the fallback chain instead of spending another request on the same unhealthy route

Deployment `model_info.id` values are shared across equivalent text aliases where the same provider/model pair is reused. This makes cooldown and circuit state follow the real upstream deployment instead of one alias only.

## Sensitive Content Filter

The gateway now applies a default-on LiteLLM content filter before requests leave the gateway and again on model output.

- all gateway text aliases inherit the same filter
- request path and response path are both covered
- built-in categories block illegal-weapons content
- `/app/guardrails/blocked-words.yaml` adds the exact-match policy for:
  - 色情
  - 枪支

Violence, blood, drug, national-leader, and political keywords are intentionally
not blocked by the gateway keyword file. They caused false positives in normal
education prompts and should be handled by downstream product review rules only
when a specific app requires it.

Repository source of truth:

```text
services/llm-gateway/config.yaml
services/llm-gateway/guardrails/blocked-words.yaml
```

Container mount:

```text
./services/llm-gateway/guardrails:/app/guardrails:ro
```

When policy changes are needed, update the mounted rules file instead of editing frontend or Dify nodes one by one.

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
- `allowed_fails: 1`, with authentication and bad-request failures set to `0`, so invalid credentials or payloads do not churn through retries

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
SHENXIANG_NEW_API_BASE_URL=https://api.aiphui.top/v1
SHENXIANG_NEW_API_TEXT_API_KEY=replace-with-user-text-key
SHENXIANG_NEW_API_CLAUDE_API_KEY=replace-with-user-claude-key
VIVAAPI_LLM_BASE_URL=https://www.vivaapi.cn/v1
VIVAAPI_LLM_API_KEY=replace-with-vivaapi-key
```

`config.yaml` contains only those two upstream families. Remove retired supplier credentials from the production env after a recoverable, access-restricted snapshot is created.

Keep media generation on the media task stack. GPT Image uses the durable image gateway and Gemini image uses its OpenAI-compatible task route; both follow New API primary -> Viva fallback. This LiteLLM service remains for low-latency text and lightweight visual understanding.
