# Mac / Windows 终端客户端一键接入教程

本文适合零基础用户，把星人 API 接入 Codex、Hermes、Claude Code 三个终端工具。

官方安装参考：

- Codex：OpenAI Codex CLI / GitHub `openai/codex`
- Claude Code：Anthropic Claude Code Setup
- Hermes：Hermes Agent Docs / GitHub `NousResearch/hermes-agent`

开始前先准备：

- 一台 Mac 或 Windows 电脑。
- 能打开终端：Mac 使用“终端”或 iTerm2；Windows 使用 PowerShell。
- 一个星人 API Key，格式通常是 `sk-...`。

如果你实在安装不了，可以联系管理员免费远程处理。远程处理前请先安装 UU 远程软件，并准备好你的电脑解锁密码；不要把 API Key、电脑密码发到聊天里。

## 一、先安装基础环境

### Mac

推荐先安装 Homebrew 和 Node.js。

打开“终端”，执行：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node git
node -v
npm -v
git --version
```

如果已经安装过，看到版本号即可继续。

### Windows

推荐使用 PowerShell。

先安装 Node.js 和 Git：

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
node -v
npm -v
git --version
```

如果 `winget` 不可用，请到官网下载并安装：

- Node.js LTS：https://nodejs.org/
- Git for Windows：https://git-scm.com/download/win

安装完成后，重新打开 PowerShell，再执行版本检查。

## 二、按官方推荐方式安装三个工具

### 安装 Codex

Codex 官方推荐方式之一是：

```bash
npm install -g @openai/codex
codex --version
```

Mac 也可以使用：

```bash
brew install --cask codex
codex --version
```

Windows 也可以使用官方安装脚本：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
codex --version
```

如果提示 npm 权限错误，先不要乱用 `sudo`，联系管理员处理。

### 安装 Hermes

Hermes 推荐用 `pipx` 独立安装，避免和系统 Python 包混在一起。

Mac / Linux / WSL2：

```bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
pipx install hermes-agent
hermes postinstall
hermes --version
```

如果上面失败，再尝试官方安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
hermes --version
```

Windows PowerShell：

```powershell
iex (irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1)
hermes --version
```

安装完成后，可以执行：

```bash
hermes doctor
```

如果检查不通过，把报错截图发给管理员。

### 安装 Claude Code

Claude Code 官方推荐 npm 安装：

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Windows 用户建议优先使用 WSL2 或 Git Bash。普通用户如果不清楚 WSL2 是什么，可以先用 PowerShell 安装；安装失败再联系管理员。

## 三、获取自己的星人 API Key

1. 打开控制台：https://api.aiphui.top
2. 登录你的账号。
3. 进入令牌 / API Key 页面。
4. 创建一个新的 API Key。
5. 复制这个 Key。

注意：

- 不要把 API Key 发给别人。
- 不要把 API Key 发到群里。
- 不要把 API Key 放进截图。
- 不要把 API Key 上传到 GitHub。

下面所有脚本里，把 `sk-你的星人APIKey` 替换成你自己的 Key。

## 四、Mac 一键配置

打开“终端”，整段复制执行。

```bash
read -s -p "请输入你的星人 API Key: " XINGREN_API_KEY
echo

mkdir -p "$HOME/.codex" "$HOME/.hermes" "$HOME/.claude"

printf "%s" "$XINGREN_API_KEY" > "$HOME/.codex/xingren_api_key"
chmod 600 "$HOME/.codex/xingren_api_key"

cat > "$HOME/.codex/config.toml" <<'EOF'
model = "gpt-5.5"
model_provider = "xingren"
model_reasoning_effort = "high"

[model_providers.xingren]
name = "星人 API"
base_url = "https://api.aiphui.top/v1"
wire_api = "chat"

[model_providers.xingren.auth]
command = "/bin/sh"
args = ["-lc", "cat \"$HOME/.codex/xingren_api_key\""]
timeout_ms = 5000
refresh_interval_ms = 0

[profiles.xingren]
model = "gpt-5.5"
model_provider = "xingren"
EOF

cat > "$HOME/.hermes/config.yaml" <<EOF
model:
  provider: custom
  default: gpt-5.5
  base_url: https://api.aiphui.top/v1
  api_key: $XINGREN_API_KEY
  context_length: 128000
EOF
chmod 600 "$HOME/.hermes/config.yaml"

cat > "$HOME/.claude/settings.json" <<EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.aiphui.top/claude",
    "ANTHROPIC_AUTH_TOKEN": "$XINGREN_API_KEY",
    "ANTHROPIC_MODEL": "cc-gpt-sonnet",
    "ANTHROPIC_SMALL_FAST_MODEL": "cc-gpt-haiku",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "model": "cc-gpt-sonnet"
}
EOF
chmod 600 "$HOME/.claude/settings.json"

echo "配置完成。请执行：codex --version && hermes --version && claude --version"
```

## 五、Windows 一键配置

打开 PowerShell，整段复制执行。

```powershell
$key = Read-Host "请输入你的星人 API Key"

$codexDir = Join-Path $HOME ".codex"
$hermesDir = Join-Path $HOME ".hermes"
$claudeDir = Join-Path $HOME ".claude"
New-Item -ItemType Directory -Force -Path $codexDir, $hermesDir, $claudeDir | Out-Null

Set-Content -Path (Join-Path $codexDir "xingren_api_key") -Value $key -NoNewline

@"
model = "gpt-5.5"
model_provider = "xingren"
model_reasoning_effort = "high"

[model_providers.xingren]
name = "星人 API"
base_url = "https://api.aiphui.top/v1"
wire_api = "chat"

[model_providers.xingren.auth]
command = "powershell"
args = ["-NoProfile", "-Command", "Get-Content `$HOME/.codex/xingren_api_key -Raw"]
timeout_ms = 5000
refresh_interval_ms = 0

[profiles.xingren]
model = "gpt-5.5"
model_provider = "xingren"
"@ | Set-Content -Path (Join-Path $codexDir "config.toml") -Encoding UTF8

@"
model:
  provider: custom
  default: gpt-5.5
  base_url: https://api.aiphui.top/v1
  api_key: $key
  context_length: 128000
"@ | Set-Content -Path (Join-Path $hermesDir "config.yaml") -Encoding UTF8

@"
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.aiphui.top/claude",
    "ANTHROPIC_AUTH_TOKEN": "$key",
    "ANTHROPIC_MODEL": "cc-gpt-sonnet",
    "ANTHROPIC_SMALL_FAST_MODEL": "cc-gpt-haiku",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "model": "cc-gpt-sonnet"
}
"@ | Set-Content -Path (Join-Path $claudeDir "settings.json") -Encoding UTF8

Write-Host "配置完成。请执行：codex --version; hermes --version; claude --version"
```

## 六、测试是否成功

### 测试 Codex

```bash
codex "请只回复：Codex 接入成功"
```

如果你想指定配置：

```bash
codex --profile xingren "请只回复：Codex 接入成功"
```

### 测试 Hermes

```bash
hermes -z "请只回复：Hermes 接入成功"
```

如果 Hermes 报模型错误，先执行：

```bash
hermes doctor
hermes config
```

把截图发给管理员。

### 测试 Claude Code

```bash
claude "请只回复：Claude Code 接入成功"
```

Claude Code 默认走：

```text
https://api.aiphui.top/claude
```

不要把 Claude Code 配成：

```text
https://api.aiphui.top/v1
```

`/v1` 是给普通 OpenAI-compatible 客户端用的，例如 Cherry Studio、Dify、OpenCat、Chatbox、Cursor。

## 七、模型怎么选

### Codex / Hermes

默认推荐：

```text
gpt-5.5
```

更省额度可以改：

```text
gpt-5.4-mini
```

代码审查可以用：

```text
codex-auto-review
```

### Claude Code

默认推荐：

```text
ANTHROPIC_MODEL=cc-gpt-sonnet
ANTHROPIC_SMALL_FAST_MODEL=cc-gpt-haiku
```

如果你想走 Claude 原生模型：

```text
ANTHROPIC_MODEL=cc-native-sonnet-fast
ANTHROPIC_SMALL_FAST_MODEL=cc-native-haiku
```

新手建议先用 `cc-gpt-sonnet`，稳定后再尝试 Claude 原生模型。

## 八、常见问题

### command not found

说明工具没有安装成功，或终端没有重新打开。

先执行：

```bash
node -v
npm -v
```

然后重新安装对应工具。

### 401 / invalid token

说明 API Key 不正确、复制少了字符、Key 已删除，或 Key 没有额度。

回到控制台重新创建一个 API Key，再执行一键配置脚本。

### 模型无权限

说明你的账号分组或 API Key 没有开这个模型。

先换成：

```text
gpt-5.4-mini
```

如果仍然失败，联系管理员。

### 请求很慢

可能是网络繁忙、模型服务排队、上下文太长或模型本身响应较慢。

建议先测试：

```text
gpt-5.4-mini
```

再测试更高级模型。

### Windows 安装失败

优先换 Git Bash 或 WSL2。不会处理也没关系，联系管理员免费远程处理。

远程处理前请安装 UU 远程软件。

## 九、给管理员看的本机参考配置

本教程对应的标准配置是：

| 工具 | 配置文件 | Base URL | 推荐模型 |
|---|---|---|---|
| Codex | `~/.codex/config.toml` | `https://api.aiphui.top/v1` | `gpt-5.5` |
| Hermes | `~/.hermes/config.yaml` | `https://api.aiphui.top/v1` | `gpt-5.5` |
| Claude Code | `~/.claude/settings.json` | `https://api.aiphui.top/claude` | `cc-gpt-sonnet` |

不要让 Claude Code 用户使用 `/v1/responses`。Claude Code 用户只需要配置：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="sk-用户自己的星人APIKey"
export ANTHROPIC_MODEL="cc-gpt-sonnet"
export ANTHROPIC_SMALL_FAST_MODEL="cc-gpt-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```
