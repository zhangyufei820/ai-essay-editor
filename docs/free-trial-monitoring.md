# 60 天共创体验计划监控说明

本文档说明共创体验计划的 5 分钟健康监控、自动止损和人工恢复方式。

## 监控目标

- 每 5 分钟检查活动健康状态。
- P0 风险自动关闭数据库运行时开关，避免继续损失。
- 自动动作只允许关闭 runtime flags。
- 所有异常和动作写入 `monitor_incidents`，每次运行写入 `monitor_runs`。

## 数据库运行时开关

表：`free_trial_runtime_config`

关键开关：

- `free_trial_campaign_enabled`：是否展示/允许活动领取。
- `free_trial_consumption_enabled`：是否允许 trial 免费额度消耗。
- `free_trial_auto_prompt_enabled`：是否允许每日问卷自动弹出。
- `free_trial_monitor_enabled`：是否允许监控任务执行自动止损。

环境变量仍然是硬开关。以 trial 消耗为例，只有 `FREE_TRIAL_CONSUMPTION_ENABLED` 和 `free_trial_consumption_enabled` 都不是 false，才允许免费 trial 消耗。

## 自动止损策略

允许自动执行：

- 关闭 trial 免费消耗：`free_trial_consumption_enabled = {"enabled": false}`
- 关闭活动弹窗/领取：`free_trial_campaign_enabled = {"enabled": false}`
- 关闭每日自动问卷：`free_trial_auto_prompt_enabled = {"enabled": false}`

禁止自动执行：

- 删除用户数据。
- 删除或修正 grant。
- 修改真实积分。
- 修改订单。
- 给用户退款。
- 大规模更新用户表。
- 自动重新发放权益。

## 方式 A：服务器 cron 调用线上 API

每 5 分钟执行：

```bash
curl -X POST https://shenxiang.school/api/cron/free-trial-monitor \
  -H "Authorization: Bearer $CRON_SECRET"
```

推荐在服务器 crontab 中配置：

```cron
*/5 * * * * curl -fsS -X POST https://shenxiang.school/api/cron/free-trial-monitor -H "Authorization: Bearer $CRON_SECRET" >> /data/ai-essay-editor/logs/free-trial-monitor.log 2>&1
```

## 方式 B：crontab 调用本地脚本

```cron
*/5 * * * * cd /data/ai-essay-editor && node scripts/monitor-free-trial.mjs >> logs/free-trial-monitor.log 2>&1
```

脚本读取：

- `.env.local`
- `.env.production`
- `.env`

必须存在：

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 方式 C：GitHub Actions schedule 示例

仅当仓库 CI/CD 具备安全的 `CRON_SECRET` secret 时使用。

```yaml
name: Free Trial Monitor

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Call monitor endpoint
        run: |
          curl -fsS -X POST https://shenxiang.school/api/cron/free-trial-monitor \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## 手动开关

管理员后台路径：

```text
/admin -> 共创体验 -> 监控
```

可执行：

- 关闭 / 开启 trial 免费消耗
- 关闭 / 开启活动弹窗
- 关闭 / 开启自动问卷弹出
- 关闭 / 开启监控自动止损

所有按钮都需要浏览器二次确认，并记录 `updated_by`。

## 验证 SQL

```sql
select config_key, config_value, updated_by, updated_at
from free_trial_runtime_config
order by config_key;

select severity, status, incident_type, title, auto_action_taken, created_at
from monitor_incidents
order by created_at desc
limit 20;

select status, started_at, finished_at, checks_json, actions_json
from monitor_runs
order by started_at desc
limit 20;
```

## 紧急恢复

如果误关闭 trial 消耗，管理员可在后台重新开启，也可用 SQL 恢复：

```sql
update free_trial_runtime_config
set config_value = '{"enabled": true, "reason": "manual recovery"}',
    updated_by = 'manual_sql_recovery',
    updated_at = now()
where config_key = 'free_trial_consumption_enabled';
```
