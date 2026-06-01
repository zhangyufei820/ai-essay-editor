# LLM Gateway

Self-hosted OpenAI-compatible routing layer for realtime text calls. It keeps provider keys server-side and exposes one internal model alias:

- `sx-fast-chat`

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
LLM_PROVIDER_A_BASE_URL=https://provider-a.example.com/v1
LLM_PROVIDER_A_API_KEY=replace-with-provider-a-key
LLM_PROVIDER_B_BASE_URL=https://provider-b.example.com/v1
LLM_PROVIDER_B_API_KEY=replace-with-provider-b-key
LLM_PROVIDER_C_BASE_URL=https://provider-c.example.com/v1
LLM_PROVIDER_C_API_KEY=replace-with-provider-c-key
```

Keep media generation on the media task stack. This gateway is for low-latency realtime text routing.
