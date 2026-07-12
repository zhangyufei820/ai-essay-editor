# shenxiang-claude-gateway

独立 Claude Code / Anthropic Messages 协议适配网关。

它不保存第三方 Key，也不把底层服务信息暴露给客户端，只把用户自己的 New API Key 透传给 New API：

```text
Claude Code
  -> https://api.aiphui.top/claude/v1/messages
  -> shenxiang-claude-gateway
  -> http://shenxiang-new-api:3000/v1/chat/completions
  -> New API 额度、日志、fallback
```

## 两套模型机制

### 1. Claude Code 兼容模型

| Claude Code 模型名 | New API 实际模型 |
|---|---|
| `cc-gpt-haiku` | `gpt-5.4-mini` |
| `cc-gpt-sonnet` | `gpt-5.5` |
| `cc-gpt-opus` | `codex-auto-review` |
| `claude-sonnet-4-5-20250929` | `gpt-5.5` |
| `claude-opus-4-5-20251101` | `codex-auto-review` |

### 2. Claude 风格模型

| Claude Code 模型名 | New API 实际模型 |
|---|---|
| `cc-native-haiku` | `claude-haiku-4-5-20251001-full` |
| `cc-native-sonnet-fast` | `claude-sonnet-4-6-fast` |
| `cc-native-sonnet-full` | `claude-sonnet-4-6-full` |
| `cc-native-opus-fast` | `claude-opus-4-8-fast` |
| `cc-native-opus-full` | `claude-opus-4-8-full` |

完整映射见 `config/model-map.json`。

## Claude Code 使用

面向用户的详细教程见：

```text
docs/claude-code-user-guide.md
```

推荐先用已有证书的路径入口：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

如需使用 Claude 风格模型：

```bash
export ANTHROPIC_MODEL="cc-native-sonnet-fast"
export ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
```

## 本地测试

```bash
cd /opt/shenxiang-claude-gateway
./scripts/smoke_test.sh
printf '%s\n' "${NEW_API_KEY}" | ./scripts/smoke_test.sh
```

交互终端会静默询问 Key；自动化场景通过标准输入传入，避免 Key 出现在进程参数中。

## 安全边界

| 环境变量 | 默认值 | 用途 |
|---|---:|---|
| `REQUEST_TIMEOUT_MS` | `180000` | 上游请求完整生命周期超时 |
| `HEADERS_TIMEOUT_MS` | `15000` | 客户端请求头超时 |
| `REQUEST_BODY_TIMEOUT_MS` | `60000` | 客户端请求体超时 |
| `MAX_REQUEST_BODY_BYTES` | `33554432` | 两个 Messages POST 入口的请求体上限 |
| `MAX_SSE_BUFFER_BYTES` | `1048576` | 单个上游 SSE 事件缓冲上限 |
| `MAX_NON_STREAM_RESPONSE_BYTES` | `16777216` | 非流式响应聚合上限 |

## 回滚

```bash
cd /opt/shenxiang-claude-gateway
docker compose down
```

这个命令只停止 Claude Gateway，不影响 New API、MySQL、Redis、主站、Dify。
