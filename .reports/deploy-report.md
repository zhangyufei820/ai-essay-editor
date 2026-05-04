# Deploy Report

## 部署状态

未部署。

## 部署阻断原因

- `npm run deploy:check` 失败：`.env.production` 缺失 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`。
- 现有 `scripts/deploy-blue-green.sh` 会：
  - 修改 `/opt/1panel/apps/openresty/openresty/conf/conf.d` 下的 OpenResty 配置。
  - reload OpenResty 容器。
  - 执行 `docker image prune -f`。
- 上述行为触及用户明确禁止触碰的 1Panel 基础设施、网关配置和容器清理风险区。

## 部署前记录

- 当前本地分支：`ui-layout-refactor-keep-logic`
- 部署前基线 commit：`08b5e6f96e5beb0e72cf330fa0a12adfd6a0ad80`
- 当前待部署 UI 重构 commit：`b2de2ceb4019fec2b18677851d24446f4adaeda4`
- 当前工作区还有非本次改动：`.claude/scheduled_tasks.json`、`.claude/scheduled_tasks.lock`
- 构建产物：`.next/`
- 本地 build：通过。
- 最新部署门禁检查：失败，`.env.production` 缺失 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`。

## 健康检查

未执行生产健康检查，因为未部署。

本地可确认：
- `npm test -- --runInBand`：通过。
- `npm run build`：通过。

## 回滚方案

由于未部署，生产环境无需回滚。

若后续由人工确认环境变量和安全部署流程后部署，本次代码回滚方式：

```bash
git checkout main
git revert b2de2ce
git revert 02676af
```

若使用 Git 部署到服务器：

```bash
cd /data/ai-essay-editor
git log --oneline -5
git reset --hard 08b5e6f96e5beb0e72cf330fa0a12adfd6a0ad80
docker-compose -f docker-compose.prod.yml up -d --build nextjs
```

若使用 Docker 镜像回滚：

```bash
docker images ai-essay-editor
docker stop shenxiang-nextjs
docker run <previous-known-good-image>
```

注意：涉及 Docker、OpenResty、1Panel 的实际回滚必须由具备生产权限的人确认执行，避免触碰持久化数据和网关配置。
