# 2026-06-02 OpenClaw / Codex / OCR LLM Gateway Switch

目标：把服务器上的 OpenClaw、Codex Skill Gateway 和 essay-ai-suite OCR 从单一供应商直连切到内网 LLM Gateway，使用网关的主动健康探测、动态熔断和 fallback。

非密钥目标配置：

| Consumer | Base URL | Model |
|---|---|---|
| OpenClaw | `http://llm-gateway:4000/v1` | `sx-fast-chat` |
| Codex Skill Gateway | `http://llm-gateway:4000/v1` | `sx-fast-chat` |
| essay-ai-suite LLM | `http://llm-gateway:4000/v1` | `sx-chinese-text` |
| essay-ai-suite OCR / image recognition | `http://llm-gateway:4000/v1` | `sx-image-vision` |

安全约束：

- 真实 key 只放服务器 `.env` 或应用运行配置，不写入仓库。
- `API_KEY` / `PROXY_API_KEY` / `LLM_API_KEY` / `OCR_API_KEY` 使用服务器 `LITELLM_MASTER_KEY`。
- OpenClaw 如果未加入 `shenxiang-net`，需要先做可回滚的容器网络连接，避免继续使用外网直连供应商。
- 不修改 OpenResty / Nginx / 1Panel 基础设施配置。

验证要求：

- `shenxiang-llm-gateway` liveliness/readiness 正常。
- 直接冒烟 `sx-fast-chat` 文本和 `sx-image-vision` 图片识别。
- Codex `/v1/chat/completions` 通过自身网关冒烟。
- essay-ai-suite `/api/ocr/image` 通过 OCR 网关冒烟。
- OpenClaw `/v1/chat/completions` 通过 OpenClaw 自身接口冒烟。
