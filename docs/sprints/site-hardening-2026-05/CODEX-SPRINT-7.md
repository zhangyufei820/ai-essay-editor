# CODEX Sprint 7 — 发布后 SEO 文案统一与运维收尾

## 背景

Sprint 0/1 到 Sprint 6 已完成、提交、推送并部署生产。生产浏览器验证已显示新版首页定位：

- `AI 作文批改 · 写作提分工具`
- `上传作文，AI 逐段批改、指出问题、给出提分建议`

发布后复核发现一个非阻塞但应该收尾的问题：raw HTML / metadata 仍保留旧定位 `沈翔智学智能体广场（含各学段中英文作文批改）` 与偏旧的描述文案。这会影响搜索结果、分享卡片、浏览器标题与 SEO 一致性。

## 目标

把全站 metadata / Open Graph / Twitter / Schema.org 的核心定位统一到“AI 作文批改 · 写作提分工具”，让搜索、分享、页面内容三者一致。

## 范围

只允许修改：

- `app/layout.tsx`
- 必要的最小回归测试文件（如新增/修改 `__tests__/metadata.test.ts`）
- 本 Sprint 文档本身

禁止修改：

- `.env.production`
- 支付金额、产品价格、积分/会员核心逻辑
- `app/api/payment/*`
- `lib/xunhupay.ts`
- `lib/credits.ts`
- 生产服务器未跟踪文件

## 验收要求

1. 本地测试通过：相关 metadata 测试通过。
2. 全量 Jest 通过。
3. lint：0 errors；既有 warnings 可记录但不阻塞。
4. build 成功。
5. diff 审计：只包含 Sprint 7 范围内文件。
6. 密钥扫描：不得出现真实 API key、token、password、connection string。
7. 部署后生产验证：
   - 首页 HTTP 200。
   - raw HTML `<title>` / metadata 不再出现 `智能体广场`。
   - raw HTML 或 metadata 包含 `AI作文批改` / `写作提分` 等新版定位关键词。
   - 容器 healthy。

## 备注

本 Sprint 属于发布后低风险收尾，不改变业务逻辑，只统一 SEO/分享/结构化数据文案。
