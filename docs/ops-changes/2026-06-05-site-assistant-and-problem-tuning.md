# 2026-06-05 网站助手检索恢复与题目解析路由压缩

- Scope: Dify workflow graph only; no Next.js 页面、网关配置、Dify key 或基础设施被改动。

## 背景

- `网站助手` 为了提速曾临时移除 `知识检索` 节点，前端响应更快，但回答明显失去站内语义和功能感知。
- `题目解析` 的慢点不在前端，而在 Dify 内部两个 LLM 节点；其中 `问题通道` 是纯路由用途，适合在不改最终效果的前提下压缩。

## 本次变更

### 网站助手

- Workflow: `448d28d8-1205-45e3-98c8-1b44443b8949`
- 恢复 `知识检索` 节点 `1779100030769`
- 保留原有 `知识检索 -> LLM -> 直接回复` 结构
- 将检索配置改为更轻的 weighted retrieval：
  - `top_k: 3`
  - `reranking_mode: weighted_score`
  - `reranking_enable: false`
  - 自定义权重：`vector 0.55 / keyword 0.45`

### 题目解析

- Workflow: `3be80f07-bf2e-4845-b246-2e61bff9dd69`
- 仅压缩路由节点 `问题通道` `17751975014370`
- 保持下游主解析节点 `LLM 3`、知识检索和最终回答结构不变
- 将路由系统提示词从约 `1241` 字缩短到约 `632` 字，继续保持：
  - `temperature: 0`
  - `max_tokens: 128`

## 生产备份

- DB backup label: `codex-site-problem-tune-20260605123106`
- Server file backup: `/root/shenxiang-config-backups/codex-site-problem-tune-20260605123106.json`

## 验证

真实账号前端链路：

- `/chat` `网站助手`
  - headers `2102ms`
  - first render `8170ms`
  - stream end `9222ms`
  - marker: `GW-AUDIT-1780662726844-general-chat`
- `/chat/problem` `题目解析专用智能体`
  - headers `1507ms`
  - first render `7975ms`
  - stream end `11126ms`
  - marker: `GW-AUDIT-1780662738344-problem`

Dify 节点审计：

- `网站助手`
  - run: `7672bdc1-56e6-48e1-9aab-2ed8f6f57cb3`
  - total: `5.88s`
  - `知识检索`: `2.69s`
  - `LLM`: `3.01s`
- `题目解析专用智能体`
  - run: `b5d4f729-7a91-400c-8b7e-aa931e3e64e0`
  - total: `8.54s`
  - `问题通道`: `2.74s`
  - `LLM 3`: `5.39s`

语义抽查：

- `网站助手` 对“作文怎么批改、历史记录和积分入口在哪”已恢复为站内功能导向回答，能给出 `/essay`、`/history`、`/credits`、`/pricing` 等入口说明。

## 相关脚本

- `scripts/dify-tune-site-problem-workflows.mjs`
  - dry-run 查看拟变更
  - `--apply` 直接写入生产 Dify workflow graph
  - 自动写 DB backup row 与 server JSON backup
