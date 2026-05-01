# CODEX Sprint 8 — 低风险 lint warning 清理（第一批）

## 背景

Sprint 7 已完成 SEO metadata 统一、提交、推送并部署生产。进入 Sprint 8 前，当前生产和远端均位于：

```text
fccbb585041a6b8cc0a9ca006dfd2c6f9565339a
```

重新运行 `npm run lint` 后仍有 63 个 warnings：

- 31 个 `@next/next/no-img-element`
- 16 个 `react-hooks/exhaustive-deps`
- 12 个 `react/no-unescaped-entities`
- 4 个 `@next/next/no-html-link-for-pages`

## Sprint 8 目标

先做低风险、可机械验证的一批，不碰支付、认证、后台权限、核心业务逻辑。

本 Sprint 清理：

1. `app/page.tsx` 中 4 个首页内部 `<a href="/chat/...">` 改为 Next.js `Link`。
2. 静态展示文案中的引号转义 warning：
   - `app/auth/sign-up/page.tsx`
   - `components/founder.tsx`
   - `components/home/TestimonialsSection.tsx`
   - `components/writer-styles.tsx`
   - `components/chat/SunoProFormDemo.tsx`
3. 明确不在本 Sprint 批量迁移 `<img>` 到 `next/image`，避免影响外链、尺寸、聊天消息渲染。
4. 明确不在本 Sprint 批量改 hooks dependencies，避免引入行为变化。

## 禁止事项

- 不修改 `.env.production`。
- 不改支付、订单、积分、会员、后台认证接口。
- 不删除生产服务器未跟踪文件。
- 不清理 orphan container。
- 不重试此前被拒绝的 GitHub API check-runs 查询。
- 不使用 `docker exec shenxiang-nextjs ...` 路径做验证。

## 验收门禁

必须全部通过：

1. `npm run lint` warning 数量下降，且 4 个 `@next/next/no-html-link-for-pages` 清零。
2. 本 Sprint 触达的 `react/no-unescaped-entities` 清零。
3. 全量 Jest 通过。
4. `npm run build` 成功。
5. `git diff --stat` 和逐文件 diff 审计，确认范围只包含 Sprint 8 文件。
6. changed/staged/push range 密钥扫描无命中。
7. commit、push 后部署生产。
8. 生产复验首页、核心页面状态码、安全头、容器 healthy、`/api/health = 200`。
