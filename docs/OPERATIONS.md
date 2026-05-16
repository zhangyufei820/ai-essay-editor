# 沈翔智学运维手册

本文档面向站长和运维人员，用于本地验收、上线前检查和日常巡检。不要把真实密钥写进文档或代码，也不要把 `.env.production` 的内容粘贴到聊天工具。

## 本地验收命令

上线前至少执行：

```bash
npm run lint
npm run build
npm test -- __tests__/health-routes.test.ts __tests__/operations-pages.test.ts __tests__/monitoring-docs.test.ts
npm run perf:baseline -- --base-url=https://shenxiang.school --iterations=3
```

如果任一命令失败，先修复失败原因，再考虑上线。

## 上线前检查清单

- 确认 `.env.production` 已在服务器上存在，但不要覆盖已有生产文件。
- 确认 Supabase URL、匿名 Key、服务端 Key、支付配置、Dify API 配置均已按变量名填写。
- 执行数据库迁移 `scripts/019_add_billing_metadata_to_credit_transactions.sql`，为 `credit_transactions` 添加 `billing_metadata JSONB` 审计字段。
- 确认没有把真实 API key、token、password、service role key、数据库连接串提交到代码或文档。
- 确认 `npm run build` 通过，关键页面能本地访问。
- 确认 `/api/health` 返回 `status: ok`，`/health` 能打开运维说明页。
- 确认支付回调地址与生产域名 `shenxiang.school` 一致。

## 关键页面检查

上线前人工打开并确认：

- `/`
- `/pricing`
- `/privacy`
- `/terms`
- `/refund-policy`
- `/admin`
- `/health`
- `/api/health`

性能和服务器治理按以下文档执行：

- `docs/SERVER-TOPOLOGY.md`
- `docs/SERVER-CLEANUP-SOP.md`
- `docs/BACKUP-RESTORE-SOP.md`
- `docs/PERFORMANCE-BASELINE.md`

## BuildKit 缓存清理

构建缓存是当前服务器最容易增长的可再生成对象。清理它不会删除运行中容器、业务镜像、Docker 卷、数据库或上传资源；影响只是下一次 Docker 构建可能变慢。

建议每周或磁盘使用率超过 70% 时执行：

```bash
cd /data/ai-essay-editor
KEEP_HOURS=24 bash scripts/cleanup-build-cache.sh
```

清理后必须检查：

```bash
docker ps | grep shenxiang-nextjs
curl -fsS http://127.0.0.1:3000/api/health
df -h / /data
```

`/admin` 应确认登录、概览、用户列表、订单记录可以正常加载；不要降低后台鉴权要求。

## 支付问题排查

支付成功但权益未到账时，按顺序检查：

- 支付平台订单号和本站订单号是否一致。
- 支付回调是否到达服务器，回调接口是否返回成功。
- 订单状态是否从待支付变为已支付。
- 用户积分、会员状态、交易流水是否同步更新。
- 后台 `/admin` 是否能查到该用户和订单。
- 日志中是否有签名校验失败、环境变量缺失或数据库写入失败。

## 回滚原则

- 先停止继续发布新版本，保留当前日志和错误截图。
- 不要覆盖 `.env.production`，不要删除生产数据。
- 优先回退到上一个已验证可用版本。
- 回滚后再次检查 `/api/health`、`/health` 和关键页面。
