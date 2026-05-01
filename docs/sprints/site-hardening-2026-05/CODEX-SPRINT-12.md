# CODEX Sprint 12 — 低风险 Hooks Warning 清理

日期：2026-05-01

## 背景

Sprint 11 已将 `@next/next/no-img-element` 清零，剩余 lint warning 全部为 `react-hooks/exhaustive-deps`。

这些 warning 不能批量处理，因为很多位于后台数据加载、邀请页用户数据、聊天会话加载、模型切换、图片任务提交等高风险流程。Sprint 12 只处理不会改变请求时机、会话加载或业务状态的低风险项。

## 初始状态

- 分支：`main`
- 前置提交：`0dfa459 chore: document dynamic image exceptions`
- 工作区：干净
- `npm run lint`：0 errors，16 warnings，全部为 `react-hooks/exhaustive-deps`

## 本轮处理范围

仅处理 4 个低风险 warning：

1. `components/ui/MobiusInfinity.tsx`
   - 类型：effect cleanup 中直接读取 `containerRef.current`
   - 处理：在 effect 内捕获 `container` 常量，cleanup 使用该稳定引用清理 sparkle DOM
   - 风险：低；只影响卸载清理逻辑

2. `hooks/useSunoMusic.ts`
   - 类型：effect cleanup 中直接读取 `pollingTimersRef.current`
   - 处理：在 effect 内捕获 `pollingTimers` 常量，cleanup 使用稳定 Map 引用清理轮询
   - 风险：低；只影响卸载清理逻辑，不改变轮询创建/请求逻辑

3. `components/ui/NeuralFlowBackground.tsx`
   - 类型：`useCallback(draw)` 依赖中包含未使用的 `opacity`
   - 处理：移除未使用依赖 `opacity`
   - 风险：低；`draw` 函数实际未读取 `opacity`

4. `components/chat/enhanced-chat-interface.tsx`
   - 类型：依赖数组包含 `currentBotIdRef.current`
   - 处理：移除 mutable ref current 依赖，保留 `messages` / `isLoading`
   - 风险：低；ref 变化不会触发渲染，原依赖本身无效

## 明确不处理的高风险 warning

本 Sprint 保留以下 12 个 warning，后续需逐个审计：

- `app/admin/page.tsx`：后台数据加载 `fetchAllData`
- `app/invite/page.tsx`：邀请页用户数据 `loadUserData`
- `components/app-sidebar.tsx`：积分刷新 `fetchCredits`
- `components/chat/banana-chat-interface.tsx`：会话加载、提交回调
- `components/chat/enhanced-chat-interface.tsx`：历史会话加载、模型切换相关 effect
- `components/chat/gpt-image2-chat-interface.tsx`：会话列表、历史会话、图片任务提交

这些位置可能影响请求次数、会话恢复、模型选择、积分/用户状态或生成任务提交，不能机械添加依赖。

## 验证结果

- `npm run lint`：通过，0 errors；warnings 16 → 12
- `npm test -- --runInBand`：通过，26/26 suites passed，140/140 tests passed
- `npm run build`：通过
- 变更文件密钥模式扫描：未发现 `eyJhbGci`、`sb_secret_`、`sk_live`、`sk_test`、`SERVICE_ROLE_KEY`、`APPSECRET`

## 改动文件

- `components/ui/MobiusInfinity.tsx`
- `components/ui/NeuralFlowBackground.tsx`
- `components/chat/enhanced-chat-interface.tsx`
- `hooks/useSunoMusic.ts`

## 后续建议

Sprint 13 继续 hooks warnings 审计时，建议按风险分组：

1. 先审计纯 UI / 模型选择初始化类 effect。
2. 再审计聊天会话加载相关 effect。
3. 最后审计后台、积分、邀请、图片任务提交等数据/业务请求类 effect。

每个 warning 都应单独判断是否需要 `useCallback`、是否应移动函数定义、是否应显式 eslint disable，不能批量补 dependency。
