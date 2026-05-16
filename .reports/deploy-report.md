# Deploy Report

## 部署状态

已部署。

## 部署说明

- 本地 `.env.production` 缺少 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`，但服务器 `/data/ai-essay-editor/.env.production` 已确认存在且服务器端 `npm run deploy:check` 通过。
- 未使用 `scripts/deploy-blue-green.sh`，避免触碰 OpenResty/1Panel 网关配置和镜像清理。
- 使用项目现有 `docker-compose.prod.yml` 仅重建并启动 `nextjs` 服务。

## 部署前记录

- 当前本地分支：`ui-layout-refactor-keep-logic`
- 部署前基线 commit：`08b5e6f96e5beb0e72cf330fa0a12adfd6a0ad80`
- 当前部署 UI 重构 commit：`a9799edb8e2ca2490871261149b41d68add01b1d`
- 当前工作区还有非本次改动：`.claude/scheduled_tasks.json`、`.claude/scheduled_tasks.lock`
- 构建产物：`.next/`
- 本地 build：通过。
- 服务器部署门禁检查：通过。

## 部署记录

- 部署时间：2026-05-04 09:57 Asia/Shanghai
- 部署环境：服务器 `43.154.111.156`，Docker Compose 自托管
- 服务器目录：`/data/ai-essay-editor`
- 服务器分支：`ui-layout-refactor-keep-logic`
- 服务器 commit：`a9799edb8e2ca2490871261149b41d68add01b1d`
- 镜像：`ai-essay-editor:latest`
- 容器：`shenxiang-nextjs`
- 部署命令：

```bash
cd /data/ai-essay-editor
git fetch origin ui-layout-refactor-keep-logic
git switch -C ui-layout-refactor-keep-logic origin/ui-layout-refactor-keep-logic
npm run deploy:check
docker compose -f docker-compose.prod.yml up -d --build nextjs
```

## 健康检查

- 容器状态：`shenxiang-nextjs Up ... (healthy)`
- 服务器本机首页：`http://127.0.0.1:3000` 返回 `200 OK`
- 服务器本机 API：`http://127.0.0.1:3000/api/health` 返回 `{"status":"ok"}`
- 生产域名首页：`https://www.shenxiang.school` 返回 `HTTP/2 200`
- 生产域名 API：`https://www.shenxiang.school/api/health` 返回 `{"status":"ok"}`
- 容器启动时间：`2026-05-04T01:57:52.694521841Z`
- 容器 image digest：`sha256:bbb87d295d74c2133b8243de6afe5a18cf5748e17e10469f7488757c07b43b2c`

## 回滚方案

本次部署回滚方式：

```bash
cd /data/ai-essay-editor
git switch main
git reset --hard 08b5e6f96e5beb0e72cf330fa0a12adfd6a0ad80
docker compose -f docker-compose.prod.yml up -d --build nextjs
```

如需只回滚 UI commits：

```bash
cd /data/ai-essay-editor
git revert a9799ed
git revert b2de2ce
git revert 02676af
docker-compose -f docker-compose.prod.yml up -d --build nextjs
```

若使用 Docker 镜像回滚：

```bash
docker images ai-essay-editor
docker stop shenxiang-nextjs
docker run <previous-known-good-image>
```

注意：本次部署未修改 OpenResty/1Panel 网关配置，未执行 Docker prune。
