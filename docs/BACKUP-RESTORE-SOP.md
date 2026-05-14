# 备份与恢复演练 SOP

本文档覆盖沈翔智学生产环境的关键配置、数据库、对象存储和服务编排备份。原则是“能恢复才算备份完成”。

## 备份范围

| 类别 | 对象 | 推荐频率 | 备注 |
|---|---|---|---|
| 应用配置 | `/data/ai-essay-editor/.env.production` | 每次变更后 | 加密保存，不进 Git |
| 编排文件 | `docker-compose.prod.yml`, `Dockerfile`, `next.config.mjs` | 每次发布前 | Git 已覆盖代码，但服务器现场版本也要留快照 |
| OpenResty/1Panel | 站点反代、证书、应用配置 | 每次变更前 | 不直接修改 `/opt/1panel`，先导出/截图/复制配置 |
| Supabase | 用户、订单、积分、聊天记录 | 每日 | 使用 Supabase 官方备份或导出 |
| Dify | Dify PostgreSQL、Redis、插件配置、知识库 | 每日或每次工作流大改前 | 恢复需同步 API key 和插件状态 |
| MinIO / 上传资源 | 用户上传、生成图片、临时资源 | 每日增量 | 校验对象数量和抽样 URL |
| OpenClaw / 媒体服务 | 生成任务、项目数据、缓存策略 | 每周或版本变更前 | 区分可再生成缓存和业务资产 |

## 配置备份命令

不要在终端或文档输出真实密钥内容。只生成文件和校验值：

```bash
mkdir -p /data/backups/config/$(date +%F)
cp /data/ai-essay-editor/.env.production /data/backups/config/$(date +%F)/env.production
cp /data/ai-essay-editor/docker-compose.prod.yml /data/backups/config/$(date +%F)/
sha256sum /data/backups/config/$(date +%F)/* > /data/backups/config/$(date +%F)/SHA256SUMS
chmod 600 /data/backups/config/$(date +%F)/env.production
```

## 数据库备份建议

Supabase：

```bash
# 使用 Supabase Dashboard 或 CLI 官方备份能力。
# 不要把 service role key 或连接串写入脚本仓库。
```

Dify 本地 PostgreSQL：

```bash
mkdir -p /data/backups/dify/$(date +%F)
docker exec docker-db-1 pg_dump -U postgres -Fc dify > /data/backups/dify/$(date +%F)/dify.dump
```

如容器名或数据库名不同，先用 `docker ps` 和 compose 文件确认，不要猜。

## 对象存储备份建议

MinIO 或上传目录优先使用对象存储工具做增量同步。备份后记录：

- 对象数量
- 总大小
- 最近 10 个对象路径
- 抽样 3-5 个对象恢复验证结果

## 恢复演练

每月至少做一次非生产恢复演练：

1. 准备隔离目录或临时机器。
2. 恢复 `.env.production` 的脱敏副本或测试环境配置。
3. 恢复数据库 dump 到临时库。
4. 启动 Next.js 测试容器或本地构建。
5. 验证 `/api/health`、登录、积分查询、聊天、图片生成入口、后台只读页面。
6. 记录恢复耗时、失败点和缺失凭证。

## 发布前最小备份

涉及生产部署、端口治理、Dify、OpenClaw、图片网关或数据库变更前，至少完成：

```bash
cd /data/ai-essay-editor
git rev-parse HEAD
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
bash scripts/server-audit.sh | tee "/data/server-audit-prechange-$(date +%F-%H%M).log"
```

并确认：

- `.env.production` 存在且权限正确
- 上一个可用镜像或 Git commit 可识别
- 回滚命令已写好
- `/api/health` 当前为 200

## 回滚原则

- 先回滚应用镜像或 Git commit，后排查数据。
- 不覆盖生产密钥，除非明确是密钥误配且已有备份。
- 不删除数据库或对象存储数据来“快速恢复”。
- 回滚后必须验证 `/api/health`、首页、聊天、图片工作台、价格页、后台入口。
