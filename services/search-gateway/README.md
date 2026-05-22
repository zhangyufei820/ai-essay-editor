# Shenxiang Search Gateway

独立搜索网关，给 Dify Agent 提供统一的联网搜索和网页内容抽取工具。Dify 只需要配置 `X-Gateway-Key`，Tavily / Brave 的真实 API Key 留在服务器 `.env`。

## Endpoints

- `GET /health`: 健康检查。
- `POST /api/v1/search`: 联网搜索，支持 `provider=auto|tavily|brave`。
- `POST /api/v1/extract`: Tavily 网页内容抽取，仅允许公网 `http(s)` URL。

## Local Setup

```bash
cp .env.example .env
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pytest
docker compose config
```

## Dify Auth

在 Dify Custom Tool 的鉴权 Header 中配置：

```text
X-Gateway-Key: <GATEWAY_API_KEY>
```

不要把 `TAVILY_API_KEY` 或 `BRAVE_API_KEY` 填进 Dify。
