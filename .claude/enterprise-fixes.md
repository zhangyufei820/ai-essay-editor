# 企业级风险修复清单

## P0-1: 管理后台鉴权改为服务端验证
- 创建 `app/api/admin/auth/route.ts`：服务端验证密码，返回 JWT token (使用 jsonwebtoken 或简易方案)
- 修改 `app/admin/page.tsx`：
  - 删除客户端硬编码密码 `ADMIN_PASSWORD`
  - 登录改为调用 `/api/admin/auth` POST 接口
  - 拿到 token 存 localStorage，后续请求带 token
  - 数据获取也改为带 token 请求
- 创建 `lib/admin-auth.ts`：验证 token 的工具函数

## P0-2: 给所有 API 路由补限流
当前只有 `app/api/chat/route.ts` 和 `app/api/essay-grade/route.ts` 有限流
需要补充的路由（共 29 个）：
- POST 类路由全部加 IP 限流 (30次/分)
- 支付相关路由更严格 (10次/分)
- 认证相关路由 (10次/分)
- GET 类路由暂时不加

具体路由清单：
1. app/api/auth/send-email-otp/route.ts (10次/分)
2. app/api/auth/sync/route.ts (30次/分)
3. app/api/auth/verify-email-otp/route.ts (10次/分)
4. app/api/chat-session/route.ts (30次/分)
5. app/api/dify-chat/route.ts (30次/分)
6. app/api/dify-upload/route.ts (10次/分) — 文件上传限流更严格
7. app/api/document-process/route.ts (30次/分)
8. app/api/essay-review/route.ts (30次/分)
9. app/api/ocr/route.ts (30次/分)
10. app/api/payment/status/[orderNo]/route.ts — GET 跳过
11. app/api/payment/xunhupay/create/route.ts (10次/分) — 支付创建
12. app/api/payment/xunhupay/notify/route.ts — 回调通知，跳过（支付平台IP固定）
13. app/api/presentation/route.ts (30次/分)
14. app/api/providers/route.ts — GET 跳过
15. app/api/referral/get-code/route.ts (30次/分)
16. app/api/referral/process/route.ts (30次/分)
17. app/api/save-essay-review/route.ts (30次/分)
18. app/api/save-message/route.ts (30次/分)
19. app/api/share/claim-reward/route.ts (10次/分)
20. app/api/share/route.ts (30次/分)
21. app/api/sparkpage/route.ts (30次/分)
22. app/api/suno/route.ts (30次/分)
23. app/api/tts/route.ts (30次/分)
24. app/api/user/credits/route.ts (30次/分)
25. app/api/user/membership/route.ts (30次/分)
26. app/api/user/transactions/route.ts (30次/分)
27. app/api/user/update/route.ts (30次/分)
28. app/api/web-search/route.ts (30次/分)
29. app/api/debug/init-tables/route.ts (10次/分) — 调试接口更严格
30. app/api/debug/orders/route.ts (10次/分) — 调试接口更严格

## P1-1: Sentry DSN 处理
方案：如果 NEXT_PUBLIC_SENTRY_DSN 环境变量未设置或仍为占位值，禁用 Sentry
- 修改 sentry.client.config.ts / sentry.server.config.ts / sentry.edge.config.ts
- 检查 dsn 是否为空或占位符，是则不调用 Sentry.init()

## P1-2: CSP 去掉 unsafe-eval
- 修改 next.config.mjs 的 CSP header
- 评估是否有必须 unsafe-eval 的场景（Turbopack 可能需要，如果去掉构建报错再加回来）

## 验证
每个任务完成后运行 `npm run build` 确认构建通过
