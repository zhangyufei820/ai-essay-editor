# ai-essay-editor 项目指南

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
