# 沈翔智学运维手册

本文档面向站长和运维人员，用于本地验收、上线前检查和日常巡检。不要把真实密钥写进文档或代码，也不要把 `.env.production` 的内容粘贴到聊天工具。

## 本地验收命令

上线前至少执行：

```bash
npm run lint
npm run build
npm test -- __tests__/health-routes.test.ts __tests__/operations-pages.test.ts __tests__/monitoring-docs.test.ts
npm run perf:baseline -- --base-url=https://shenxiang.school --iterations=3
```

如果任一命令失败，先修复失败原因，再考虑上线。

## 自动部署与工作区清洁

本项目约定：测试通过后自动部署。除非站长明确要求暂停，上线修复或功能变更在完成必要验证后，应继续部署到生产环境，并完成线上 smoke check。

部署完成后必须保持两端工作区干净：

- 本地 `/Users/aixingren/ai-essay-editor`：提交或明确归类本次变更，不长期保留未说明的未提交改动。
- 服务器 `/data/ai-essay-editor`：不得长期留下散落的热修复文件、错误同步产物、`.DS_Store` / `._*` 文件、临时备份目录或未归类源码改动。
- 若临时热修复绕过了 `git pull`，必须尽快补齐正式提交和可追溯部署，并用 `git status --short --branch` 核对服务器工作区。
- 验证不要只看容器启动成功；还要检查 `/api/health`，并在必要时确认容器内编译产物包含本次改动。

## 上线前检查清单

- 确认 `.env.production` 已在服务器上存在，但不要覆盖已有生产文件。
- 确认 Supabase URL、匿名 Key、服务端 Key、支付配置、Dify API 配置均已按变量名填写。
- 执行数据库迁移 `scripts/019_add_billing_metadata_to_credit_transactions.sql`，为 `credit_transactions` 添加 `billing_metadata JSONB` 审计字段。
- 确认没有把真实 API key、token、password、service role key、数据库连接串提交到代码或文档。
- 确认 `npm run build` 通过，关键页面能本地访问。
- 确认 `/api/health` 返回 `status: ok`，`/health` 能打开运维说明页。
- 确认支付回调地址与生产域名 `shenxiang.school` 一致。

## 关键页面检查

上线前人工打开并确认：

- `/`
- `/pricing`
- `/privacy`
- `/terms`
- `/refund-policy`
- `/admin`
- `/health`
- `/api/health`

性能和服务器治理按以下文档执行：

- `docs/SERVER-TOPOLOGY.md`
- `docs/SERVER-CLEANUP-SOP.md`
- `docs/BACKUP-RESTORE-SOP.md`
- `docs/PERFORMANCE-BASELINE.md`
- `docs/AI-RELIABILITY-ARCHITECTURE.md`

## AI 网关与媒体任务巡检

- 实时文字：检查 `llm-gateway` 的 `/health/liveliness` 和 `/health/readiness`，并确认 Dify / Next.js 只使用内网 `LLM_GATEWAY_BASE_URL` 与内部网关 key。
- 语音：检查 `voice-gateway` 的 `/voice/health`，确认 `ttsProviderChain` / `sttProviderChain` 至少有一个已配置 provider。
- 媒体：长任务必须能在 `ai_task_runs` 中看到状态，并可通过 `/api/media/tasks/:taskId` 或 `/api/task-status` 返回统一任务状态。
- 安全：不得把上游 OpenAI-compatible provider key 写进 Dify workflow 变量、前端环境变量、日志或仓库文档。

`/admin` 应确认登录、概览、用户列表、订单记录可以正常加载；不要降低后台鉴权要求。

## 支付问题排查

支付成功但权益未到账时，按顺序检查：

- 支付平台订单号和本站订单号是否一致。
- 支付回调是否到达服务器，回调接口是否返回成功。
- 订单状态是否从待支付变为已支付。
- 用户积分、会员状态、交易流水是否同步更新。
- 后台 `/admin` 是否能查到该用户和订单。
- 日志中是否有签名校验失败、环境变量缺失或数据库写入失败。

## 回滚原则

- 先停止继续发布新版本，保留当前日志和错误截图。
- 不要覆盖 `.env.production`，不要删除生产数据。
- 优先回退到上一个已验证可用版本。
- 回滚后再次检查 `/api/health`、`/health` 和关键页面。
