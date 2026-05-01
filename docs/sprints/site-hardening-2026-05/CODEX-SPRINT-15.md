# CODEX Sprint 15 — 后台页 Hook Warning 最小收敛

日期：2026-05-01

## 目标

在 Sprint 14 剩余 9 个 `react-hooks/exhaustive-deps` warnings 的基础上，继续按“单点、低风险、可验证”的方式收敛 1 个 warning。

## 本轮范围

仅修改：

- `app/admin/page.tsx`

本轮处理：

- 后台页 token 自动验证 effect 缺少 `fetchAllData` 依赖。

## 修改说明

- 引入 `useCallback`。
- 将 `fetchStats`、`fetchUsers`、`fetchOrders` 稳定化为 `useCallback(..., [])`。
- 将 `fetchAllData` 稳定化为 `useCallback(..., [fetchStats, fetchUsers, fetchOrders])`。
- 将 token 自动验证 effect 依赖从 `[]` 调整为 `[fetchAllData]`。
- 将 token 自动验证 effect 移到数据加载函数定义之后，避免函数声明顺序导致运行期引用问题。

## 未修改内容

- 未修改后台登录 API、token 存储、校验接口。
- 未修改统计、用户、订单接口路径和请求头。
- 未修改后台搜索、用户详情、订单/收入/会员展示逻辑。
- 未触碰聊天、图片任务、积分扣减、支付、订单、会员核心业务链路。

## 验证

- `npm run lint`：通过，0 errors；warnings 从 9 降到 8。
- `npm test -- --runInBand`：通过，26/26 suites passed，140/140 tests passed。
- `npm run build`：通过。
- 本次 diff 敏感字面量扫描：0 命中。

## 剩余风险与后续

剩余 8 个 warnings 仍集中在聊天与图片生成工作区：

- `components/chat/banana-chat-interface.tsx` 自动提交 effect 依赖 `onSubmit`。
- `components/chat/enhanced-chat-interface.tsx` 历史会话加载、URL/模型同步相关 effects。
- `components/chat/gpt-image2-chat-interface.tsx` 历史会话、侧边栏会话列表、图片任务提交相关 effects。

这些位置会影响自动提交、历史会话恢复、模型切换、图片生成任务提交，后续 Sprint 应继续逐个审计，不应批量补 dependency。
