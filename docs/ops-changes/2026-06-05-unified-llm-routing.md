# 2026-06-05 全站统一 LLM Gateway / Dify 工作流快稳路由

目标：把前端实际在用的 Dify 文本工作流统一收口到 `llm-gateway` 中文业务别名，并把主路调整为当前测速下更快、更稳的供应商顺序。

## 这次落地了什么

1. `services/llm-gateway/config.yaml`
   - `sx-fast-chat` 以 `gpt-5.5` 为主池，生产同环境复测后切为 `tokenflux -> moonapix -> vivaapi -> gemini`
   - `sx-chinese-text` 生产同环境复测后切为 `Moonapix claude-sonnet-4-6` 主路，`Viva/Moonapix opus` 与 `sx-general-text` 做后备
   - `sx-image-vision` 生产同环境复测后切为 `TokenFlux gpt-5.4-mini` 主路，后备顺序为 `Viva gpt-5.4-mini -> Moonapix gpt-5.4-mini -> Moonapix claude-sonnet-4-6`
   - 暴露独立 `grok-4.2` 路由，方便独立模型页保持模型身份
   - TokenFlux 通道补齐了生产验证通过的 `User-Agent`，修复其 `403 TLS router` 拦截
2. `scripts/dify-remap-unified-routing.mjs`
   - 只扫描真实前端使用的 Dify app
   - 排除 `Open Claw`、`codex` 和四个独立模型页
   - 把 LLM 节点按业务角色重定向到中文网关模型：
     - `沈翔快速对话`
     - `沈翔语文优先`
     - `沈翔数学推理`
     - `沈翔通用文本`
     - `沈翔图像识别`
3. 新增生产审计脚本
   - `node scripts/production-chat-latency.mjs`
     - 用真实账号登录生产站点
     - 记录每个聊天 app 的前端请求首包、首渲染、整段完成时间
     - 自动写出唯一追踪码，方便回查 Dify
   - `node scripts/dify-workflow-latency-audit.mjs --marker <追踪码>`
     - 回查对应 `workflow_runs`
     - 拉出该次运行的 `workflow_node_executions`
     - 看清楚真正的慢节点

## 生产侧备份与验证

- Dify workflow graph 备份标签：`codex-unified-routing-20260605060301`
- 统一 remap 之后 dry-run 为 `total_changes = 0`
- `shenxiang-llm-gateway` 已通过 liveliness / readiness
- 2026-06-05 二次同环境复测结论：
  - `sx-chinese-text` 现网主路若走 Viva 会慢于 Moonapix，已改成 Moonapix 主路
  - `sx-image-vision` 在真实 URL 识图和 base64 OCR 两种输入下，TokenFlux `gpt-5.4-mini` 都是最快且成功率稳定的主路

## 常用命令

```bash
npm test -- __tests__/llm-gateway-config.test.ts
npm run perf:chat:prod
npm run perf:dify:audit -- --marker GW-AUDIT-...
```
