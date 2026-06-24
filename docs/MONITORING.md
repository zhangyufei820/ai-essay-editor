# 监控配置说明

本文档说明沈翔智学的错误监控和可用性监控建议。所有示例均使用占位符，不要把真实密钥写进文档或代码。

## 健康检查

站点提供两个入口：

- `/api/health`：给机器监控使用，返回轻量 JSON。
- `/health`：给站长和运维查看，包含人工排查建议。

建议外部监控每 1-5 分钟请求一次 `https://shenxiang.school/api/health`。连续 2-3 次失败后再告警，避免偶发网络抖动造成误报。

## 错误日志巡检

当前阶段不接入第三方错误上报 SDK。生产故障排查以外部 `/api/health` 可用性监控、`shenxiang-nextjs` 日志、OpenResty 访问日志和业务表巡检为准。

建议每日查看：

```bash
docker logs shenxiang-nextjs --since 24h 2>&1 | grep -Ei 'error|fail|timeout|refused|oom|exception|unhandled' || true
```

如需更细的用户路径定位，优先结合 `shenxiang-openresty` 访问日志、`ai_task_runs` 状态和相关业务表，而不是引入额外监控依赖。

## AI 任务状态监控

`ai_task_runs` 是长任务和 Dify / OpenClaw / 图片任务的统一状态表。若巡检发现大量历史 `queued` / `running`，先 dry-run：

```bash
npm run ops:ai-tasks:reconcile -- --older-than-minutes=60 --limit=100
```

确认输出只包含明显过期记录后再 apply：

```bash
npm run ops:ai-tasks:reconcile:apply -- --older-than-minutes=60 --limit=100
```

收敛规则：明确完成阶段进入 `succeeded`，客户端断连进入 `cancelled`，异常信号进入 `failed`，其余过期任务进入 `timeout`。该任务不删除数据，也不修改积分流水。

## 外部可用性监控

可以使用 UptimeRobot、Better Stack、Pingdom 或同类工具：

- 监控 URL：`https://shenxiang.school/api/health`
- 检查频率：1-5 分钟
- 告警方式：短信、邮件、企业微信或飞书
- 告警条件：HTTP 非 200、超时、返回内容不包含 `ok`
- 超时建议：10 秒
- 误报抑制：连续 2-3 次失败再告警

当前阶段先接入外部 `/api/health` 可用性监控和人工巡检，不新增服务器监控容器。端口、Docker、磁盘和性能基线见：

- `docs/SERVER-TOPOLOGY.md`
- `docs/SERVER-CLEANUP-SOP.md`
- `docs/BACKUP-RESTORE-SOP.md`
- `docs/PERFORMANCE-BASELINE.md`

## 告警后先看什么

- `/health` 是否可打开。
- `/api/health` 是否返回 JSON。
- `/`、`/pricing`、`/admin` 是否可访问。
- 应用日志是否有连续错误。
- Supabase、支付回调和环境变量是否异常。
- 服务器磁盘和 Docker 缓存是否异常增长：先运行 `npm run ops:disk:guard` 或 `bash scripts/server-audit.sh`，再按 `docs/SERVER-CLEANUP-SOP.md` 处理。
