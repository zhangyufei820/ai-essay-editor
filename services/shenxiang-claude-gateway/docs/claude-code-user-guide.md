# Claude Code 接入教程

这份教程给零基础用户使用。你只需要知道三件事：

1. `Base URL` 填 `https://api.aiphui.top/claude`
2. `API Key` 填你在星人 API 后台创建的 `sk-...`
3. 选择你想用的模型路线：GPT 映射模型，或 Claude 原生模型

不要把你的 API Key 发给别人，也不要发到群里、截图里、工单里。

## 一、先准备 API Key

1. 打开 `https://api.aiphui.top`
2. 登录你的账号。
3. 进入控制台。
4. 找到令牌 / API Key / Token 管理。
5. 创建一个新的 API Key。
6. 建议给它起名：`Claude Code`
7. 建议给它设置额度，避免误用。
8. 复制这个 Key。

Key 一般长这样：

```text
YOUR_NEW_API_KEY
```

下面所有命令里的 `YOUR_NEW_API_KEY` 都要替换成你自己的 Key。

## 二、路线 A：用 GPT 模型接入 Claude Code

这条路线适合大多数用户。它不是官方 Claude 模型，而是用 GPT / OpenAI-compatible 模型来兼容 Claude Code。

优点：

- 速度通常更快。
- 成本通常更低。
- 适合日常写代码、改代码、解释代码、生成脚本。

模型对应关系：

| 你在 Claude Code 里填写的模型名 | 后台实际调用的模型 |
|---|---|
| `cc-gpt-haiku` | `gpt-5.4-mini` |
| `cc-gpt-sonnet` | `gpt-5.5` |
| `cc-gpt-opus` | `codex-auto-review` |

推荐配置：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

每一行是什么意思：

| 配置项 | 作用 | 怎么填 |
|---|---|---|
| `ANTHROPIC_BASE_URL` | Claude Code 要连接的接口地址 | 固定填 `https://api.aiphui.top/claude` |
| `ANTHROPIC_AUTH_TOKEN` | 你的星人 API Key | 填你自己的 `sk-...` |
| `ANTHROPIC_MODEL` | 主模型 | 建议填 `cc-gpt-sonnet` |
| `ANTHROPIC_SMALL_FAST_MODEL` | 快速小模型 | 建议填 `cc-gpt-haiku` |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` | 允许 Claude Code 读取网关模型列表 | 固定填 `1` |

### macOS / Linux 使用方法

打开终端，把下面内容粘贴进去。记得替换 `YOUR_NEW_API_KEY`：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude
```

### Windows PowerShell 使用方法

打开 PowerShell，把下面内容粘贴进去。记得替换 `YOUR_NEW_API_KEY`：

```powershell
$env:ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
$env:ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
$env:ANTHROPIC_MODEL="cc-gpt-sonnet"
$env:ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="1"
claude
```

### 什么时候换模型

| 需求 | 建议模型 |
|---|---|
| 想省额度、做简单任务 | `cc-gpt-haiku` |
| 日常写代码、改代码 | `cc-gpt-sonnet` |
| 代码审查、复杂重构 | `cc-gpt-opus` |

临时切换主模型：

```bash
export ANTHROPIC_MODEL="cc-gpt-opus"
claude
```

## 三、路线 B：用 Claude 模型服务接入 Claude Code

这条路线适合想使用 Claude 输出风格的用户。

优点：

- 更接近 Claude 的原生输出风格。
- 更适合长代码理解、复杂推理、代码解释。

注意：

- 成本通常高于 GPT 映射路线。
- 如果你的账号分组没有开通对应模型权限，会提示模型暂不可用。

模型对应关系：

| 你在 Claude Code 里填写的模型名 | 后台实际调用的模型 |
|---|---|
| `cc-native-haiku` | `claude-haiku-4-5-20251001-full` |
| `cc-native-sonnet-fast` | `claude-sonnet-4-6-fast` |
| `cc-native-sonnet-full` | `claude-sonnet-4-6-full` |
| `cc-native-opus-fast` | `claude-opus-4-8-fast` |
| `cc-native-opus-full` | `claude-opus-4-8-full` |

推荐配置：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-native-sonnet-fast"
export ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

### macOS / Linux 使用方法

打开终端，把下面内容粘贴进去。记得替换 `YOUR_NEW_API_KEY`：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-native-sonnet-fast"
export ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude
```

### Windows PowerShell 使用方法

打开 PowerShell，把下面内容粘贴进去。记得替换 `YOUR_NEW_API_KEY`：

```powershell
$env:ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
$env:ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
$env:ANTHROPIC_MODEL="cc-native-sonnet-fast"
$env:ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="1"
claude
```

### 什么时候换模型

| 需求 | 建议模型 |
|---|---|
| 想用便宜一点的 Claude 原生小模型 | `cc-native-haiku` |
| 日常代码任务，速度优先 | `cc-native-sonnet-fast` |
| 日常代码任务，质量优先 | `cc-native-sonnet-full` |
| 复杂项目分析，速度优先 | `cc-native-opus-fast` |
| 复杂项目分析，质量优先 | `cc-native-opus-full` |

临时切换主模型：

```bash
export ANTHROPIC_MODEL="cc-native-opus-fast"
claude
```

## 四、如何确认是否接入成功

### 方法 1：启动 Claude Code

配置好环境变量后，在终端输入：

```bash
claude
```

如果能正常进入 Claude Code 对话界面，说明基础连接成功。

进入后可以问一句：

```text
请只回复：接入成功
```

如果模型回复了“接入成功”，说明请求已经走通。

### 方法 2：用 curl 测试模型列表

把 `YOUR_NEW_API_KEY` 换成你的真实 Key：

```bash
curl https://api.aiphui.top/claude/v1/models \
  -H "Authorization: Bearer YOUR_NEW_API_KEY"
```

如果看到很多模型名，例如：

```text
cc-gpt-haiku
cc-gpt-sonnet
cc-native-sonnet-fast
```

说明接口地址是通的。

### 方法 3：用 curl 测试一次对话

把 `YOUR_NEW_API_KEY` 换成你的真实 Key：

```bash
curl https://api.aiphui.top/claude/v1/messages \
  -H "Authorization: Bearer YOUR_NEW_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cc-gpt-haiku",
    "max_tokens": 64,
    "messages": [
      {
        "role": "user",
        "content": "请只回复：Claude Code 接入成功"
      }
    ]
  }'
```

如果返回里有 `Claude Code 接入成功`，说明对话接口正常。

## 五、不同工具应该填哪个地址

这里非常重要。星人 API 同时支持两类客户端，但它们填写的地址不一样。

如果地址填错，可能会出现模型明明存在，但调用失败、模型暂不可用、接口返回 `not implemented` 等问题。

### 先看结论

| 你使用的工具 | 正确 Base URL | 正确接口 | 推荐模型名 |
|---|---|---|---|
| Claude Code | `https://api.aiphui.top/claude` | `/v1/messages` | `cc-gpt-sonnet`、`cc-native-sonnet-fast` |
| Cherry Studio / OpenCat / Chatbox / Dify / 其他 OpenAI-compatible 客户端 | `https://api.aiphui.top/v1` | `/v1/chat/completions` | `gpt-5.4-mini`、`gpt-5.4`、`gpt-5.5`、已开放的 Claude 原生模型 |
| 自己写 OpenAI-compatible 程序 | `https://api.aiphui.top/v1` | `/v1/chat/completions` | 按后台模型列表填写 |
| 使用 Responses API 的程序 | 不建议用于 Claude 原生模型 | `/v1/responses` | 请改用 GPT 映射模型或 `/v1/chat/completions` |

### 1. Claude Code 用户怎么填

Claude Code 不是普通 OpenAI-compatible 客户端。它使用的是 Anthropic / Claude 风格的接口。

所以 Claude Code 必须这样填：

```text
Base URL: https://api.aiphui.top/claude
Auth Token: 你的星人 API Key
主模型: cc-gpt-sonnet 或 cc-native-sonnet-fast
小模型: cc-gpt-haiku 或 cc-native-haiku
```

也就是前面教程里的这一组：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude
```

如果你想走 Claude 原生模型，把模型改成：

```bash
export ANTHROPIC_MODEL="cc-native-sonnet-fast"
export ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
claude
```

Claude Code 用户不要填 `https://api.aiphui.top/v1`。这个地址是给 OpenAI-compatible 客户端用的。

### 2. OpenAI-compatible 客户端怎么填

如果你用的是 Cherry Studio、OpenCat、Chatbox、Dify、Cursor 的 OpenAI-compatible 配置，或者自己写的 OpenAI SDK 程序，一般应该填：

```text
Base URL: https://api.aiphui.top/v1
API Key: 你的星人 API Key
```

这些客户端通常会请求：

```text
POST https://api.aiphui.top/v1/chat/completions
GET  https://api.aiphui.top/v1/models
```

这是普通聊天、文本生成、代码问答最稳的入口。

curl 示例：

```bash
curl https://api.aiphui.top/v1/chat/completions \
  -H "Authorization: Bearer YOUR_NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4-mini",
    "messages": [
      {
        "role": "user",
        "content": "请只回复：OpenAI-compatible 接入成功"
      }
    ],
    "stream": false
  }'
```

如果你的账号已经开通 Claude 原生模型权限，也可以在 OpenAI-compatible 客户端里使用后台开放的 Claude 模型名，例如：

```text
claude-sonnet-4-6-fast
claude-sonnet-4-6-full
claude-opus-4-8-fast
claude-opus-4-8-full
```

但这些模型应走 `/v1/chat/completions`，不要走 `/v1/responses`。

### 3. 不要把 Claude 原生模型用于 `/v1/responses`

有些新版本 SDK、Codex 类工具或自写程序会默认请求：

```text
POST /v1/responses
```

目前 Claude 原生模型不适合走这条入口。

如果你把下面这些 Claude 原生模型拿去请求 `/v1/responses`：

```text
claude-haiku-4-5-20251001-full
claude-sonnet-4-5-20250929-fast
claude-sonnet-4-5-20250929-full
claude-sonnet-4-6-fast
claude-sonnet-4-6-full
claude-opus-4-8-fast
claude-opus-4-8-full
```

可能会看到类似错误：

```text
not implemented
```

这不代表你的 Key 坏了，也不代表 Claude 模型坏了。它的意思是：你使用了不适合这个模型的接口入口。

解决办法有三个：

1. 如果你是 Claude Code 用户，改用 `https://api.aiphui.top/claude`。
2. 如果你是普通 OpenAI-compatible 客户端，改用 `https://api.aiphui.top/v1/chat/completions`。
3. 如果你的工具只能使用 `/v1/responses`，先选择 GPT 映射类模型，不要选择 Claude 原生模型。

### 4. 怎么判断自己是哪一类用户

如果你不确定自己应该用哪个地址，看下面这张表。

| 你的情况 | 应该选 |
|---|---|
| 你正在使用 Claude Code 命令行 | `https://api.aiphui.top/claude` |
| 配置项叫 `ANTHROPIC_BASE_URL` | `https://api.aiphui.top/claude` |
| 配置项叫 `OpenAI Base URL`、`API Base URL`、`OpenAI-compatible` | `https://api.aiphui.top/v1` |
| 你用 Dify 添加模型服务接口 | `https://api.aiphui.top/v1` |
| 你用 Cherry Studio / OpenCat / Chatbox | `https://api.aiphui.top/v1` |
| 你自己写代码调用 `/v1/chat/completions` | `https://api.aiphui.top/v1` |
| 你自己写代码调用 `/v1/responses` | 不要选择 Claude 原生模型 |

最简单的判断：

- 看到 `ANTHROPIC` 这个词，就用 `/claude`。
- 看到 `OpenAI-compatible`，就用 `/v1`。
- 看到 `responses`，不要选 Claude 原生模型。

## 六、常见错误和解决办法

### 1. 提示 Unauthorized / Invalid token / 401

原因：

- API Key 写错了。
- 少写了 `sk-`。
- Key 已被删除或禁用。

解决：

1. 回到 `https://api.aiphui.top`。
2. 重新创建一个 API Key。
3. 复制完整 Key。
4. 重新设置 `ANTHROPIC_AUTH_TOKEN`。

### 2. 提示 insufficient quota / 额度不足

原因：

- 账号余额不足。
- 这个 API Key 的额度用完了。

解决：

1. 登录 `https://api.aiphui.top`。
2. 查看账户额度。
3. 查看 API Key 的额度限制。
4. 充值或兑换额度后再试。

### 3. 提示模型暂不可用

原因：

- 当前模型暂时不可用。
- 你的用户分组没有开通这个模型。
- 你选择了 Claude 原生模型，但账号没有 Claude 原生权限。

解决：

1. 先改用 GPT 映射路线：

```bash
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
claude
```

2. 如果还是失败，联系管理员开通模型权限。

### 4. Claude Code 仍然连官方 Anthropic

原因：

- 没有设置 `ANTHROPIC_BASE_URL`。
- 终端窗口关闭后，之前设置的环境变量失效了。

解决：

重新在当前终端粘贴：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

然后再运行：

```bash
claude
```

### 5. 模型回复很慢

可能原因：

- 选择了较贵或较慢的原生 Claude 模型。
- 服务繁忙。
- 当前任务太复杂。

建议：

- 想快一点，用 `cc-gpt-sonnet`。
- 想省一点，用 `cc-gpt-haiku`。
- 想要 Claude 原生风格，用 `cc-native-sonnet-fast`。

### 6. 提示 not implemented

原因：

- 你可能把 Claude 原生模型用于了 `/v1/responses`。
- 你的工具可能不是在请求 `/v1/chat/completions`，而是在请求 `/v1/responses`。
- Claude Code 可能没有配置 `ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"`。

解决：

1. Claude Code 用户重新设置：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude
```

2. OpenAI-compatible 客户端确认 Base URL 是：

```text
https://api.aiphui.top/v1
```

3. 自己写代码时优先使用：

```text
POST /v1/chat/completions
```

4. 如果你的工具只能走 `/v1/responses`，请先换成 GPT 映射模型，不要选择 Claude 原生模型。

## 七、推荐给新手的默认方案

如果你不知道选哪个，就直接用这一套：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="YOUR_NEW_API_KEY"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude
```

这套是 GPT 映射路线，适合大多数日常代码任务。

## 八、安全提醒

1. 不要把 API Key 发给任何人。
2. 不要把 API Key 写进公开 GitHub 仓库。
3. 不要把 API Key 放进截图。
4. 如果怀疑 Key 泄露，马上到后台删除旧 Key，重新创建新 Key。
5. 建议每个工具单独创建一个 Key，例如 `Claude Code`、`Dify`、`Cherry Studio` 分开管理。
6. 建议给每个 Key 设置额度，避免误用。
