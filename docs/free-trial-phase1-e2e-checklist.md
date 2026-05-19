# 60 天共创体验计划 Phase 1 E2E 手动验收清单

本文档用于测试库或本地联调环境验收“沈翔智学 60 天共创体验计划”第一阶段。不要在文档、命令历史或聊天工具中粘贴真实 service role key、数据库连接串、支付密钥或用户隐私数据。

建议先准备 3 个测试账号：

- `trial_new_user`：未领取体验的新用户。
- `paid_user`：已有会员或 `user_credits.is_pro = true` 的付费用户。
- `non_trial_user`：未领取体验的普通用户，用于回归原扣费逻辑。

## 1. 环境变量检查

操作步骤：

1. 在本地或测试环境确认 `.env.local` / 测试环境变量已配置。
2. 检查 Supabase、cron、admin、Dify、积分相关变量是否存在。
3. 不输出变量值，只检查变量名是否存在。

预期结果：

- `NEXT_PUBLIC_SUPABASE_URL` 或 `SUPABASE_URL` 存在。
- `SUPABASE_SERVICE_ROLE_KEY` 仅服务端可用，不会暴露到客户端。
- `CRON_SECRET` 或 `TRIAL_BATCH_CRON_SECRET` 存在。
- 原有 AI、积分、鉴权相关变量保持不变。

相关 API 或 SQL：

```bash
node -e "for (const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET']) console.log(k, process.env[k] ? 'set' : 'missing')"
```

失败时排查方向：

- 变量缺失时先补测试环境配置，不要改代码绕过校验。
- 确认客户端页面没有读取 `SUPABASE_SERVICE_ROLE_KEY`。
- 如果 cron API 返回 401，优先检查 secret 名称和请求 header。

## 2. Supabase Migration 检查

操作步骤：

1. 在 Supabase 测试库 SQL Editor 执行 `supabase/migrations/005_free_trial_and_surveys.sql`。
2. 执行完成后重复执行一次，验证幂等性。
3. 检查表、RLS、policy、视图是否存在。

预期结果：

- 5 张表创建成功。
- `user_trial_status` 和 `daily_trial_metrics` 可直接查询。
- 重复执行不会因 policy、trigger、view、seed 冲突失败。

相关 API 或 SQL：

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'free_trial_grants',
    'survey_templates',
    'survey_responses',
    'trial_credit_usages',
    'trial_reward_events'
  )
ORDER BY table_name;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'free_trial_grants',
    'survey_templates',
    'survey_responses',
    'trial_credit_usages',
    'trial_reward_events'
  )
ORDER BY tablename;

SELECT * FROM public.user_trial_status LIMIT 10;
SELECT * FROM public.daily_trial_metrics LIMIT 10;
```

失败时排查方向：

- 如果 policy 冲突，确认 migration 使用 `DROP POLICY IF EXISTS` 后再创建。
- 如果视图查询失败，检查表字段是否完整创建。
- 如果日期不符合预期，检查 `public.trial_local_date()` 是否返回中国自然日。

## 3. 问卷模板 Seed 检查

操作步骤：

1. 执行 seed 脚本。
2. 重复执行 seed 脚本。
3. 查询 3 个模板是否存在且仍只有 3 个目标 key。

预期结果：

- `onboarding_v1`、`daily_v1`、`weekly_v1` 均存在。
- 重复执行只更新，不重复插入。
- 每个模板最多 5 题。

相关 API 或 SQL：

```bash
node scripts/seed-survey-templates.mjs
node scripts/seed-survey-templates.mjs
```

```sql
SELECT template_key, cadence, active, sort_order, jsonb_array_length(questions_json) AS question_count
FROM public.survey_templates
WHERE template_key IN ('onboarding_v1', 'daily_v1', 'weekly_v1')
ORDER BY sort_order;
```

失败时排查方向：

- 如果脚本缺少环境变量，回到第 1 项检查。
- 如果重复插入，检查 `survey_templates.template_key` unique constraint 和 upsert。
- 如果题目超过 5 个，检查 migration 和 seed 脚本内容是否一致。

## 4. 未登录访问活动页

操作步骤：

1. 使用无登录态浏览器或隐身窗口打开 `/campaign/free-trial`。
2. 查看页面标题、副标题、规则、数据说明。
3. 点击 CTA。

预期结果：

- 页面可访问。
- 显示“沈翔智学 60 天共创体验计划”。
- CTA 引导登录或注册。
- 不触发体验领取 API。

相关 API 或 SQL：

```bash
curl -I http://127.0.0.1:3000/campaign/free-trial
```

失败时排查方向：

- 如果 404，检查 `app/campaign/free-trial/page.tsx` 是否存在并编译。
- 如果未登录也调用领取接口，检查页面 CTA 状态判断。
- 如果页面泄露内部错误，检查前端 API 错误处理。

## 5. 登录后领取体验

操作步骤：

1. 使用 `trial_new_user` 登录。
2. 打开 `/campaign/free-trial`。
3. 点击“立即领取”。
4. 查询 `free_trial_grants`。

预期结果：

- `POST /api/free-trial/claim` 返回 `ok: true`。
- 创建 1 条 `grant_type = 'campaign'`、`status = 'active'` 的 grant。
- `daily_quota = 2000`。
- `requires_daily_survey = true`。
- `end_at` 约等于领取时间后 60 天。

相关 API 或 SQL：

```bash
curl -X POST http://127.0.0.1:3000/api/free-trial/claim \
  -H "Cookie: <logged-in-cookie>"
```

```sql
SELECT user_id, grant_type, status, daily_quota, requires_daily_survey, start_at, end_at
FROM public.free_trial_grants
WHERE user_id = '<trial_new_user_id>'
ORDER BY created_at DESC;
```

失败时排查方向：

- 401：检查登录态和 `requireUser`。
- 500：检查 service role key、RLS、表是否已创建。
- 没有记录：检查 `claimFreeTrial` 是否返回已有 grant 或写入失败。

## 6. 重复领取不会重复创建 Active Grant

操作步骤：

1. 对同一 `trial_new_user` 再次点击“立即领取”。
2. 连续请求 2-3 次 claim API。
3. 查询 active campaign grant 数量。

预期结果：

- API 仍返回 `ok: true`。
- 同一用户 active campaign grant 不重复增加。
- 返回状态应指向已有 active grant。

相关 API 或 SQL：

```sql
SELECT user_id, COUNT(*) AS active_campaign_grants
FROM public.free_trial_grants
WHERE user_id = '<trial_new_user_id>'
  AND grant_type = 'campaign'
  AND status = 'active'
  AND NOW() >= start_at
  AND NOW() < end_at
GROUP BY user_id;
```

失败时排查方向：

- 如果 count 大于 1，检查 `getActiveTrialGrant` 和 `grantFreeTrial` 的先查后写逻辑。
- 并发重复时后续可考虑增加 partial unique index，本阶段先记录风险。

## 7. 今日未填问卷时作文批改被 Survey Required 阻断

操作步骤：

1. 确保 `trial_new_user` 今日没有 `survey_responses`。
2. 使用作文批改入口提交一篇作文。
3. 观察 API 响应。

预期结果：

- 作文批改请求被阻断。
- HTTP 状态为 402 或 403。
- body 包含 `surveyRequired: true`。
- 不写入 `trial_credit_usages`。
- 不扣真实积分。

相关 API 或 SQL：

```sql
DELETE FROM public.survey_responses
WHERE user_id = '<trial_new_user_id>'
  AND survey_date = public.trial_local_date();

SELECT * FROM public.trial_credit_usages
WHERE user_id = '<trial_new_user_id>'
  AND usage_date = public.trial_local_date();
```

失败时排查方向：

- 如果没有阻断，检查作文批改是否走到已接入的 `/api/chat` 作文分支。
- 如果扣了真实积分，检查 `consumeWithTrialCredits` 的 `survey_required` 分支。
- 如果状态码不对但 body 正确，检查 route 错误映射。

## 8. 提交今日问卷

操作步骤：

1. 调用 `/api/surveys/today` 获取今日模板。
2. 用页面弹窗或 API 提交答案。
3. 查询 `survey_responses`。

预期结果：

- `/api/surveys/today` 返回 active daily template。
- `/api/surveys/submit` 返回 `ok: true`、`qualityScore`、`streakDay`。
- 同一用户今日只能有 1 条 response。

相关 API 或 SQL：

```bash
curl http://127.0.0.1:3000/api/surveys/today \
  -H "Cookie: <logged-in-cookie>"

curl -X POST http://127.0.0.1:3000/api/surveys/submit \
  -H "Cookie: <logged-in-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"answers":{"used_feature":["作文批改"],"satisfaction":5,"best_part":"报告清楚","friction":"","tomorrow_intent":"愿意"},"metadata":{"durationSeconds":30,"source":"manual_e2e"}}'
```

```sql
SELECT user_id, survey_date, quality_score, streak_day, answers_json
FROM public.survey_responses
WHERE user_id = '<trial_new_user_id>'
ORDER BY created_at DESC;
```

失败时排查方向：

- 400：检查 answers 是否为对象。
- 500：检查模板是否存在、unique constraint 是否冲突处理正确。
- 质量分异常：检查 `metadata.durationSeconds` 和开放题答案。

## 9. 再次作文批改，Trial 额度内不扣真实积分

操作步骤：

1. 确保今日已提交问卷。
2. 记录当前真实积分余额。
3. 提交一次预计消耗小于 2000 trial 积分的作文批改。
4. 查询 trial 消耗和真实积分余额。

预期结果：

- 作文批改正常返回原业务结果。
- response metadata 中 `billing.trialUsed > 0`。
- `billing.realCreditsUsed = 0`。
- `trial_credit_usages` 写入一条记录。
- `user_credits.credits` 不减少。

相关 API 或 SQL：

```sql
SELECT credits
FROM public.user_credits
WHERE user_id = '<trial_new_user_id>';

SELECT usage_date, action_type, amount, reference_id
FROM public.trial_credit_usages
WHERE user_id = '<trial_new_user_id>'
  AND usage_date = public.trial_local_date()
ORDER BY created_at DESC;
```

失败时排查方向：

- 如果真实积分减少，检查 `remainingToday >= amount` 分支。
- 如果没有 trial usage，检查 `recordTrialCreditUsage` 是否被调用。
- 如果返回结构缺少 billing，检查作文批改 response merge。

## 10. 超过 2000 Trial 额度后，超额扣真实积分

操作步骤：

1. 为 `trial_new_user` 构造今日已用 trial 接近 2000 的状态。
2. 记录真实积分余额。
3. 发起一次作文批改，使 amount 超过剩余额度。
4. 查询 trial usage 和真实积分余额。

预期结果：

- 剩余 trial 额度先被用完。
- 超出部分调用原 `spendCredits`。
- `billing.trialUsed` 等于请求前剩余 trial。
- `billing.realCreditsUsed > 0`。
- `remainingToday = 0`。

相关 API 或 SQL：

```sql
SELECT *
FROM public.user_trial_status
WHERE user_id = '<trial_new_user_id>';

SELECT credits
FROM public.user_credits
WHERE user_id = '<trial_new_user_id>';
```

失败时排查方向：

- 如果超额未扣真实积分，检查 `consumeWithTrialCredits` 的 overage 分支。
- 如果 trial 用量超过 daily quota，检查 remaining 计算。
- 如果真实积分不足但 API 未报错，检查 `spendCredits` 原错误处理。

## 11. 已付费用户不被问卷强制阻断原权益

操作步骤：

1. 使用 `paid_user` 登录。
2. 确认该用户是会员或 `user_credits.is_pro = true`。
3. 不提交今日问卷，使用原有会员权益功能。
4. 如已给该用户创建 `paid_extension` grant，检查 `requires_daily_survey = false`。

预期结果：

- 已付费用户原权益不下降。
- 自愿问卷可以提交，但不应成为原会员权益的硬门槛。
- `paid_extension` 类型 grant 不要求每日问卷。

相关 API 或 SQL：

```sql
SELECT user_id, credits, is_pro, membership_status
FROM public.user_credits
WHERE user_id = '<paid_user_id>';

SELECT grant_type, status, requires_daily_survey, start_at, end_at
FROM public.free_trial_grants
WHERE user_id = '<paid_user_id>'
ORDER BY created_at DESC;
```

失败时排查方向：

- 如果付费用户被 survey 阻断，检查调用点是否错误地把所有付费权益都接到 trial gate。
- 如果 `paid_extension` 仍要求问卷，检查 `extendPaidMembershipsByDays`。
- 如果原权益扣费异常，回归 `spendCredits` 和会员判断。

## 12. Admin Dashboard 正常出数

操作步骤：

1. 使用 admin 登录 `/admin`。
2. 切换到“共创体验”tab。
3. 检查 6 个指标卡和最近开放反馈。
4. 调用 dashboard API 验证返回。

预期结果：

- admin 页面能加载。
- 指标包含累计领取、今日活跃、问卷提交、完成率、trial 消耗、平均质量分。
- 最近反馈只显示脱敏 user_id。
- 非 admin 请求返回 401。

相关 API 或 SQL：

```bash
curl http://127.0.0.1:3000/api/admin/trial-dashboard \
  -H "Authorization: Bearer <admin-token>"
```

```sql
SELECT * FROM public.daily_trial_metrics LIMIT 10;
SELECT * FROM public.user_trial_status LIMIT 10;
```

失败时排查方向：

- 401：检查 admin token 和 `verifyAdminToken`。
- 500：检查 migration 是否执行、视图是否能查询。
- 前端空白：检查浏览器控制台和 `/api/admin/trial-dashboard` response。

## 13. Batch Grant Dry Run 不写库

操作步骤：

1. 记录执行前 `free_trial_grants` 总数。
2. 调用 batch grant API，body 中 `dryRun: true`。
3. 再次查询总数。

预期结果：

- API 返回 `dryRun: true`。
- 返回扫描数、预计发放数。
- `free_trial_grants` 总数不变。

相关 API 或 SQL：

```bash
curl -X POST http://127.0.0.1:3000/api/cron/trial-batch-grant \
  -H "Authorization: Bearer <cron-secret>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"includeExistingUsers":true,"extendPaidMemberships":true,"days":60}'
```

```sql
SELECT COUNT(*) FROM public.free_trial_grants;
```

失败时排查方向：

- 如果 dry run 写库，检查 `runDryRun` 是否调用写入函数。
- 如果 401，检查 `CRON_SECRET` / `TRIAL_BATCH_CRON_SECRET`。
- 如果扫描数为 0，检查测试库 `user_credits` 和 `orders` 是否有数据。

## 14. Batch Grant Apply 才写库

操作步骤：

1. 在测试库准备至少 1 个没有 active campaign grant 的用户。
2. 调用 batch grant API，body 中 `dryRun: false`。
3. 查询新创建的 campaign grant。

预期结果：

- API 返回 `dryRun: false`。
- `trialsGranted` 大于 0。
- 新增 `grant_type = 'campaign'` 的 active grant。
- 已有 active grant 的用户被跳过。

相关 API 或 SQL：

```bash
curl -X POST http://127.0.0.1:3000/api/cron/trial-batch-grant \
  -H "Authorization: Bearer <cron-secret>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"includeExistingUsers":true,"extendPaidMemberships":true,"days":60}'
```

```sql
SELECT user_id, grant_type, status, daily_quota, requires_daily_survey, created_at
FROM public.free_trial_grants
WHERE metadata->>'source' IN ('trial_batch_grant', 'backend_library')
ORDER BY created_at DESC
LIMIT 20;
```

失败时排查方向：

- 如果没有写入，检查 `includeExistingUsers` 是否为 true。
- 如果重复发放，检查 active grant 查询逻辑。
- 如果 paid extension 失败，检查 `orders.product_id` 和 `user_credits.is_pro` 数据。

## 15. 回归检查：普通非 Trial 用户仍然走原扣费逻辑

操作步骤：

1. 使用 `non_trial_user` 登录。
2. 确认该用户没有 active trial grant。
3. 记录真实积分余额。
4. 执行一次作文批改。
5. 查询真实积分和 trial usage。

预期结果：

- 不要求填写 trial 问卷。
- 仍走原 `spendCredits` 扣真实积分逻辑。
- 不写入 `trial_credit_usages`。
- 原业务结果结构保持可用。

相关 API 或 SQL：

```sql
SELECT *
FROM public.free_trial_grants
WHERE user_id = '<non_trial_user_id>'
  AND status = 'active'
  AND NOW() >= start_at
  AND NOW() < end_at;

SELECT credits
FROM public.user_credits
WHERE user_id = '<non_trial_user_id>';

SELECT *
FROM public.trial_credit_usages
WHERE user_id = '<non_trial_user_id>'
ORDER BY created_at DESC
LIMIT 10;
```

失败时排查方向：

- 如果非 trial 用户被 survey 阻断，检查 trial gate 是否误判 active grant。
- 如果没有扣真实积分，检查 fallback 到 `spendCredits` 的分支。
- 如果写入 trial usage，检查 `getActiveTrialGrant` 是否返回了错误用户数据。

## 验收收尾

完成以上检查后，建议保留以下证据：

- `npm run lint` 和 `npm run build` 输出。
- migration 执行成功截图或 SQL Editor result。
- 领取、问卷、作文扣费、admin dashboard 的关键 API response。
- dry run 与 apply 前后的 `free_trial_grants` count 对比。

测试数据清理顺序：

```sql
DELETE FROM public.trial_credit_usages WHERE user_id IN ('<trial_new_user_id>', '<paid_user_id>', '<non_trial_user_id>');
DELETE FROM public.trial_reward_events WHERE user_id IN ('<trial_new_user_id>', '<paid_user_id>', '<non_trial_user_id>');
DELETE FROM public.survey_responses WHERE user_id IN ('<trial_new_user_id>', '<paid_user_id>', '<non_trial_user_id>');
DELETE FROM public.free_trial_grants WHERE user_id IN ('<trial_new_user_id>', '<paid_user_id>', '<non_trial_user_id>');
```
