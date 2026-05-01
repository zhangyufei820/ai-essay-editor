# Codex Sprint 4 技术指令：管理后台与数据运营能力加固

项目：shenxiang.school（沈翔智学）
本地路径：`/Users/aixingren/ai-essay-editor/`
技术栈：Next.js / TypeScript / Tailwind / Supabase
目标站点：shenxiang.school

你是 Codex，负责代码实现。Hermes 负责验收和是否放行下一 Sprint。

## 0. 当前状态

已验收合格：

- Sprint 0/1
- Sprint 2A
- Sprint 2B
- Sprint 2C
- Sprint 3

现在只执行 Sprint 4。
完成后必须停止，输出中文报告，等待 Hermes 验收。

不要进入 Sprint 5。
不要部署生产。
不要 git commit / git push。

## 1. Sprint 4 目标

把管理后台从“能打开”提升到“能用于日常运营排查”。

本阶段重点解决：

1. 管理后台核心页面信息更完整、更好用。
2. 用户、订单、积分/会员状态展示更准确。
3. 后台 API 继续保持服务端鉴权和限流，不能降低安全性。
4. 后台对空数据、请求失败、字段缺失有清晰中文提示。
5. 增加轻量测试，防止未来误删后台鉴权、误用不存在的数据库列。

## 2. 允许修改的范围

优先只修改或新增以下范围内的文件：

### 管理后台页面
- `app/admin/page.tsx`
- `app/admin/layout.tsx`
- `components/admin/**`（如果需要拆小组件可以新建，但不要大规模重写）

### 管理后台 API
- `app/api/admin/auth/route.ts`
- `app/api/admin/verify/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/orders/route.ts`
- `app/api/admin/user-details/route.ts`
- `lib/admin-auth.ts`
- `lib/rate-limit.ts`（仅限后台接口限流相关小修）

### 数据读取辅助
- `lib/credits.ts`（仅限后台展示需要，不能破坏支付/积分主流程）

### 测试
- `__tests__/admin-auth.test.ts`
- `__tests__/admin-api-guards.test.ts`
- `__tests__/admin-dashboard.test.ts`
- 或现有后台相关测试文件

### 指令文件
- `CODEX-SPRINT-4.md`

如果确实需要改其他文件，必须在报告中说明原因；原则上不要改。

## 3. 绝对禁止事项

本 Sprint 严禁：

1. 不得部署生产。
2. 不得修改 `.env` / `.env.local` / `.env.production`。
3. 不得读取、输出、硬编码真实密钥、token、password、API key、service role key、数据库连接串。
4. 不得创建、修改、删除 `services/essay-ai-suite/**`。
5. 不得创建或修改任何 1Panel 应用、1Panel app 包、release tar.gz。
6. 不得修改 `.github/workflows/**`。
7. 不得做 Docker、镜像、部署、CI/CD、服务打包相关工作。
8. 不得删除支付、订单、积分、用户、会员相关核心逻辑来通过构建。
9. 不得降低 `/api/admin/*` 的服务端鉴权要求。
10. 不得把管理员认证改成纯前端校验。
11. 不得进入 Sprint 5。
12. 不得 git commit / git push。

这些限制只针对当前项目 `/Users/aixingren/ai-essay-editor/` 的本次 Sprint。

## 4. 数据库 Schema 注意事项（非常重要）

不要凭感觉写列名。已知 Supabase 实际列名如下：

### orders 表
可用列：

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

不要使用不存在的列：

- `paid_at` 不存在，用 `updated_at` 表示支付完成/更新时间。
- `credits` 不存在，用 `credits_amount`。

### user_credits 表
可用列：

- `user_id`
- `credits`
- `is_pro`
- `updated_at`

不要使用不存在或不可靠的列：

- `created_at` 不存在。
- `membership_status` 不存在，从 `is_pro` 动态推导。

### credit_transactions 表
可用列：

- `id`
- `user_id`
- `amount`
- `type`
- `description`
- `balance_before`
- `balance_after`
- `created_at`

## 5. 具体任务

### 5.1 后台首页/仪表盘体验

检查并改进 `app/admin/page.tsx`：

1. 保留现有登录/鉴权流程，不降低安全性。
2. 优化加载中、空状态、请求失败状态的中文提示。
3. 后台至少清晰展示：
   - 总用户数或近似用户数
   - 订单数量
   - 已支付订单数量或收入数据
   - 积分/会员相关概览（如果已有接口支持）
4. 如果接口返回字段为空或异常，不应白屏；显示“暂无数据”或“加载失败，请稍后重试”。
5. 关键操作区给运营人员明确下一步：查看用户、查看订单、复制订单号、联系客服排查等。
6. 不要重写整个后台，不要引入新依赖。

### 5.2 后台 API 鉴权与错误处理复核

检查以下接口：

- `app/api/admin/verify/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/orders/route.ts`
- `app/api/admin/user-details/route.ts`

要求：

1. 所有后台数据接口必须在服务端校验 admin token。
2. 未授权时返回 401 或合理错误 JSON。
3. 请求失败时返回中文或可理解的错误信息，不泄露密钥、完整连接串、内部堆栈。
4. 保持或补充合理限流，尤其是认证/后台接口。
5. 不要让前端传 user_id 就能绕过鉴权拿数据。

### 5.3 用户列表与用户详情

如果已有用户列表/详情能力，做小修增强：

1. 用户列表展示 user_id、积分、会员状态、最近更新时间等已有字段。
2. 会员状态从 `is_pro` 推导，不要读不存在的 `membership_status`。
3. 注册时间若无真实字段，不要伪造；可显示“暂无注册时间”或使用 `updated_at` 并注明“最近更新”。
4. 用户详情可展示该用户相关订单与积分流水（如果已有接口支持）。
5. 数据为空时要有友好提示。

### 5.4 订单列表

检查并增强订单展示：

1. 使用 `credits_amount` 展示积分数量，不要用不存在的 `credits`。
2. 使用 `updated_at` 展示支付/更新时间，不要用不存在的 `paid_at`。
3. 显示订单号、用户 ID、产品名、金额、支付方式、状态、创建时间/更新时间。
4. 对不同订单状态有清晰中文标签。
5. 数据为空时提示“暂无订单”。
6. 错误时提示运营人员保留订单号、支付时间、用户 ID 便于排查。

### 5.5 最小测试

新增或补齐轻量测试。优先使用 Jest 读取源码/路由函数，不依赖真实 Supabase 网络。

建议覆盖：

1. 后台 API 源码包含服务端鉴权调用，例如 `verifyAdminToken` 或等效逻辑。
2. 后台 API 不引用不存在的列名：`paid_at`、`membership_status`。
3. 订单相关源码使用 `credits_amount` 而不是错误的 `credits` 订单列。
4. 后台页面源码包含关键中文状态文案：加载、暂无数据、加载失败、订单号、用户 ID。
5. `.env*` 不被测试读取或输出。

测试文件可以命名为：

- `__tests__/admin-api-guards.test.ts`
- `__tests__/admin-dashboard.test.ts`

## 6. 验收前请你自己运行

如果本地依赖可用，完成后请运行：

```bash
npm run lint
npm run build
npm test -- --runInBand __tests__/admin-api-guards.test.ts __tests__/admin-dashboard.test.ts
```

如果测试文件名不同，请运行对应测试。

注意：不要把 `npm run build` 与 Jest 并行跑；构建会改写 `.next`。

## 7. 完成报告格式（必须中文）

完成 Sprint 4 后停止，不要继续下一阶段。

请用中文报告：

1. 修改了哪些文件。
2. 每个文件做了什么。
3. 执行了哪些命令，结果如何。
4. 是否触碰禁止范围：必须明确回答“没有”。
5. 是否发现风险或遗留问题。
6. 明确写：`Sprint 4 已完成，等待 Hermes 验收，未进入 Sprint 5。`
