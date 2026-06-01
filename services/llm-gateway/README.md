# LLM Gateway

Self-hosted OpenAI-compatible routing layer for realtime text calls. It keeps provider keys server-side and exposes one fast internal alias plus provider-backed model aliases.

- `sx-fast-chat`
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

Identical model ids are merged under the same public `model_name` in `config.yaml`. LiteLLM can then route across deployments and cool down a failed deployment without changing the client-side model name.

Production should point Dify / Next.js OpenAI-compatible providers at:

```text
http://llm-gateway:4000/v1
```

Use `LITELLM_MASTER_KEY` as the internal gateway key. Do not expose provider keys to browsers, Dify workflow variables, logs, or committed files.

## Health

```bash
curl http://127.0.0.1:4000/health/liveliness
curl http://127.0.0.1:4000/health/readiness
```

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

Keep media generation on the media task stack. This gateway is for low-latency realtime text routing.
