# ai-essay-editor 项目指南

## ⚠️ 强制要求

**在执行任何任务前，你必须：**
1. 阅读 [.Codex/memory/2026-04-04-skill-usage-guide.md](.Codex/memory/2026-04-04-skill-usage-guide.md)
2. 遵循其中的安全准则（第一章）
3. 按照技能调用流程执行任务

---

## 项目概述

- **技术栈**: Next.js 16 + TypeScript + Docker + Supabase + Dify API
- **部署**: Docker 自托管 (服务器: 43.154.111.156)
- **域名**: shenxiang.school

## 关键文件位置

| 文件 | 路径 |
|------|------|
| 技能指导书 | `.Codex/memory/2026-04-04-skill-usage-guide.md` |
| 安全准则 | `.Codex/memory/security-guardrails.md` |
| 服务器架构 | `.Codex/memory/2026-04-02-server-architecture.md` |
| SOP 工作流 | `.Codex/memory/2026-04-02-sop-workflow.md` |

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

详见指导书第一章"生产环境安全准则"
