# Codex Sprint 3：运维可观测性、错误页、健康检查与后台可用性加固

项目路径：`/Users/aixingren/ai-essay-editor/`
技术栈：Next.js / TypeScript / Tailwind / Supabase
目标站点：shenxiang.school

你是 Codex，负责代码实现。Hermes 负责验收和是否放行下一 Sprint。

## 0. 当前状态

Sprint 0/1、2A、2B、2C 已验收合格。

Sprint 3 只做「运维可观测性 + 错误体验 + 健康检查 + 后台可用性」这一小阶段。
完成后必须停止，输出中文报告，等待 Hermes 验收。

不要进入 Sprint 4。
不要部署生产。

## 1. Sprint 3 目标

把站点从“能跑”提升到“出问题能看见、用户看到错误不慌、运维知道怎么排查”的状态。

本阶段重点解决：

1. 自定义错误页体验不足
2. 健康检查页面/接口信息不够清晰
3. Sentry/错误监控配置缺少安全占位保护或说明
4. 缺少可执行的运维监控文档
5. 后台页面出错/加载/空状态提示不够友好
6. 增加最小回归测试，防止后续删掉健康检查/错误页/监控说明

## 2. 允许修改的范围

你只能修改或新增以下范围内的文件：

### 错误页 / 健康检查
- `app/error.tsx`
- `app/global-error.tsx`
- `app/not-found.tsx`
- `app/health/page.tsx`
- `app/api/health/route.ts`

### 监控 / Sentry
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- `instrumentation-client.ts`

### 后台体验
- `app/admin/page.tsx`
- `app/admin/layout.tsx`
- `components/admin/**`（如果已存在才改；不存在不要大规模新建组件目录）

### 文档
- `docs/OPERATIONS.md`
- `docs/MONITORING.md`
- `docs/RUNBOOK.md`

### 测试
- `__tests__/health-routes.test.ts`
- `__tests__/operations-pages.test.ts`
- `__tests__/monitoring-docs.test.ts`

### 指令文件
- `CODEX-SPRINT-3.md`

如果确实需要改其他文件，必须在报告中说明原因；但原则上不要改。

## 3. 绝对禁止事项

本 Sprint 严禁：

- 不得部署生产
- 不得修改 `.env` / `.env.local` / `.env.production`
- 不得读取或输出真实密钥
- 不得硬编码 API key、token、password、service role key、connection string
- 不得创建、修改、删除 `services/essay-ai-suite/**`
- 不得创建或修改任何 1Panel 应用、1Panel app 包、release tar.gz
- 不得修改 `.github/workflows/**`
- 不得做 Docker、镜像、部署、CI/CD、服务打包相关工作
- 不得删除支付、订单、积分、用户、会员相关核心逻辑
- 不得进入 Sprint 4

这些限制只针对当前项目 `/Users/aixingren/ai-essay-editor/` 的本次 Sprint。

## 4. 具体任务

### 4.1 错误页体验

检查并改进：

- `app/error.tsx`
- `app/global-error.tsx`
- `app/not-found.tsx`

要求：

1. 页面中文友好，不要露出技术栈细节、堆栈、密钥、内部错误对象。
2. 提供明确操作入口：返回首页、刷新页面、联系客服或访问帮助页。
3. `error.tsx` / `global-error.tsx` 应有“重试”能力（Next.js `reset()` 或刷新提示）。
4. 页面风格与现有品牌尽量一致。
5. 不要引入新的依赖。

### 4.2 健康检查

检查并改进：

- `app/api/health/route.ts`
- 新增或改进 `app/health/page.tsx`

要求：

API `/api/health`：
1. 返回 JSON。
2. 至少包含：`status`、`timestamp`、`service`、`version` 或 `environment` 中的合理字段。
3. 不返回真实密钥、数据库连接串、内部环境变量完整值。
4. 如果已有 Supabase/运行时检查，保留但不要让健康检查泄露敏感信息。
5. 保持接口轻量，不要做重型数据库扫描。

页面 `/health`：
1. 给运维或站长看的中文状态说明。
2. 展示健康检查接口入口和人工排查建议。
3. 说明如果页面异常该检查哪些：部署状态、环境变量、支付回调、Supabase、日志。
4. 不要展示真实密钥。

### 4.3 Sentry / 错误监控占位保护

检查：

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- `instrumentation-client.ts`

要求：

1. 如果 DSN 未配置或是占位符，应安全跳过初始化。
2. 不要硬编码真实 DSN。
3. 不要在客户端暴露服务端密钥。
4. 文档里说明如何配置 Sentry，但用占位符，不写真实密钥。
5. 如果项目没有完整 Sentry 依赖或配置，不要强行安装依赖；只做安全保护和文档。

### 4.4 运维文档

新增或改进：

- `docs/OPERATIONS.md`
- `docs/MONITORING.md`
- `docs/RUNBOOK.md`

要求写中文，面向站长/运维，小白也能按步骤排查。

至少包含：

1. 本地验收命令：`npm run lint`、`npm run build`、`npm test ...`
2. 生产上线前检查清单。
3. 健康检查：`/health`、`/api/health`。
4. 关键页面检查：`/`、`/pricing`、`/privacy`、`/terms`、`/refund-policy`、`/admin`。
5. 支付问题排查：支付成功但权益未到账时检查订单号、支付回调、用户积分/会员状态。
6. 监控建议：Sentry、UptimeRobot 或类似外部监控，检查频率、告警方式。
7. 回滚原则：先停新版本、保留日志、不要覆盖 `.env.production`。
8. 明确不要把真实密钥写进文档或代码。

### 4.5 后台可用性小修

只允许在 `app/admin/page.tsx` / `app/admin/layout.tsx` 范围内做小修。

目标：后台页面出错时更容易理解。

要求：

1. 加强加载、空状态、请求失败提示。
2. 如果已有 toast 或错误提示，保留并优化中文文案。
3. 不要重写整个后台。
4. 不改后台鉴权核心逻辑，不能降低安全性。
5. 不改支付/订单/用户 API 的权限逻辑。

### 4.6 最小测试

新增或补齐测试，建议：

- `__tests__/health-routes.test.ts`
- `__tests__/operations-pages.test.ts`
- `__tests__/monitoring-docs.test.ts`

测试目标：

1. `/api/health` 返回基本字段，不泄露敏感字段名/密钥模式。
2. 错误页/404/健康页源码中包含关键中文入口，例如“返回首页”“联系客服”“健康检查”。
3. 运维文档包含 `/api/health`、`npm run build`、`Sentry`、`不要把真实密钥写进文档或代码` 等关键内容。

测试可以用 Jest 读取源码/文档文件，保持轻量，不要依赖真实网络和真实 Supabase。

## 5. 验收标准

Hermes 会按以下标准验收：

1. `git diff --stat` 只出现允许范围内的改动。
2. `.env*` 无改动。
3. `services/essay-ai-suite/**`、`.github/workflows/**` 无改动。
4. 当前 Sprint diff/新增文件无硬编码密钥。
5. `npm run lint` 通过。
6. `npm run build` 通过。
7. 相关 Jest 测试通过。
8. 错误页、健康检查、监控文档、后台可用性目标实际完成。

## 6. 完成后报告格式

完成 Sprint 3 后停止，不要继续下一阶段。

请用中文报告：

1. 修改了哪些文件
2. 每个文件做了什么
3. 执行了哪些命令，结果如何
4. 是否有未完成项或风险
5. 明确写：`Sprint 3 已完成，等待 Hermes 验收，未进入 Sprint 4。`
