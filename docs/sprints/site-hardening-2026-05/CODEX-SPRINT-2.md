# Codex Sprint 2 技术指令：P0/P1 商业合规与支付闭环修复

项目路径：/Users/aixingren/ai-essay-editor
目标站点：shenxiang.school
执行者：Codex
验收者：Hermes

## 最高优先级约束

你只执行 Sprint 2。完成后必须停止，提交中文报告，不得继续 Sprint 3。

禁止事项：
1. 不得部署生产。
2. 不得修改 `.env.production`、`.env.local`、`.env`。
3. 不得硬编码任何密钥、token、password、connection string。
4. 不得把 Supabase service role key 或任何服务端密钥放到客户端组件。
5. 不得删除支付、订单、积分、用户、会员核心逻辑来通过构建。
6. 不得回滚 Sprint 0/1 已验收通过的安全修复，尤其是：
   - next.config.mjs 安全头
   - poweredByHeader: false
   - typescript.ignoreBuildErrors: false
   - lib/cors.ts / middleware.ts CORS 白名单逻辑
   - 管理后台 Bearer token 验证
   - 支付和后台验证接口限流
   - robots/sitemap 私密路径处理
7. 如发现问题超出 Sprint 2 范围，只记录在报告里，不要自行扩大改动。

## Sprint 2 目标

基于评估报告中的 P0/P1 商业合规和支付闭环问题，本阶段目标是：

1. 保证支付/订单/积分链路更稳，不因 schema 字段误用导致失败。
2. 让用户在购买、支付成功、查询订单状态时能得到明确反馈。
3. 补齐基础商业合规入口，尤其隐私、条款、退款、客服触达。
4. 清理明显会影响信任和转化的 footer/客服/政策链接问题。

## 当前基线说明

Sprint 0/1 已通过 Hermes 验收：
- npm run build 通过。
- npm run lint 无 error，仅有历史 warning。
- 首页、pricing、privacy、terms、refund-policy、chat、admin 等核心页面本地生产访问可用。
- 安全响应头已存在。
- CORS 白名单有效。
- 后台 API 需要 verifyAdminToken。
- .env.production 未被修改。

你必须在此基础上继续，不要破坏这些结果。

## 任务 A：支付和订单字段 schema 安全检查

背景：项目 Supabase 真实字段曾经出现过代码误用问题：
- orders 表没有 `paid_at`，支付完成时间应使用 `updated_at`。
- orders 表没有 `credits`，应使用 `credits_amount`。
- user_credits 表没有 `created_at`，只有 `updated_at`。
- user_credits 表没有 `membership_status` 字段时，代码应能从 `is_pro` 兼容推导，不应直接依赖不存在字段导致支付失败。

请检查并修复以下范围内的字段误用：
- app/api/payment/**
- app/api/user/**
- app/api/admin/**
- lib/products.ts
- 相关 payment/status、notify、checkout、credits、membership 逻辑

验收标准：
1. 不再引用明显不存在的 Supabase 字段：`orders.paid_at`、`orders.credits`、`user_credits.created_at`。
2. 如果需要 credits 数量，使用 `credits_amount` 或产品配置计算。
3. 支付成功通知不要因为字段不存在导致 500。
4. 用户积分/会员接口不要因为 optional 字段不存在导致 500。
5. 不得删除订单创建、订单状态更新、积分发放、交易记录写入逻辑。

## 任务 B：支付状态与错误反馈修复

检查并优化：
- app/api/payment/status/[orderNo]/route.ts
- app/payment/success/page.tsx 或相关成功页
- app/payment/wechat/[orderNo]/page.tsx
- app/api/payment/xunhupay/create/route.ts
- app/api/payment/xunhupay/notify/route.ts
- app/api/stripe/checkout-session/route.ts

要求：
1. 用户支付后能查询订单状态。
2. 订单不存在、未登录/缺 userId、支付配置缺失、第三方支付失败时，返回清晰 JSON 错误，不泄露密钥。
3. 支付成功页不要空白或无限 loading；至少给出“支付处理中/支付成功/订单未找到/联系客服”的明确状态。
4. 支付接口日志不要打印完整签名密钥或敏感 token。
5. 保持现有迅虎支付和 Stripe 入口可构建，不得删除任一支付方式。

## 任务 C：商业合规入口与客服信息

检查并修复：
- /privacy
- /terms
- /refund-policy
- Footer 相关组件：components/footer.tsx、components/home/Footer.tsx、components/home/HomeFooter.tsx
- pricing/payment 页面中可能出现的政策链接

要求：
1. Footer 中隐私政策、服务条款、退款政策链接可点击且真实存在。
2. 不要出现 href="#" 作为正式链接，除非是同页锚点且页面上确实存在目标 id。
3. 客服邮箱统一为 support@shenxiang.school。
4. 支付/定价附近应能找到退款政策或服务条款入口。
5. 不要编造 ICP 备案号。如果需要备案信息但无法确认，先不添加。

## 任务 D：新增或补强最小测试

在不大改测试框架的前提下，新增/补强最小测试，覆盖本 Sprint 的关键风险：
1. payment status route：订单不存在时返回合理错误。
2. xunhupay notify：字段使用不应包含 paid_at/credits 这类不存在字段。
3. footer/link：至少用静态测试或简单文本测试确认退款政策/隐私/条款链接存在。
4. 如果测试环境不适合直接调用 Supabase，使用 mock，不要访问真实生产数据库。

测试必须能通过 `npm test -- --runInBand <相关测试文件>`。

## 任务 E：验收命令

完成后请你自行运行：

```bash
npm run build
npm run lint
npm test -- --runInBand <你新增或修改的测试文件>
git diff --stat
git status --short
```

如果 lint 只有历史 warning，可以报告为 warning，不必为了本 Sprint 大范围修。

## 输出报告格式

完成后停止，并用中文输出：

1. 修改文件清单
2. 对应评估报告问题：逐条说明修复了什么
3. 未修复/延期问题
4. 验收命令和结果
5. 风险提醒
6. 明确说明：已停止，未进入 Sprint 3

## Hermes 验收门禁

你完成后不要继续下一阶段。Hermes 会重新检查：
- git diff --stat
- 关键 payment/admin/footer 文件 diff
- 是否误改 .env.production
- 是否硬编码密钥
- npm run build
- npm run lint
- 相关测试
- 本地页面和支付状态接口基本可用性

只有 Hermes 明确“验收合格”后，才允许进入 Sprint 3。
