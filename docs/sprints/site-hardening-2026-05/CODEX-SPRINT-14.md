# CODEX Sprint 14 — 邀请页 Hook Warning 最小收敛

日期：2026-05-01

## 目标

延续 Sprint 13 的低风险整改策略：仅处理明确低风险的 `react-hooks/exhaustive-deps` warning，不批量补依赖，不触碰支付、订单、积分扣减、聊天流式输出、图片任务提交等核心链路。

## 本轮范围

### 修改文件

- `app/invite/page.tsx`

### 修改内容

- 将邀请页 `loadUserData` 包装为 `useCallback`。
- 将初始化 `useEffect` 依赖从空数组调整为 `[loadUserData]`。
- 将 `loadUserData` 移到 effect 之前，避免引用顺序问题。
- 仅新增稳定依赖 `router`，保持原有加载逻辑、API、Supabase 查询、会员检查流程不变。

## 为什么选择这个 warning

本项相对低风险：

- 原 effect 是页面首次加载时读取 `localStorage` 并拉取推荐码/邀请奖励/会员状态。
- `router` 在 Next.js 中为稳定路由对象；包装为 `useCallback([router])` 不会引入循环请求。
- 未修改接口地址、请求体、状态字段、会员判断、推荐码生成或奖励计算。

## 未处理项

本轮没有处理以下剩余 9 个 hooks warnings：

- `app/admin/page.tsx`：后台聚合数据加载，涉及订单/用户/统计数据。
- `components/chat/banana-chat-interface.tsx`：自动提交 `onSubmit`，涉及对话提交时机。
- `components/chat/enhanced-chat-interface.tsx`：历史会话加载、模型初始化/切换状态。
- `components/chat/gpt-image2-chat-interface.tsx`：会话列表、历史会话、图片任务提交。

这些均可能改变请求次数、会话加载节奏、模型状态或任务提交时机，后续 Sprint 继续逐个审计。

## 验证结果

- `npm run lint`：通过，0 errors；warnings 从 10 降到 9，剩余 9 个均为 `react-hooks/exhaustive-deps`。
- `npm test -- --runInBand`：通过，26/26 test suites，140/140 tests。
- `npm run build`：通过。
- 本次 diff 密钥扫描：`DIFF_SECRET_HITS=0`。

> 备注：全仓宽泛关键字扫描会命中历史文档/变量名/测试/旧 worktree 中的既有内容，本轮最终以当前 diff 扫描确认未新增敏感字面量。

## 后续建议

Sprint 15 继续只处理 1 个明确低风险项。优先审计是否有“只读状态同步/稳定 ref 清理”类 warning；暂缓自动提交、图片任务提交、后台聚合加载、模型切换等高风险 effect。
