# 文本供应商模型级熔断

`discount` 与 `plus` 使用静态优先级表达主通道和 fallback。静态 fallback 只能在一次真实用户请求失败后重试，不能提前避开已故障的模型。`provider_monitor.py` 负责请求前健康门控：连续探测失败后只关闭故障 channel 的对应模型 ability，恢复达到成功阈值后自动重新开启。通道优先级不被动态改写，因此高优先级主通道恢复后会自然回切。

## 受管链路

- `discount_text`：channel `28/42/41`，固定 `discount` group 和 `gpt-5.5`、`gpt-5.6-sol`、`gpt-5.6-terra`；其他 GPT 模型不在受管集合中。
- `plus_text`：按三个受管私有 tag 动态解析 channel ID，固定 `plus` group、七个公开模型和 `30/20/10` 主备优先级。
- `configure_plus_text_channel.py` 的默认顺序与 `provider_monitor.py` 的监控基线必须一致；只切换主备时使用 order-only 操作，保留现有熔断和手工停用状态。
- 每个公开模型必须至少有一条真实可用链路；主渠道可以只覆盖真实存在的模型交集，未覆盖模型继续由下一优先级链路承载，不创建伪能力。
- 监控器只探测和恢复 channel 当前 `models` 中发布的能力；历史 disabled ability 不得越权恢复。
- `codex-auto-review` 通过 channel 的 `model_mapping` 使用 `gpt-5.5` 做原生 Responses 探测。
- channel ID、Tag、group、model 任一不匹配时拒绝写入。

监控器只自动恢复自己关闭并记录在 `/opt/shenxiang-new-api/data/provider-monitor-state.json` 的 ability。管理员手工关闭的 ability 不会被自动打开。首次接管一个已经手工停用的受管 channel 必须由运维显式传入 `--adopt-managed-disabled`；日常 Cron 不使用该参数。

## 请求与路由

探测 payload 最小化且不记录输入输出、密钥、供应商 URL 或完整上游错误。`discount_text` 的 channel `42` 使用 `/v1/chat/completions` 探测，其余受管通道使用原生 `/v1/responses`；两种探针都必须收到真实输出并完整结束才算成功。运行时对 `discount/plus` 选择出的 channel 做一次实时 ability 检查；被熔断的高优先级模型会在发出上游请求前直接跳到下一优先级。ability 查询异常时保持原有路由，避免 MySQL 短暂异常把整组误判为无可用通道。

## 调度

受控发布安装 `/etc/cron.d/shenxiang-new-api-provider-monitor`：

- 快速轮每分钟运行，只探测 `discount_text` 和 `plus_text`。
- 完整轮每 15 分钟运行，保留既有文本延迟、真实请求和媒体守卫。
- 两类任务错开分钟，并同时使用 provider-monitor lock 与 model-sync lock。

默认连续失败 `2` 次熔断，连续成功 `2` 次且满足 `300` 秒 cooldown 后恢复。可通过已有 `PROVIDER_MONITOR_*` 环境变量调整，但不得在 Cron 中放置密钥。

## 运维命令

```bash
/opt/shenxiang-new-api/scripts/provider_monitor.sh --fast --dry-run
/opt/shenxiang-new-api/scripts/provider_monitor.sh --full --dry-run
/opt/shenxiang-new-api/scripts/provider_monitor.sh --family discount_text --family plus_text
```

只调整 `plus` 主备顺序，不重置 channel status 或 ability enabled：

```bash
python3 /opt/shenxiang-new-api/scripts/configure_plus_text_channel.py --apply-order-only
```

一次性接管精确 Tag 的手工停用受管 channel：

```bash
/opt/shenxiang-new-api/scripts/provider_monitor.sh --family discount_text --adopt-managed-disabled
```

所有上线必须通过 `/opt/shenxiang-new-api/scripts/release-new-api.sh`，禁止直接覆盖生产脚本或 Cron。
