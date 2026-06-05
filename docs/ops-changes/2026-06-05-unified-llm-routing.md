# 2026-06-05 全站统一 LLM Gateway / Dify 工作流快稳路由

目标：把前端实际在用的 Dify 文本工作流统一收口到 `llm-gateway` 中文业务别名，并把主路调整为当前测速下更快、更稳的供应商顺序。

## 这次落地了什么

1. `services/llm-gateway/config.yaml`
   - `sx-fast-chat` 继续以 `gpt-5.5` 为主池，`vivaapi -> moonapix -> tokenflux -> gemini`
   - `sx-chinese-text` 调整为 `claude-sonnet-4-6` 优先，`claude-opus-4-7` 作为更慢但更强的后备
   - `sx-image-vision` 调整为 `gpt-5.4-mini` 优先，视觉识别先走更快路径
   - 暴露独立 `grok-4.2` 路由，方便独立模型页保持模型身份
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

## 常用命令

```bash
npm test -- __tests__/llm-gateway-config.test.ts
npm run perf:chat:prod
npm run perf:dify:audit -- --marker GW-AUDIT-...
```
