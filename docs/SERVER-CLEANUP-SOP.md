# 服务器清理 SOP

目标：在不影响生产环境的前提下，持续控制磁盘、Docker 缓存、日志和临时文件，让服务器保持可独立管理、可扩展、可回滚。

## 当前基线

2026-05-14 快照：

- `/dev/vda2`: `217G` 总量，`115G` 已用，`94G` 可用，使用率 `56%`
- Docker Images: `29` 个 active，约 `77.14GB`
- Docker Containers: `35` 个 active，约 `2.086GB`
- Docker Volumes: `9` 个 active，约 `171.4MB`
- BuildKit Cache: `603` 项，约 `56.92GB`，可回收约 `51.43GB`
- `shenxiang-nextjs`: `healthy`
- `http://127.0.0.1:3000/api/health`: 200

## 清理前固定步骤

```bash
cd /data/ai-essay-editor
bash scripts/server-audit.sh | tee "/data/server-audit-before-$(date +%F-%H%M).log"
df -h / /data
docker system df
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker images -f dangling=true --format '{{.ID}} {{.Repository}}:{{.Tag}} {{.Size}}'
ss -lntp
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://shenxiang.school/api/health
```

## 可以直接清理的对象

这些对象可再生成，且不包含业务数据：

```bash
# 删除 24 小时以前的 BuildKit 缓存，保留最近构建缓存方便快速回滚/重建
docker builder prune -af --filter until=24h

# 如果确认没有悬空镜像，可执行；只会删 dangling image
docker image prune -f

# npm 缓存可再生成
npm cache clean --force

# 系统日志保留 7 天
journalctl --vacuum-time=7d
```

建议频率：

- 磁盘使用率低于 70%：每周或每次大构建后检查，不必强清。
- 70%-85%：清理 `until=72h` 或 `until=24h` 的 BuildKit 缓存。
- 高于 85%：先审计，再只清 BuildKit/日志/npm 缓存；不要碰卷和运行中服务。

## 需要确认后才能处理的对象

| 对象 | 为什么不能直接删 | 确认方法 |
|---|---|---|
| 未运行容器 | 可能是回滚候选或独立应用 | 查创建时间、镜像、compose 项目、日志和反代配置 |
| 非 dangling 镜像 | 可能是当前运行容器的镜像 | `docker ps --format '{{.Image}}'` 交叉比对 |
| 实验服务目录 | 可能仍被 OpenResty 或 1Panel 引用 | 查端口、访问日志、compose、业务负责人 |
| 公网端口服务 | 可能是独立产品入口 | 先记录访问路径和回滚命令 |
| `/data` 下非本项目目录 | 可能是 1Panel 或独立服务数据 | 只做大小清单，不删除 |

确认模板：

```text
操作目标：
删除/下线原因：
当前引用证据：
备份位置：
回滚命令：
风险等级：
预计释放空间：
验证命令：
```

## 禁止默认操作

除非用户明确书面授权并完成备份，不执行：

```bash
docker system prune
docker volume prune
docker network rm
docker rm -f $(docker ps -aq)
rm -rf /opt/1panel
rm -rf /data/*postgres*
rm -rf /data/*redis*
rm -rf /data/*minio*
```

禁止触碰：

- 生产数据库、Docker 卷、MinIO 数据、OpenClaw 数据、上传资源
- `.env.production` 和真实密钥文件
- 1Panel/OpenResty 配置与证书
- 支付、积分、订单、用户权益相关数据

## 清理后验证

```bash
df -h / /data
docker system df
docker ps --filter name=shenxiang-nextjs --format '{{.Names}} {{.Status}}'
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://shenxiang.school/api/health
docker logs --tail 300 shenxiang-nextjs 2>&1 | grep -Ei 'error|fail|timeout|refused|oom|exception|unhandled' || true
```

至少打开：

- `https://shenxiang.school/`
- `https://shenxiang.school/chat`
- `https://shenxiang.school/chat/gemini-image`
- `https://shenxiang.school/lab`
- `https://shenxiang.school/pricing`
- `https://shenxiang.school/admin`

## BuildKit 定期清理策略

推荐先用人工巡检，不新上自动清理服务：

```bash
docker builder du
docker builder prune -af --filter until=72h
```

当构建频繁或缓存再次超过 50GB 时，可把保留窗口改成 24 小时：

```bash
docker builder prune -af --filter until=24h
```

不建议使用无过滤条件的全量清理作为定时任务，因为会降低紧急回滚和连续部署时的构建速度。
