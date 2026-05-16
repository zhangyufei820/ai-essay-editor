# ai-essay-editor 项目指南

## ⚠️ 强制要求

**在执行任何任务前，你必须：**
1. 阅读 [docs/CODEX-SKILL-SOP.md](docs/CODEX-SKILL-SOP.md)：SOP 管流程、skill 调用和安全红线。
2. 阅读 [docs/PROJECT-ARCHITECTURE.md](docs/PROJECT-ARCHITECTURE.md)：Architecture 管地图、系统边界和请求链路。
3. 若任务涉及线上故障、部署、监控、回滚或生产环境，阅读 [docs/RUNBOOK.md](docs/RUNBOOK.md)。
4. 按 SOP 明确本次任务类型、调用的 skill、读取的文件、验证命令和安全注意。

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
