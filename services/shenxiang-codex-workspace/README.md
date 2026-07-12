# shenxiang-codex-workspace

独立的星人 Codex 云工作台，用于把 New API 登录用户变成可视化 Codex 使用界面。

它不接入 `shenxiang.school` 主站 Supabase，不复用主站数据库，不挂载主站目录，不暴露公网端口。

## 架构

```text
用户浏览器
  ↓
https://api.aiphui.top/codex
  ↓
OpenResty / Nginx
  ↓
127.0.0.1:3140
  ↓
shenxiang-codex-workspace
  ↓
独立 Redis + 独立 runs/user-skills/codex-home
  ↓
用户自己的 New API Key -> https://api.aiphui.top/v1
```

## 用户体验

用户只需要：

1. 登录 New API。
2. 打开 Codex 工作台。
3. 选择真实模型名和社区 Skill。
4. 直接发送消息、上传文件或图片。
5. 查看流式 Codex 事件和最终回复。

## 安全边界

- Codex 后端通过 New API 登录 Cookie 和 `New-Api-User` 自动同步用户。
- 系统会为用户创建或复用“星人 Codex 自动令牌”，浏览器不展示、不要求用户手动填写 API Key。
- 每个用户按 New API 用户 ID 生成独立任务目录。
- 任务目录位于 `runs/user_xxx/task_xxx`。
- 社区 Skill 位于 `user-skills/community/installed`，所有用户可见。
- 用户可以创建社区共享 Skill，创建前必须同意公开共享规则。
- 用户不允许删除任何文件。
- API 层按 New API 用户 ID 校验任务、Skill 和历史数据的访问边界。
- Worker 不挂载 `/data/ai-essay-editor`、`/opt/shenxiang-new-api`、Docker socket、Nginx/OpenResty、1Panel 或 SSH 目录。
- 任务数据默认保留 24 小时，由 `scripts/cleanup_runs.sh` 定时清理。

当前任务目录和 Worker 仍共享同一 Unix UID 与宿主挂载；上述边界属于应用层隔离，不等同于操作系统级强隔离。运行不可信代码前仍需补充 per-task 容器、mount namespace 或等价沙箱。

## 部署

```bash
cd /opt/shenxiang-codex-workspace
cp .env.example .env
./scripts/generate_secrets.sh
nano .env
./scripts/deploy.sh
```

## 本机测试

```bash
curl http://127.0.0.1:3140/health
./scripts/smoke_test.sh sk-兼容测试Key
```

## 反代接入

把 `nginx/codex-location.conf` 里的 location 块人工加入 `api.aiphui.top` 的 443 server 块，或按现有 OpenResty 管理方式 include。

接入前必须：

```bash
docker exec shenxiang-openresty nginx -t
```

测试通过后再 reload。

## 定时清理

建议 crontab：

```cron
*/30 * * * * /opt/shenxiang-codex-workspace/scripts/cleanup_runs.sh >> /opt/shenxiang-codex-workspace/runs/cleanup.log 2>&1
```

## 回滚

停止独立 Codex 工作台：

```bash
cd /opt/shenxiang-codex-workspace
docker compose down
```

这个命令只影响：

- `shenxiang-codex-workspace`
- `shenxiang-codex-worker-fast`
- `shenxiang-codex-worker-heavy`
- `shenxiang-codex-workspace-redis`
