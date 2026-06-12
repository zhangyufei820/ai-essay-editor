# Codex Skill Gateway

独立的 Codex 技能网关，提供：

- `GET /health`
- `GET /skills`
- `POST /run`
- `POST /skills/custom`
- `POST /admin/run`
- `POST /admin/skills/custom`
- OpenAI-compatible `POST /v1/chat/completions`
- OpenAI-compatible `GET /v1/models`

生产部署只影响 `codex-skill-gateway*` 容器，不应触碰 Dify、Image 2、Gemini、Omnivoice 或 Next.js 主站容器。

## 配置

复制 `.env.example` 为 `.env`，填入真实 token。真实 `.env` 不入库。

生产环境的 `CODEX_MODEL_PROVIDER=proxy` 应指向内网统一模型服务，而不是某一家外部服务：

```env
CODEX_MODEL=sx-fast-chat
CODEX_PROXY_BASE_URL=http://llm-gateway:4000/v1
CODEX_PROXY_ENV_KEY=PROXY_API_KEY
PROXY_API_KEY=<server LITELLM_MASTER_KEY>
```

`sx-fast-chat` 是统一模型服务里的热文本别名，背后按健康探测和熔断状态选择可用链路。这样 Codex Skill Gateway 的同步技能请求和 OpenAI-compatible `/v1/chat/completions` 都不再绑定单一外部服务。

技能文件位于 `skills/<skill_name>/SKILL.md`，注册表位于 `skill_registry.json`。两者都要保持同步。

普通用户只能提交自定义 skill 到 `user-skills/pending/<skill_name>`。这些 skill 不会自动进入生产注册表。

管理员使用单独的 `ADMIN_API_KEY` 访问 `/admin/*` 接口。`ADMIN_API_KEY` 必须和 `GATEWAY_API_KEY` 不同，且只放在服务器 `.env`。

安全边界：

- 禁止普通用户删除文件。
- 禁止普通用户读取或修改 `.env`、Docker、Nginx/OpenResty、1Panel、SSH 和服务器目录。
- 禁止 Agent 执行 `ssh`、`scp`、`rsync`、`docker`、`sudo`、`rm`、`git reset`、`git clean`、`chmod`、`chown` 等命令。
- Codex worker 只挂载 `/workspace/runs` 和 `/workspace/user-skills`，不挂载生产项目目录。

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
