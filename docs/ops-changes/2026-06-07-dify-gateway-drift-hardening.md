# 2026-06-07 Dify LLM Gateway 漂移治理

目标：把 Dify 里的实时生成模型统一收口到 `llm-gateway`，只有知识检索模型、`Open Claw`、`codex` 例外。产品目标是快、稳、高质量。

## 结论

- 非豁免 Dify `llm` / `question-classifier` 节点只能使用五个中文业务别名：
  - `沈翔快速对话`
  - `沈翔语文优先`
  - `沈翔数学推理`
  - `沈翔通用文本`
  - `沈翔图像识别`
- 知识检索模型按模型类型豁免：`embeddings` 和 `rerank` 不强制改走实时 LLM gateway。
- `Open Claw` 和 `codex` 继续作为应用级豁免。

## 修复内容

- `scripts/dify-remap-unified-routing.mjs`
  - 保留名单收敛为 `Open Claw`、`codex`。
  - 把 ChatGPT / Claude / Gemini / Grok 独立展示页纳入网关治理。
  - 输出治理白名单和豁免模型类型，便于测试和人工审计。
  - 增加目标模型断言，禁止脚本把非豁免节点写回直连模型名。
- `scripts/dify-tune-site-problem-workflows.mjs`
  - `题目解析专用智能体` 路由节点改为 `沈翔快速对话`。
  - 解题和总编辑节点改为 `沈翔数学推理`。
- `scripts/dify-tune-vocab-card.mjs`
  - 对话理解节点改为 `沈翔快速对话`。
  - 长结构化 JSON 生成、质检、重写节点改为 `沈翔通用文本`。
- `__tests__/dify-production-hardening.test.ts`
  - 生产 dry-run 必须为 `total_changes: 0`。
  - 全量 Dify app 审计必须为 `total_changes: 0`，只排除 `Open Claw` 和 `codex`。
  - 静态扫描调优脚本，防止重新写入直连模型目标。

## 生产应用

- 统一 workflow remap 备份标签：`codex-unified-routing-20260607041003`
  - 更新 6 个 workflow、12 个节点。
- 词镜记忆卡 draft workflow 备份标签：`codex-vocab-card-tune-20260607041018`
  - 更新 draft workflow 的 4 个节点。

## 验证

```bash
node scripts/dify-remap-unified-routing.mjs
node scripts/dify-remap-unified-routing.mjs --all-apps
node scripts/dify-tune-site-problem-workflows.mjs
node scripts/dify-tune-vocab-card.mjs
npm test -- __tests__/dify-production-hardening.test.ts __tests__/llm-gateway-config.test.ts
docker compose -f docker-compose.prod.yml config
```

2026-06-07 线上复验：

- `node scripts/dify-remap-unified-routing.mjs` -> `total_changes: 0`
- `node scripts/dify-remap-unified-routing.mjs --all-apps` -> `total_changes: 0`
- `node scripts/dify-tune-site-problem-workflows.mjs` -> `planned_changes: 0`
- `node scripts/dify-tune-vocab-card.mjs` -> `planned_changes: 0`
- 全量 102 个 `llm` / `question-classifier` 节点中，非豁免违规数为 0。
- `https://shenxiang.school/api/health` 返回 `status: ok`。
- `shenxiang-llm-gateway` 容器内 smoke：
  - `sx-fast-chat` -> 200
  - `sx-chinese-text` -> 200
  - `sx-math-text` -> 200
  - `sx-general-text` -> 200
  - `sx-image-vision` -> 200
