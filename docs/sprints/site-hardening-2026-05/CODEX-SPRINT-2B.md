# Codex Sprint 2B 技术指令：支付状态页 / 支付结果反馈闭环

## 背景

项目：shenxiang.school（沈翔智学）
本地路径：`/Users/aixingren/ai-essay-editor/`
技术栈：Next.js / TypeScript / Supabase / Tailwind

当前阶段：
- Sprint 0/1 已由 Hermes 验收合格。
- 原整包 Sprint 2 已失败并中止，不得继续沿用。
- Sprint 2A 已由 Hermes 验收合格：支付/订单/积分 schema 与 API 错误处理已完成。
- 本次只执行 Sprint 2B。

## Sprint 2B 目标

修复用户支付后的“看不懂 / 不知道是否成功 / 不知道下一步去哪”的闭环问题。

重点是支付状态页、支付结果反馈、轮询状态、失败/处理中展示、跳转入口。

用户支付完成后，应该能清楚看到：
1. 当前订单状态：支付成功 / 支付处理中 / 支付失败 / 订单不存在。
2. 成功后获得了什么：产品名、积分数量、订单号、支付金额。
3. 下一步去哪：前往聊天 / 查看积分 / 返回定价页 / 联系客服。
4. 如果支付处理中：自动轮询订单状态并提示稍后刷新。
5. 如果失败或查不到：展示友好错误，不泄露后端异常。

## 严格范围

允许修改的范围优先限于：
- `app/payment/**`
- `app/api/payment/status/[orderNo]/route.ts`
- 支付成功/微信支付状态相关页面组件
- 必要的轻量 UI 组件或文案
- 必要的测试文件

如确实需要修改其它文件，必须在最终报告中说明原因。

## 今天此项目的硬边界（必须遵守）

以下限制仅针对今天这个项目 `/Users/aixingren/ai-essay-editor` 的 shenxiang.school Sprint 2B，不是全局规则：

1. 不得部署生产。
2. 不得修改 `.env` / `.env.local` / `.env.production`。
3. 不得硬编码任何密钥、token、password、API key、Supabase service role key、连接串。
4. 不得创建、修改、删除 `services/essay-ai-suite/**`。
5. 不得创建或修改任何 1Panel 应用、1Panel app 包、release tar.gz。
6. 不得修改 `.github/workflows/**`。
7. 不得做 Docker、镜像、部署、CI/CD、服务打包相关工作。
8. 不得进入 Sprint 2C / Sprint 3。
9. 不得删除支付、订单、积分、用户、会员核心逻辑来通过构建。
10. 不得把服务端密钥暴露给客户端。

## 已知 schema 约束

不要凭想象引用不存在字段。

orders 表实际字段：
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

常见错误：
- 不要用 `orders.paid_at`，实际应使用 `updated_at`。
- 不要用 `orders.credits`，实际应使用 `credits_amount`。

user_credits 表实际字段：
- `user_id`
- `credits`
- `is_pro`
- `updated_at`

credit_transactions 表实际字段：
- `id`
- `user_id`
- `amount`
- `type`
- `description`
- `balance_before`
- `balance_after`
- `created_at`

## 具体任务

### 1. 检查现有支付状态 API

重点检查：
- `app/api/payment/status/[orderNo]/route.ts`

要求：
- GET 根据 orderNo 查询订单状态。
- 只返回前端需要的安全字段。
- 不返回原始数据库错误、密钥、内部堆栈。
- 订单不存在返回 404 + 友好 JSON。
- 缺少 Supabase 配置返回 503 + 友好 JSON。
- 成功返回字段建议包括：
  - `orderNo`
  - `status`
  - `productName`
  - `amount`
  - `creditsAmount`
  - `paymentMethod`
  - `updatedAt`
  - `createdAt`

### 2. 优化支付成功页

重点检查：
- `app/payment/success/page.tsx`
- 如果项目使用其它 payment result 页面，也一并检查。

要求：
- 从 URL query 中读取订单号，例如 `orderNo` / `order_no` / `out_trade_no` 等已有项目约定。
- 如果有订单号，调用 `/api/payment/status/[orderNo]` 查询状态。
- 支持 loading / paid / pending / failed / not_found / error 等状态。
- 对 paid 展示：
  - 支付成功
  - 产品名
  - 积分数量
  - 订单号
  - 支付金额
  - 按钮：开始使用 / 查看积分 / 返回首页或定价页
- 对 pending 展示：
  - 支付处理中
  - 说明“微信/支付平台回调可能有延迟”
  - 自动轮询几次，例如每 3 秒一次，最多 10 次；也可以提供“手动刷新”按钮。
- 对 failed / not_found / error 展示：
  - 友好说明
  - 返回定价页
  - 联系客服邮箱：support@shenxiang.school
- 不要让用户看到原始 exception message。

### 3. 检查微信支付页

重点检查：
- `app/payment/wechat/[orderNo]/page.tsx`

要求：
- 如果页面已有二维码/支付状态展示，确保用户知道下一步：
  - 支付后可点击“我已支付，检查状态”
  - 或自动轮询 `/api/payment/status/[orderNo]`
  - paid 后跳转或提示进入 success 页面
- 不做大重构，优先最小修改。

### 4. 最小测试

如项目已有 Jest/测试基础，添加或更新最小测试，优先覆盖：
- payment status API 缺少/不存在订单的安全响应
- success 页面关键状态文案（如测试成本太高，可只测 API）

不要为了测试大改架构。

## 验收标准

完成后必须满足：

1. `npm run build` 通过。
2. `npm run lint` 无 error；已有 warning 可保留。
3. 相关测试通过。
4. `.env*` 无修改。
5. 无新增密钥、token、password、连接串。
6. 未修改 out-of-scope 路径：
   - `services/essay-ai-suite/**`
   - `.github/workflows/**`
   - Docker / 1Panel / release 包
7. 支付成功页用户体验闭环清晰。
8. API 错误响应安全，不泄露内部异常。

## 完成后报告格式

完成 Sprint 2B 后请停止，不要继续 Sprint 2C / Sprint 3。

用中文报告：

1. 修改了哪些文件。
2. 每个文件改了什么。
3. 执行了哪些命令。
4. build / lint / test 结果。
5. 是否有风险或遗留问题。
6. 明确写：`Sprint 2B 已完成，等待 Hermes 验收。`
