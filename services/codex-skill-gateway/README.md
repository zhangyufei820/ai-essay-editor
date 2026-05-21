# Codex Skill Gateway

独立的 Codex 技能网关，提供：

- `GET /health`
- `GET /skills`
- `POST /run`
- OpenAI-compatible `POST /v1/chat/completions`
- OpenAI-compatible `GET /v1/models`

生产部署只影响 `codex-skill-gateway*` 容器，不应触碰 Dify、Image 2、Gemini、Omnivoice 或 Next.js 主站容器。

## 配置

复制 `.env.example` 为 `.env`，填入真实 token。真实 `.env` 不入库。

技能文件位于 `skills/<skill_name>/SKILL.md`，注册表位于 `skill_registry.json`。两者都要保持同步。

## 部署

```bash
docker compose build codex-gateway codex-worker-fast codex-worker-heavy
docker compose up -d codex-gateway codex-worker-fast codex-worker-heavy
```

## 验证

```bash
curl -s http://127.0.0.1:18081/health
curl -s -H "Authorization: Bearer $GATEWAY_API_KEY" http://127.0.0.1:18081/skills
```
