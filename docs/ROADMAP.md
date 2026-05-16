# 长期路线图：收敛 service_role 使用

## 现状摘要

当前系统同时存在 Authing 的 TEXT `user_id` 和 Supabase Auth 的 UUID 身份。很多业务表最早按 Authing 用户 ID 落库，而 Supabase RLS 常见写法是 `auth.uid()::text = user_id`。当用户只通过 Authing 登录、没有对应 Supabase session 时，`auth.uid()` 对这些请求就是 `NULL`，RLS 无法识别真实 owner。为了保证支付、积分、分享、聊天记录等服务端流程可用，应用层只能在部分路由里使用 `service_role` 兜底。这个状态能跑，但长期风险是权限边界分散在代码里，数据库层无法独立兜底，参见审计中 P0-10 和 `docs/DATABASE-GOVERNANCE-AUDIT.md` 对数据库与 RLS 风险的描述。

## 短期（已完成）

短期策略不是立刻重做身份系统，而是先把所有使用 `service_role` 的高风险路由补上应用层 owner 校验。已完成的方向是：进入写表或读私有数据前，先用 `requireUser` 获得可信登录用户，再用 `assertSameUser` 或等价逻辑确认请求目标就是当前用户本人。支付回调、后台管理等确实需要跨用户操作的路径保留更严格的服务端判断。为了防止以后回退，`__tests__/security-audit-guards.test.ts` 继续用静态断言守住关键 API、debug 路由、媒体签名、支付入口和敏感日志边界。

## 中期（3 个月内）

中期目标是让 Authing 登录后的用户也拥有 Supabase session。具体方案是：前端或服务端拿到 Authing `idToken` 后，改为调用 `supabase.auth.signInWithIdToken({ provider: 'oidc', token: idToken })`，让 Supabase `auth.users` 表中也持有对应的 Authing 用户记录。随后新写入的数据统一使用 Supabase Auth UUID，老数据通过迁移表或映射表逐步回填。完成灰度后，将主要业务表的 `user_id` 列恢复为 UUID 类型，并补上到 `auth.users(id)` 的外键，减少 TEXT ID 带来的隐式权限判断。

## 长期（6 个月内）

长期目标是把权限主责还给数据库。完成身份联邦和数据迁移后，逐步把现有宽松 RLS 策略从 `USING (true)` 改成 `auth.uid() = user_id`，并给 insert/update 补齐 `WITH CHECK`。应用代码仍然保留用户态校验，但它只作为用户体验和错误提示层，不再是最后一道权限边界。`service_role` 只保留给真正跨用户的 admin 操作、支付回调到账、后台人工补偿、数据修复脚本等少数场景，并要求这些路径有审计日志、输入校验和明确的 owner 或 admin 判断。

## 风险与回滚

迁移期间最大的风险是身份映射错误：同一个 Authing 用户可能被错误绑定到新的 Supabase 用户，或老数据没有按预期回填，导致用户看不到自己的历史记录。为降低风险，所有联邦登录和 UUID 写入必须受 `USE_SUPABASE_FEDERATION` 功能开关控制，先对内部账号和少量真实用户灰度。若发现登录异常、数据不可见或权限误判，立即关闭开关，回退到当前应用层 `requireUser` 加 owner 校验的兜底模式。数据库迁移采用可回放脚本和备份快照，不直接覆盖老 `user_id`。

## 验收指标

退出标准必须可量化。第一，仓库里直接 import 或创建 `service_role` admin client 的位置减少到 5 个以内，并且每个位置都有用途说明和测试覆盖。第二，`scripts/auditor` 或等价静态审计跑出 0 个“无 owner 校验的写表点”。第三，主要用户表的 RLS 策略不再依赖 `USING (true)`，而是使用 `auth.uid() = user_id` 及对应 `WITH CHECK`。第四，灰度用户能完成登录、购买、积分到账、聊天、分享、后台查询这些关键链路，且不出现跨用户读写。
