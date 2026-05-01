# Codex Sprint 2A 技术指令：支付/订单/积分 schema 与 API 错误处理

## 任务背景

项目：shenxiang.school
本地路径：`/Users/aixingren/ai-essay-editor`
当前阶段：Sprint 2A

你是 Codex，只负责代码实现。Hermes 会在你完成后进行验收。你完成本阶段后必须停止，不得继续 Sprint 2B、Sprint 2C 或 Sprint 3。

## 本阶段目标

只处理支付 / 订单 / 积分链路中的 schema 字段兼容和 API 错误处理问题，避免因为引用不存在字段导致支付、订单查询、积分更新失败。

重点：
1. 检查并修复支付、订单、积分相关代码中的错误字段引用。
2. 让支付创建、订单状态查询、积分/会员读取在异常情况下返回清晰 JSON 错误。
3. 不泄露密钥、签名、token、service role key。
4. 不删除现有支付、订单、积分、用户、会员核心逻辑。

## 今天这个项目的硬边界限制

以下限制只针对当前项目 `/Users/aixingren/ai-essay-editor` 和本次 shenxiang.school Sprint 2A：

1. 不得创建、修改、删除 `services/essay-ai-suite/**`。
2. 不得创建或修改任何 1Panel 应用、1Panel app 包、release tar.gz。
3. 不得修改 `.github/workflows/**`。
4. 不得做 Docker、镜像、部署、CI/CD、服务打包相关工作。
5. 不得修改 `.env`、`.env.local`、`.env.production`。
6. 不得硬编码任何 API key、password、token、secret、Supabase service role key。
7. 不得把服务端密钥放入客户端组件。
8. 不得进入 Sprint 2B、Sprint 2C 或 Sprint 3。
9. 不得新增与本任务无关的新服务、新产品、新目录。
10. 不得为了构建通过而删除支付、订单、积分、用户、会员核心逻辑。

## 已知数据库 schema 事实

不要凭直觉假设字段存在。当前已知：

orders 表：
- `id`
- `order_no`
- `user_id`
- `product_id`
- `product_name`
- `amount`
- `credits_amount`
- `payment_method`
- `status`
- `trade_no`
- `created_at`
- `updated_at`

orders 表不要使用：
- `paid_at`，应使用 `updated_at` 表示支付完成/更新时间。
- `credits`，应使用 `credits_amount`。

user_credits 表：
- `user_id`
- `credits`
- `is_pro`
- `updated_at`

user_credits 表不要直接依赖：
- `membership_status`，如需要会员状态，应从 `is_pro` 兼容推导。
- `created_at`，如需要近似时间，用 `updated_at`。

credit_transactions 表：
- `id`
- `user_id`
- `amount`
- `type`
- `description`
- `balance_before`
- `balance_after`
- `created_at`

## 允许修改范围

优先只检查和修改这些路径：

- `app/api/payment/**`
- `app/api/stripe/**`
- `app/api/**/order*/**`
- `app/api/**/credit*/**`
- `app/api/**/membership*/**`
- `lib/**payment**`
- `lib/**order**`
- `lib/**credit**`
- `lib/products.ts`
- 与上述 API 直接相关的测试文件，例如 `__tests__/*payment*`、`__tests__/*order*`、`__tests__/*credit*`

如必须修改其他文件，必须在最终报告中说明原因。

## 具体任务

### A1. 全局检查错误字段引用

请搜索并检查：

- `paid_at`
- `orders.credits`
- `.credits` 是否错误用于 orders 行
- `membership_status`
- `user_credits.created_at`
- 任何对支付、订单、积分字段的可疑假设

需要修复的才修，不要机械替换导致业务逻辑变坏。

### A2. 支付创建 API 错误处理

检查：

- `app/api/payment/xunhupay/create/route.ts`
- `app/api/stripe/checkout-session/route.ts`

要求：

1. 缺少 userId / productId / 配置缺失 / 第三方支付失败时，返回清晰 JSON 错误。
2. 错误响应不得包含完整密钥、签名、token、secret。
3. 保留现有限流。
4. 保留现有支付方式，不得删除迅虎支付或 Stripe 入口。
5. 保留订单创建逻辑。

### A3. 订单状态 / 支付状态相关 API

检查是否已有订单状态或支付状态查询 API。

要求：

1. 订单不存在时返回合理 404 JSON。
2. 未登录或缺少 userId 时返回合理 401/400 JSON。
3. 查询订单时只使用真实存在字段。
4. 不泄露其他用户订单。

如果没有明确的订单状态 API，本阶段可以只修已有相关 API，不要大范围新建页面。

### A4. 积分 / 会员读取兼容

检查积分、会员、用户信用相关 API。

要求：

1. 读取 user_credits 时兼容 `is_pro`。
2. 不依赖不存在的 `membership_status`。
3. 不依赖不存在的 `created_at`。
4. 异常时返回清晰 JSON，而不是直接 500 空白。

### A5. 最小测试

如果项目已有 Jest 测试结构，请新增或补充最小测试，覆盖至少一项：

1. 订单字段使用 `credits_amount` 而不是 `credits`。
2. `paid_at` 不再被支付/订单逻辑引用。
3. 支付 API 配置缺失或参数缺失时返回安全错误。
4. 会员状态从 `is_pro` 兼容推导。

不要为了测试大改架构。

## 验收前自检命令

完成后请尽量运行：

```bash
npm run lint
npm run build
```

如果耗时或失败，必须在报告中说明失败原因和关键错误。

## 完成报告格式

完成后停止，并用中文报告：

1. 修改了哪些文件。
2. 每个文件解决了什么问题。
3. 是否发现并修复 `paid_at`、orders.`credits`、`membership_status`、user_credits.`created_at` 等字段问题。
4. 是否新增/修改测试，测试结果如何。
5. 是否运行 `npm run lint` / `npm run build`，结果如何。
6. 是否确认未修改 `.env*`、未创建 services/essay-ai-suite、未改 .github/workflows、未做 Docker/部署。
7. 遗留风险。

再次强调：完成 Sprint 2A 后必须停止，等待 Hermes 验收。不要继续下一阶段。
