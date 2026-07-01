# ai-essay-editor 项目指南

---

## 🔴 致 Codex 的审计备忘录（每次任务前必读）

> 这是一份来自外部审计者在 `codex/new-api-image-long-wait-hint-20260628` 分支上的修复记录。
> 你（Codex）产生了这些问题，这里告诉你为什么它们是错的，以及你必须怎么做才不会再犯。

### 一、你上次留下的问题清单（已全部修复，commit fe52e14a）

| 级别 | 问题 | 文件 | 根因 |
|------|------|------|------|
| P0 | `taskResult.Url = t.FailReason` — URL字段写入了错误原因 | `task_video.go:117` | 照抄字段而不看字段语义 |
| P0 | `dangerouslySetInnerHTML` 没有 DOMPurify | `Home/index.jsx:109` | 未执行 XSS 安全检查 |
| P0 | `/console/chat/:id?` 路由没有 `PrivateRoute` | `App.jsx` | 新增路由时没有对照其他受保护路由 |
| P0 | `PlaygroundRecoverImageTask` 可重置已完成任务 | `playground_image_recovery.go` | 没有在入口处检查终态 |
| P1 | `media`/`codex` 的 `return true` 绕过了 `isModuleVisible` | `SiderBar.jsx` / `useNavigation.js` | 快速加条件时用了最简单写法而非正确写法 |
| P2 | goroutine 中 HTTP 请求无 context timeout | `playground_image_task.go` | 没有遵守 Go 安全规则：context 必须传递 |
| P2 | goroutine 刷新任务失败时不清理 `requestFile` | `playground_image_task.go:847` | 错误路径漏掉了 cleanup |
| P2 | `pollImageTask` / `pollVideo` 不响应组件卸载 | `MediaPlayground/index.jsx` | 未实现 cleanup ref，经典 React 内存泄漏 |
| P2 | `.dark .shine-text` 应为 `html.dark .shine-text` | `index.css:2780` | 不了解项目的 dark mode 挂载点 |
| P2 | iframe 同时在 `onload` + `useEffect` 发送 postMessage | `Home/index.jsx` | 叠加逻辑而不是替换逻辑 |
| P3 | `sanitizeFailure` 缺少 bearer/token/secret/password | `playground_image_task.go` | 敏感词列表不完整 |

### 二、你为什么每次都搞得乱糟糟？

审计结论：**你有能力写对，但你在执行时抄近路。** 具体表现：

1. **字段复用不看语义**：`t.FailReason` 和 `t.GetResultURL()` 都能编译通过，你选了错的那个。说明你在赋值时没有问自己"这个字段代表什么"。

2. **新增路由/入口不对照安全模式**：同一个文件里其他路由都有 `PrivateRoute`，你新加的没有。你没有把"新加入口"当作安全检查点。

3. **错误路径的 cleanup 只覆盖主路径**：你写了主流程的 cleanup，但 error early-return 的分支漏掉了。说明你没有系统性地审查每个 return 语句。

4. **React 轮询没有 unmount 防护**：这是 React 入门级的常识。组件卸载后继续 setState 是已知问题，但你没有主动检查轮询函数是否处理了这种情况。

5. **CSS 不看挂载点**：项目的 dark mode 是加在 `html` 元素上的，你写了 `.dark` 裸选择器。改一个地方前至少应该 grep 一下已有 dark 样式是怎么写的。

6. **叠加逻辑而不是替换**：`onload` + `useEffect` 同时发 postMessage。你加了新逻辑，但没有问"原来的逻辑是否仍然正确"。

**核心问题只有一个**：你在交付前没有做自我审查。你以"代码可以运行"作为完成标准，而不是"代码是正确的"。

### 三、从现在起，每次执行任务必须遵守以下规则

#### 规则 A：每个新增入口都是安全检查点

新增路由、API endpoint、goroutine 入口、recovery 函数时，必须问：
- 是否需要鉴权？对照同文件的其他入口
- 是否需要终态守卫（幂等性）？
- 是否需要 context timeout？

#### 规则 B：每个 return 都必须检查是否需要 cleanup

在有资源分配（文件、goroutine、HTTP client）的函数中，所有 return 语句（包括 error path）都必须执行 cleanup。

#### 规则 C：新加逻辑前必须问"原有逻辑是否仍然正确"

不要叠加，要替换。加 `useEffect` 前看是否还有 `onload`。加字段赋值前看字段名的语义。

#### 规则 D：CSS/样式改动前先 grep 同类已有写法

改 dark mode 样式前：`grep -r "html.dark\|\.dark " index.css` — 看清楚项目约定再动手。

#### 规则 E：React 轮询必须有 unmount 防护

任何 while 轮询循环，必须有一个 `cancelledRef` 检查。这不是可选项。

#### 规则 F：交付前自我审查清单（必须逐条执行）

```
- [ ] 所有新入口：鉴权 + 幂等终态守卫
- [ ] 所有 return 路径：资源 cleanup
- [ ] 所有外部调用（HTTP/goroutine）：context timeout
- [ ] 所有 dangerouslySetInnerHTML：DOMPurify
- [ ] 所有 CSS dark 相关：grep 确认选择器格式
- [ ] 所有新增逻辑：是否与已有逻辑冲突（onload vs useEffect）
- [ ] 所有 while 轮询：unmount 防护
- [ ] 计费/退款逻辑：未修改（除非被明确要求）
```

---

## ⚠️ 强制要求

**在执行任何任务前，你必须：**
1. 阅读 [docs/CODEX-SKILL-SOP.md](docs/CODEX-SKILL-SOP.md)：SOP 管流程、skill 调用和安全红线。
2. 阅读 [docs/PROJECT-ARCHITECTURE.md](docs/PROJECT-ARCHITECTURE.md)：Architecture 管地图、系统边界和请求链路。
3. 阅读 [docs/CODEX-TASK-ROUTER.md](docs/CODEX-TASK-ROUTER.md)：Task Router 管 scope lock、证据链、Done Card 和工作区卫生。
4. 若任务涉及线上故障、部署、监控、回滚或生产环境，阅读 [docs/RUNBOOK.md](docs/RUNBOOK.md)。
5. 按 SOP 明确本次任务类型、调用的 skill、读取的文件、验证命令和安全注意。
6. 输出本次路由卡：`scope_lock`、`target_stack`、`target_paths`、`forbidden_paths`、`evidence_first`、`done_card`、`verification`、`cleanup`。

**本地 Codex 修复闭环：**

本地 Codex 在本仓库完成修复并验证通过后，除非用户明确要求暂停部署，必须继续完成：提交、部署、线上验证、确认生产加载新代码，并保持本地与服务器工作区干净或明确解释剩余脏改动。不要把“测试通过”当作最终完成。

**云端 Codex 区分：**

云端 Codex 是服务平台，不是本地开发工作区。云端任务工作区需要读取 Task Router 和安全边界，但不要求用户任务执行本地仓库提交、部署或清理。

**多 Agent 协作硬规则：**

本项目所有对话都适用以下规则，不限于修复任务。只要用户说到“紧急修复”、“监督”、“多 agent”、“多线程协作”、“不要开多个窗口”、“不要另开线程”、“统一协调”或同类意图，Codex 必须默认使用当前线程内的 sub-agents 做协作，不得默认创建新的用户可见 Codex thread。

- 当前主线程必须担任 coordinator，负责范围锁定、任务拆分、冲突控制、最终决策、提交、部署和最终报告。
- 默认不得创建新的用户可见 Codex thread；只有用户明确要求“新建线程 / 新开窗口 / 创建 Codex thread”时才允许创建。
- sub-agent 的任务必须清晰、可验证、互不重复；涉及写代码时，必须指定互斥写入范围，避免多个 agent 修改同一文件或同一模块。
- 至少安排一个 read-only monitor 负责生产状态、日志、DB 只读证据、健康检查或用户路径监测；monitor 不得改文件、重启服务、写 DB 或部署。
- 主线程必须继续推进关键路径，不得把阻塞性的核心判断完全外包给 sub-agent 后空等。
- 所有 sub-agent 的结论必须回到主线程统一审查和汇总；最终对用户输出的报告只由主线程给出。
- 如果任务很小，不值得实际启动 sub-agent，主线程必须说明“不启动 sub-agent 的原因”，但仍不得另开用户可见线程。

---

## 项目概述

- **技术栈**: Next.js 16 + TypeScript + Docker + Supabase + Dify API
- **部署**: Docker 自托管 (服务器: 43.154.111.156)
- **域名**: shenxiang.school

## 关键文件位置

| 文件 | 路径 |
|------|------|
| Skill SOP / 流程 | `docs/CODEX-SKILL-SOP.md` |
| 项目架构地图 | `docs/PROJECT-ARCHITECTURE.md` |
| Task Router / 范围路由 | `docs/CODEX-TASK-ROUTER.md` |
| 线上事故 Runbook | `docs/RUNBOOK.md` |
| 运维手册 | `docs/OPERATIONS.md` |
| 监控说明 | `docs/MONITORING.md` |

## 快速命令

```bash
# 本地开发
npm run dev

# 本地构建
npm run build

# SSH 服务器
ssh root@43.154.111.156

# 服务器部署
cd /data/ai-essay-editor && git pull && docker build
```

## 安全红线

**禁止触碰区**:
- 容器环境 (docker system prune 等)
- 1Panel 基础设施 (/opt/1panel)
- 持久化数据 (.db, PostgreSQL)
- 网关配置 (OpenResty/Nginx)

详见 `docs/CODEX-SKILL-SOP.md` 的“安全红线”章节。
