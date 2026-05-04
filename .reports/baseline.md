# Baseline Report

执行时间：2026-05-04 04:xx Asia/Shanghai

## Git

- 当前分支：`ui-layout-refactor-keep-logic`
- 当前 commit：`08b5e6f96e5beb0e72cf330fa0a12adfd6a0ad80`
- 工作区已有改动：
  - `M .claude/scheduled_tasks.json`
  - `D .claude/scheduled_tasks.lock`
- 处理策略：上述 `.claude` 文件视为用户/系统已有改动，本次 UI 重构不触碰。

## 强制指南读取情况

- `AGENTS.md` 已读取。
- `AGENTS.md` 要求读取 `.Codex/memory/2026-04-04-skill-usage-guide.md`，但仓库中未找到该文件。
- `.Codex/memory/security-guardrails.md`、`.Codex/memory/2026-04-02-server-architecture.md`、`.Codex/memory/2026-04-02-sop-workflow.md` 同样未找到。
- 已按用户消息与 `AGENTS.md` 中列出的生产安全红线执行：不触碰容器清理、1Panel 基础设施、数据库持久化、网关配置，不修改业务逻辑。

## 包管理器与技术栈

- 包管理器：npm（存在 `package-lock.json`）
- 技术栈判断：Next.js 16 + TypeScript + Tailwind CSS 4 + React 18 + Docker + Supabase + Dify/AI API

## 可用 Scripts

- `npm run build`
- `npm run build:clean`
- `npm run dev`
- `npm run lint`
- `npm run start`
- `npm test`
- `npm run test:watch`
- `npm run deploy:check`
- 未发现 `typecheck` script。

## Baseline 检查结果

- `npm install`：通过，依赖已是最新。
- `npm run lint`：失败。原因：`sh: eslint: command not found`。`package.json` 有 lint 脚本但没有安装 `eslint` 依赖。
- `typecheck`：script 不存在。
- `npm test -- --runInBand`：通过。30 个 test suites、162 个 tests 全部通过。
- `npm run build`：通过。Next.js 16.1.1 编译、TypeScript、静态页面生成均通过；有既有提示：`middleware` 文件约定已 deprecated，建议未来迁移到 `proxy`。

## 主要页面路径

- 首页：`app/page.tsx`
- Chat：`app/chat/page.tsx`、`app/chat/[model]/page.tsx`
- 登录/注册：`app/auth/login/page.tsx`、`app/auth/sign-up/page.tsx`、`app/login/page.tsx`
- 价格/支付：`app/pricing/page.tsx`、`app/payment/page.tsx`、`app/checkout/[productId]/page.tsx`
- 用户页：`app/credits/page.tsx`、`app/history/page.tsx`、`app/settings/page.tsx`
- 内容页：`app/about/page.tsx`、`app/teacher/page.tsx`、`app/parent/page.tsx`、`app/help/page.tsx`
- 管理页：`app/admin/page.tsx`

## 主要组件路径

- 全局壳层：`components/app-shell.tsx`、`components/app-chrome.tsx`、`components/app-sidebar.tsx`
- 导航：`components/header.tsx`、`components/navigation/MobileNav.tsx`
- 首页模块：`components/home/*`
- 通用 UI：`components/ui/*`
- Chat UI：`components/chat/*`
- 品牌：`components/brand/Logo.tsx`

## 主色调来源初步判断

- `app/globals.css` 定义绿色主色：`--color-primary-500: #4CAF50`，并映射到 `--primary`。
- `lib/design-tokens.ts` 定义品牌绿色：`brandColors[500] = #22c55e`，深色为 `#14532d`。
- `components/app-sidebar.tsx` 内部 `COLORS.primary.main = #22C55E`。
- `app/layout.tsx` viewport `themeColor = #14532d`。
- 结论：现有品牌主色调为绿色/森林绿体系，本次只能围绕该主色扩展辅助色和中性色。

## 当前已有失败项

- `npm run lint` baseline failure：项目未安装 `eslint` binary。
- 未发现 baseline test/build failure。
