# Codex Skill 调用 SOP

适用项目：`ai-essay-editor` / 沈翔智学。

本项目是 Next.js 16 + TypeScript 应用，包含 Supabase、Dify API、支付、Authing、Sentry、Docker 自托管、1Panel/服务包、Jest 测试和运维文档。每次让 Codex 处理任务时，先按本 SOP 明确该调用哪些 skill，避免只靠通用对话推进。

## 0. 每次任务的固定开场

在任何代码修改前，Codex 必须先做五件事：

1. 读取项目约定：`AGENTS.md`、`CLAUDE.md`、相关 `docs/` 文档。
2. 检查工作区：`git status --short --branch`，确认已有用户改动。
3. 识别任务类型，并点名调用对应 skill。
4. 给出本次 skill 调用链，例如：`codebase-recon -> architect -> backend -> qa -> webapp-testing`。
5. 按“八步作业流”推进：问题分析、计划、方案、预验证、实施、验证、审查、交付。

本 SOP 已整合来自 Claude 项目记忆的三份历史规范：

- `/Users/aixingren/.claude/projects/-Users-aixingren-ai-essay-editor/memory/2026-04-04-skill-usage-guide.md`
- `/Users/aixingren/.claude/projects/-Users-aixingren-ai-essay-editor/memory/security-guardrails.md`
- `/Users/aixingren/.claude/projects/-Users-aixingren-ai-essay-editor/memory/2026-04-02-sop-workflow.md`

`AGENTS.md` 里写的是 `.Codex/memory/...` 路径，但当前仓库该目录下缺少这三份文件；实际来源在上面的 Claude memory 目录。后续若恢复到仓库内，应保持内容与本 SOP 同步。

## 0.1 八步作业流

当用户要求修复 Bug、实现功能、代码审查或部署相关任务时，必须按以下顺序推进：

1. **问题分析**：分析状态流转、API 调用、数据读写和 UI 行为，找根因而不是表象；列出涉及文件和模块。未分析清楚前禁止直接修改代码。
2. **制定计划**：列出要修改的文件、具体逻辑点、影响范围、风险和回滚方案。
3. **方案设计**：给出逻辑流或伪代码，说明新结构、接口、兼容性和扩展性。
4. **预实施验证**：静态检查方案是否影响生产逻辑；确认是否涉及数据库、环境变量、网络连通性。
5. **代码实施**：按最小可验证变更实施；重大变更先试点后全量；不覆盖用户已有改动。
6. **结果验证**：检查功能、UI、流式输出、性能指标和相关测试。
7. **代码审核**：检查冗余代码、潜在 Bug、日志合理性、安全风险（SQL 注入、XSS、认证、权限）。
8. **交付总结**：说明修改点、验证结果、已知限制和后续维护建议。

## 1. 安全红线

修改权限仅限当前开发项目 `/Users/aixingren/ai-essay-editor` 的代码、文档和相关业务逻辑文件。基础设施、容器环境、系统配置和持久化数据默认属于禁止触碰区。

涉及生产环境、数据库、支付、用户权益、Docker/1Panel 时，必须先调用：

- `security`
- `vibe-security-best-practices`
- 必要时加 `vibe-security-threat-model`

禁止默认执行：

- 删除或重建生产数据。
- 覆盖 `.env.production`、`.env.local`、真实密钥文件。
- 执行 `docker system prune`、清理 1Panel 基础设施、删除持久化卷。
- 绕过后台鉴权、降低支付回调校验、暴露 service role key。

绝对禁止触碰区：

- 容器环境：禁止删除或停止 Docker 容器、镜像、网络（特别是 `1panel-network`）和数据卷。
- 1Panel 基础设施：禁止修改 `/opt/1panel` 及其子目录下的应用配置文件。
- 持久化数据：禁止操作 `.db`、PostgreSQL 数据目录、Redis 快照、上传资源目录。
- 网关配置：禁止修改 OpenResty/Nginx 配置和 SSL 证书。

命令黑名单，除非用户明确书面授权，不得执行：

```bash
docker system prune
docker volume prune
docker network rm
docker rm -f $(docker ps -aq)
rm -rf /
find ... -delete
```

也不得执行任何涉及 `sudo` 且目标在项目目录之外的删除指令。

如果认为必须删除文件、清理环境或动生产资源，必须先输出并等待确认：

```text
操作目标：[具体文件路径或容器名称]
删除原因：[为什么要执行]
潜在影响：[是否影响 1Panel/其他服务/数据是否可恢复]
风险等级：[低/中/高/灾难级]
建议命令：[完整命令]
```

然后停止并询问：

```text
我已完成风险评估，由于 [原因]，我建议执行 [命令]。这可能会导致 [后果]。请确认是否授权执行？(y/n)
```

涉及目录结构变动后，必须立即运行 `ls -la` 确认关键文件仍存在，尤其是 `.env*`、`docker-compose*.yml`、`Dockerfile`、`package.json`。

涉及线上故障时，同时读取：

- `docs/RUNBOOK.md`
- `docs/OPERATIONS.md`
- `docs/MONITORING.md`

服务器信息仅用于识别风险边界，不代表默认可操作：

- 本地项目：`/Users/aixingren/ai-essay-editor`
- 生产项目：`root@43.154.111.156:/data/ai-essay-editor`
- 生产域名：`shenxiang.school`
- 项目容器网络：`ai-essay-editor_shenxiang-net`

## 2. 任务类型到 Skill 的映射

### 新功能或较大改造

调用链：

1. `codebase-recon`：先看热点、风险文件、历史改动集中区。
2. `architect` 或 `vibe-architecture-patterns`：确认模块边界、数据流、API 契约。
3. `create-plan`：形成短计划和验收标准。
4. `backend` / `frontend`：按涉及范围选择。
5. `qa` / `vibe-tdd-guide`：补测试。
6. `webapp-testing`：涉及页面交互时做浏览器验证。

适用例子：

- 新增作文批改能力。
- 改聊天页、作文页、工作流可视化。
- 新增 API route、服务端能力或 Dify 工作流。

强制流程：

- 先做需求分析和接口/状态设计，再写代码。
- 如涉及 API，先明确请求、响应、错误码、鉴权、速率限制。
- 如涉及数据库，先写迁移说明、回滚方案和验证脚本。
- 发布前必须完成测试、回归验证和安全检查。

### Bug 修复

调用链：

1. `vibe-systematic-debugging`：复现、定位、最小假设。
2. `context-hunter` 或 `vibe-context-hunter`：查相关调用链和测试。
3. `backend` / `frontend` / `qa`：按问题位置处理。
4. `vibe-verification-quality-assurance`：确认验证矩阵。

必须产出：

- 失败原因。
- 修改文件。
- 对应测试命令。
- 残余风险。

强制流程：

- 先复现或构造最小失败路径。
- 用测试或脚本固定问题，不允许凭感觉改。
- 修复后重新跑触发问题的路径和相关回归测试。

### PR / CI / GitHub Actions

调用链：

1. `gh-fix-ci`：读取 PR checks 和 GitHub Actions 日志。
2. `ci-fixer`：最小修复。
3. `qa`：本地复现和测试。
4. `brooks-review`：修复后做一次风险 review。

常用命令：

```bash
npm run lint
npm run build
npm test
```

### 代码审查

调用链：

1. `reviewer`：普通 code review。
2. `brooks-review`：更严格的工程质量 review。
3. `brooks-test`：测试质量检查。
4. `security`：涉及鉴权、支付、密钥、数据库时必加。

审查输出顺序：

1. 高风险问题。
2. 中低风险问题。
3. 测试缺口。
4. 可选改进。

### 架构审计 / 技术债

调用链：

1. `codebase-recon`
2. `brooks-audit`
3. `brooks-debt`
4. `architect`
5. `vibe-architecture-patterns`

适用区域：

- `app/api/**`
- `lib/**`
- `components/chat/**`
- `services/**`
- 支付、积分、会员、分享奖励、Dify、OpenClaw 媒体代理。

### 前端 UI / UX

调用链：

1. `frontend-design` 或 `ui-ux-pro-max`
2. `frontend`
3. `qa`
4. `webapp-testing`

必须验证：

- 桌面和移动视口。
- 文案不溢出、不遮挡。
- 关键交互可点击。
- 控制台无明显错误。

适用页面：

- `/`
- `/chat`
- `/essay`
- `/worksheet-diagnosis`
- `/pricing`
- `/admin`

实现约束：

- 尽量在独立组件或 Hook 中修改。
- 避免污染全局样式；优先复用 `lib/design-tokens.ts`、CSS 变量和现有组件。
- 修改功能性 UI 后，启动或使用本地服务做可视化验证；在 Codex app 中优先用 Browser 打开 `http://localhost:3000`，必要时截图检查。

### API / 后端 / Dify / Supabase

调用链：

1. `backend`
2. `security`
3. `vibe-security-best-practices`
4. `qa`
5. `vibe-verification-quality-assurance`

重点检查：

- `app/api/**/route.ts`
- `lib/dify-workflow-client.ts`
- `lib/internal-dify-fetch.ts`
- `lib/supabase/**`
- `lib/billing.ts`
- `lib/permissions.ts`
- `lib/rate-limit.ts`

禁止在日志或测试输出中暴露真实 key、token、用户隐私。

Dify / Agent 类任务补充调用链：

1. `mcp-builder`：需要把外部能力做成 MCP 工具时。
2. `backend`：实现服务端调用、流式响应、错误处理。
3. `security`：检查密钥、鉴权、速率限制、日志泄露。
4. `qa`：覆盖成功、失败、超时、空响应、流式中断。

常见错误要提前检查：

- Base URL 是否重复拼接 `/v1`。
- 服务间通信是否误用 `127.0.0.1:port`；容器内应使用容器名或正确监听 `0.0.0.0`。
- 新环境变量是否同步到 `.env.example`、部署文档和运行环境说明，但不得写入真实值。
- 流式输出是否真正使用 streaming，而不是等全部生成后一次性返回。

### 支付、积分、会员、订单

调用链：

1. `security`
2. `vibe-security-threat-model`
3. `backend`
4. `qa`
5. `brooks-review`

重点文件：

- `lib/billing.ts`
- `lib/stripe.ts`
- `lib/wechat-pay.ts`
- `lib/xunhupay.ts`
- `lib/membership-monthly-grants.ts`
- `app/api/stripe/**`
- `app/api/user/**`
- `app/api/cron/**`
- `__tests__/credits.test.ts`
- `__tests__/payment-guards.test.ts`

上线前至少运行：

```bash
npm run lint
npm run build
npm test -- __tests__/credits.test.ts __tests__/payment-guards.test.ts __tests__/pricing.test.ts
```

### 数据库迁移

调用链：

1. `security`
2. `backend`
3. `qa`
4. `brooks-review`

规则：

- 只新增可回滚迁移，避免直接改生产。
- 迁移必须说明影响表、影响字段、回滚方式。
- 不在聊天中粘贴真实数据库连接串或 service role key。
- 优先写 SQL 文件和验证脚本，不直接对生产执行。

### Docker / 部署 / 1Panel

调用链：

1. `devops`
2. `deploy-pipeline`
3. `security`
4. `openclaw-1panel` 或 `1panel-appstore-skills`，仅在任务明确涉及 1Panel 时。

重点文件：

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docs/DEPLOY-SCRIPT.md`
- `docs/OPERATIONS.md`
- `services/**/Dockerfile`
- `services/essay-ai-suite/1panel/**`

禁止默认清理 Docker 卷、生产容器、1Panel 基础设施。

部署前检查：

- 不覆盖生产 `.env.production`。
- 不修改 `/opt/1panel`。
- 不删除数据卷。
- 网络变更必须验证相关容器互通。
- 新增端口、环境变量、卷挂载时必须同步更新文档和回滚说明。

#### 生产工作区卫生与隔离规则

生产项目目录 `root@43.154.111.156:/data/ai-essay-editor` 必须保持可解释状态，禁止长期留下散落的未提交源码、备份文件或临时目录。任何人或 Codex 在部署前后看到生产工作区非 clean 时，必须先归类处理，而不是继续叠加修改。

生产机只允许两种 Git 状态：

1. 正式部署分支 + `git status --short` 为空。
2. `codex/prod-quarantine-*` 隔离分支 + `git status --short` 为空。

禁止把以下文件或目录留在项目 Git 工作区内：

- `.cleanup-backups/`
- `.deploy-backups/`
- `tmp-codex-upload/`
- `*.backup-*`
- `*.bak`
- 任何包含 `.env.production`、真实密钥、生产配置快照的备份文件。

临时备份、部署前快照、线上排障备份必须放到仓库外：

```bash
/data/ai-essay-editor-quarantine/<YYYYMMDD-purpose>/
```

如果生产机已有无法立即判断归属的真实源码改动，必须按以下流程隔离：

1. 先把备份/临时/可能含密钥的文件移出项目目录，放入 `/data/ai-essay-editor-quarantine/<stamp>/`。
2. 在生产仓库创建隔离分支：`codex/prod-quarantine-<YYYYMMDD>`。
3. 将剩余真实源码改动提交为一个清晰的隔离提交，例如 `chore: quarantine production workspace changes`。
4. 推送隔离分支到远端，或从本机拉取该分支后推送，确保同事能通过 Git/PR 查看。
5. 完成后生产机必须回到 clean 状态，并记录当前分支、commit、备份目录和健康检查结果。

后续部署时，禁止再用“工作区有大量未提交改动”作为最终报告结论；必须给出具体归类和处置结果。若未获授权处理，应至少报告阻塞原因和建议隔离命令。

### Sentry / 线上错误 / 监控

调用链：

1. `sentry-triage`
2. `vibe-systematic-debugging`
3. `backend` / `frontend`
4. `qa`

必须读取：

- `docs/RUNBOOK.md`
- `docs/MONITORING.md`
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`

### 性能问题

调用链：

1. `vibe-performance-testing`
2. `vibe-detecting-performance-regressions`
3. `frontend` / `backend`
4. `webapp-testing`

关注：

- 首屏加载。
- `/chat` 流式响应。
- 图片/媒体代理。
- Dify 工作流响应。
- `/api/health` 和关键 API 延迟。

### 文档、Runbook、发布说明

调用链：

1. `docs`
2. `vibe-writing-docs`
3. `changelog-generator`，如果已安装。

适用：

- README。
- 部署指南。
- 运维手册。
- Sprint 文档。
- 发布说明。

### 内容创作 / 公众号 / 多媒体

本项目包含 `docs/superpowers/**` 和多个 HyperFrames 目录。涉及文章、教程、宣传内容、图像、视频时，按任务选择：

1. `content-research-writer` 或 `article-writing`：研究和长文写作。
2. `content-engine`：多平台内容改写与分发策略。
3. `batch-image-studio`：客户订单式批量生图，生成 prompt matrix、批次计划、图片候选集和客户图库。
4. `imagegen` / `fal-ai-media`：单张图、参考图改图、视觉素材生成。
5. `video-editing` / HyperFrames 相关 skill：视频脚本、动效、渲染。

内容产出也要遵守安全红线：不得泄露真实密钥、用户数据、服务器凭据或未公开业务信息。

## 2.1 快速触发词

| 用户说法 | 优先调用 |
|---|---|
| 不熟悉这个项目、先看看 | `codebase-recon`、`context-hunter` |
| 修 bug、报错、异常 | `vibe-systematic-debugging`、`qa` |
| 新功能、重构、多文件改动 | `create-plan`、`architect`、`backend` / `frontend` |
| API、接口、服务端 | `backend`、`security` |
| UI、页面、交互、移动端 | `frontend-design`、`frontend`、`webapp-testing` |
| 数据库、SQL、迁移 | `security`、`backend`、`qa` |
| 支付、积分、会员、订单 | `security`、`vibe-security-threat-model`、`backend`、`brooks-review` |
| Docker、部署、1Panel | `devops`、`deploy-pipeline`、`security` |
| CI、PR、GitHub Actions | `gh-fix-ci`、`ci-fixer` |
| 代码审查 | `reviewer`、`brooks-review`、`brooks-test` |
| 性能慢 | `vibe-performance-testing`、`vibe-detecting-performance-regressions` |
| Sentry、线上错误 | `sentry-triage`、`vibe-systematic-debugging` |
| 写文档、Runbook、发布说明 | `docs`、`vibe-writing-docs` |
| 批量生图、客户选图、跑图图库 | `batch-image-studio`、`imagegen` |

原则：

- 小问题可以直接修，但仍要说明调用的 skill。
- 大问题必须先计划后实施。
- 重复性问题应沉淀到本 SOP 或项目 memory。

## 3. 验证命令矩阵

### 通用改动

```bash
npm run lint
npm run build
npm test
```

### 运维/健康检查相关

```bash
npm test -- __tests__/health-routes.test.ts __tests__/operations-pages.test.ts __tests__/monitoring-docs.test.ts
```

### 鉴权/后台

```bash
npm test -- __tests__/authing-jwt.test.ts __tests__/auth-user.test.ts __tests__/admin-api-guards.test.ts __tests__/admin-dashboard.test.ts
```

### 聊天/会话

```bash
npm test -- __tests__/chat-session-routes.test.ts __tests__/ai-task-trace.test.ts
```

### 作文/学习功能

```bash
npm test -- __tests__/essay-ai-suite.test.ts __tests__/worksheet-diagnosis.test.ts __tests__/vocab-card-workflow.test.ts
```

### 图像/媒体/OpenClaw

```bash
npm test -- __tests__/image-generation-config.test.ts __tests__/image-generation-routing.test.ts __tests__/openclaw-media.test.ts __tests__/openclaw-media-sign-route.test.ts __tests__/openclaw-slides-route.test.ts
```

### 支付/权益

```bash
npm test -- __tests__/credits.test.ts __tests__/payment-guards.test.ts __tests__/pricing.test.ts
```

## 4. 推荐提问模板

### 新功能

```text
读取 ai-essay-editor。按 SOP 调用 codebase-recon、architect、backend/frontend、qa。为 [功能] 制定计划并实现，最后运行相关测试。
```

### 修 bug

```text
读取 ai-essay-editor。按 SOP 调用 vibe-systematic-debugging、context-hunter、qa。这个问题是：[现象]。请先定位根因，再做最小修复和验证。
```

### UI 修改

```text
读取 ai-essay-editor。按 SOP 调用 frontend-design、frontend、webapp-testing。修改 [页面/组件]，保持现有业务逻辑不变，最后截图验证桌面和移动端。
```

### 支付/积分

```text
读取 ai-essay-editor。按 SOP 调用 security、vibe-security-threat-model、backend、qa。处理 [支付/积分/会员问题]，不要触碰生产数据，先给风险和验证方案。
```

### CI 失败

```text
读取 ai-essay-editor。按 SOP 调用 gh-fix-ci、ci-fixer、qa。检查当前 PR 的失败 CI，做最小修复并运行对应测试。
```

### 代码审查

```text
读取 ai-essay-editor。按 SOP 调用 reviewer、brooks-review、brooks-test、security。审查当前改动，优先列 bug、风险和测试缺口。
```

## 5. Codex 响应规范

每次开始任务时，Codex 应明确写出：

```text
本次任务类型：...
将调用 skill：...
先读取文件：...
验证命令：...
安全注意：...
八步流程当前阶段：问题分析 / 计划 / 方案 / 预验证 / 实施 / 验证 / 审查 / 交付
```

每次结束任务时，Codex 应明确写出：

```text
已修改：...
已验证：...
未验证/风险：...
建议下一步：...
```

如果没有调用 skill，必须说明原因。若 skill 名称和任务明显匹配但未触发，应手动点名使用。

## 6. 常见错误检查表

来自历史项目记忆，处理本项目问题时优先排查：

- 容器网络：修改网络配置后，必须验证所有相关容器能互通。
- 环境变量：新增变量后，必须同步 `.env.example`、部署文档、Docker/服务器运行说明；不得提交真实值。
- URL 拼接：检查 Base URL 是否已包含 `/v1` 等路径，避免重复拼接。
- 端口绑定：服务间通信不要在容器内误用 `127.0.0.1:port`；服务监听通常应为 `0.0.0.0`，容器互调用容器名。
- 流式输出：后端确认 `stream: true` 或等价配置，前端确认 `ReadableStream` 读取循环和 Markdown 增量渲染。
- 历史会话：检查 `ai_model`、session id、agent 参数和模型映射是否同步。
- UI 视觉升级：保持业务逻辑不变，避免全局样式污染，优先复用设计 token。

## 7. 发布前安全检查

发布、部署、合并 PR 前至少确认：

- [ ] 无硬编码 secrets、API key、password、service role key、数据库连接串。
- [ ] 用户输入已验证，错误消息不泄露敏感信息。
- [ ] SQL 使用参数化或 Supabase 安全 API。
- [ ] XSS 风险已处理，HTML 渲染经过净化或白名单限制。
- [ ] 认证和授权路径已覆盖测试。
- [ ] 支付回调签名校验未被削弱。
- [ ] 速率限制或滥用保护仍有效。
- [ ] `npm run lint`、`npm run build`、相关 Jest 测试已运行或说明未运行原因。
- [ ] 涉及 UI 的功能已在浏览器验证关键页面。
