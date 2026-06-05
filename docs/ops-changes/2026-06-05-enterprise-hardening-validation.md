# 2026-06-05 企业级快稳复验与防漂移加固

- Scope: 生产健康、`llm-gateway` 主路/fallback、Dify workflow 映射与关键聊天应用真实账号复验；未改动基础设施、数据库结构或用户数据。

## 复验目标

- 确认今天已经修过的关键链路没有漂移
- 确认服务器源码目录不会因旧提交和热改残留影响下次部署
- 把“今天修复是否还在”固化成可重复执行的校验，而不是人工记忆

## 已验证事项

### 基础健康

- `https://shenxiang.school/api/health` 返回 `status: ok`
- 容器健康：
  - `shenxiang-nextjs`
  - `shenxiang-llm-gateway`
  - `docker-api-1`
  - `docker-worker-1`
  - `docker-db_postgres-1`

### 网关 / Dify 配置状态

- `node scripts/dify-remap-unified-routing.mjs --all-apps`
  - `total_changes: 0`
- `node scripts/dify-tune-site-problem-workflows.mjs`
  - `planned_changes: 0`
- 说明：
  - `网站助手` 检索恢复仍在
  - `题目解析` 路由压缩仍在
  - 当前生产 Dify 节点没有偏离今天的目标配置

### 真实账号页面回归

登录后以下页面输入框均可用，不再出现“请先登录”导致禁用：

- `/chat/all-in-one-agent`
- `/chat/vocab-card`
- `/chat/ai-writing-paper`
- `/chat/zhongying-essay`
- `/chat/experiment-report`
- `/chat/grok-4.2`

### 真实账号聊天测速

- `网站助手 /chat`
  - front first render `7256ms`
  - Dify total `5.21s`
  - slowest: `知识检索 3.08s`
- `题目解析 /chat/problem`
  - front first render `7600ms`
  - Dify total `6.46s`
  - slowest: `问题通道 3.26s`
- `论文写作`
  - front first render `4618ms`
  - Dify total `3.08s`
- `实验报告智能助手`
  - front first render `4880ms`
  - Dify total `3.46s`
- `数学图片与动画生成器（Codex Gateway）-Chatflow稳定启动v3`
  - front first render `11568ms`
  - Dify total `10.05s`
- `词镜记忆卡`
  - front first render `73866ms`
  - Dify total `72.22s`
  - 当前最明显不符合企业级快稳标准的慢点

## 生产源码目录防漂移

- 发现服务器源码目录 `/data/ai-essay-editor` 落后 `origin/main` 两个提交，并带有热改残留：
  - `scripts/dify-remap-unified-routing.mjs`
  - `services/llm-gateway/config.yaml`
  - `scripts/provider-direct-benchmark.mjs`
- 先用保守方式 `stash` 保存现场：
  - `codex-server-sync-20260605`
- 再将服务器源码目录 fast-forward 到：
  - `a8402e3 tune dify site assistant and problem workflows`

这一步的意义：

- 避免“线上其实是新配置，但服务器源码目录还是旧状态”
- 降低下次部署把已验证修复带丢的风险

## 新增防漂移护栏

- `__tests__/dify-production-hardening.test.ts`
  - 断言 Dify 统一 remap 为 `0 changes`
  - 断言 `网站助手 / 题目解析` 调优脚本为 `0 planned changes`
  - 断言检索恢复和关键参数仍然固定在目标值

## 当前结论

- 今天修过的主链路当前仍然生效，没有漂
- 基础健康、登录态、网关主链路和 Dify 映射都稳定
- 仍需继续优化的主要性能问题不是今天的修复回退，而是：
  - `词镜记忆卡` workflow 过慢
  - `all-in-one-agent` 路由/意图节点偏慢
