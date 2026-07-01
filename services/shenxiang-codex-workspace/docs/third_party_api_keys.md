# 星人 API 第三方客户端接入教程

这份教程给零基础用户使用。你只需要记住一句话：不同工具复制不同的 Key，不要把 Key 发给别人。

## 新手先看：两个入口分别做什么

截图里的两个软件来自同一个 GitHub 公开仓库 `BigPizzaV3/CodexPlusPlus`：

- `Codex++`：静默启动入口。平时双击它来启动 Codex App，它会在外部启动 Codex 并注入增强功能。
- `Codex++ 管理工具`：配置和诊断面板。用它检查状态、配置中转注入、启用增强功能、查看日志、更新软件。

简单说：日常使用打开 `Codex++`；要配置 API、修复、更新或排查问题时打开 `Codex++ 管理工具`。

Codex++ 是第三方增强工具，不是星人 API 自研客户端。它的作用是让已经安装的 Codex App 更容易接入自定义 API，并补充删除会话、导出 Markdown、插件入口解锁、用户脚本、配置同步、Timeline 等增强能力。星人 API 提供的是可填写进去的 Base URL、API Key 和模型。

## 一、先打开四类系统 Key

1. 打开 `https://api.aiphui.top/codex/`。
2. 登录你的星人 API 账号。
3. 点击左侧 `第三方接入`。
4. 页面会自动同步四类 Key：
   - 星人 Codex 文本令牌
   - 星人高阶创作令牌
   - 星人图像生成令牌
   - 星人视频生成令牌
5. 需要接入哪个工具，就复制对应卡片里的 `Base URL` 和 `API Key`。

如果页面提示未登录，请先回到 `https://api.aiphui.top` 登录，再重新打开 Codex。

## 二、安装 Codex++

下载地址：

- GitHub 仓库：https://github.com/BigPizzaV3/CodexPlusPlus
- 最新 Release：https://github.com/BigPizzaV3/CodexPlusPlus/releases/latest

当前文档核对到的最新版是 `v1.2.18`。如果 GitHub 已发布更新，请优先下载 Release 页面最上方的最新版。

按系统选择安装包：

| 系统 | 下载文件 |
|---|---|
| Windows 64 位 | `CodexPlusPlus-*-windows-x64-setup.exe` |
| macOS Apple Silicon，M1/M2/M3/M4 | `CodexPlusPlus-*-macos-arm64.dmg` |
| macOS Intel | `CodexPlusPlus-*-macos-x64.dmg` |

Windows 安装后通常会出现桌面和开始菜单快捷方式。macOS DMG 安装后会出现：

- `/Applications/Codex++.app`
- `/Applications/Codex++ 管理工具.app`

macOS 如果提示“已损坏，无法打开”，通常是未签名应用被 Gatekeeper 拦截。确认安装包来自 GitHub Release 后，在终端执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/Codex++\ 管理工具.app
sudo xattr -rd com.apple.quarantine /Applications/Codex++.app
```

然后重新打开 `Codex++ 管理工具`。

## 三、用 Codex++ 管理工具配置星人 API

适用场景：你已经安装了 OpenAI Codex 桌面 App，并希望继续使用 Codex App 的界面，同时把模型请求转到星人 API。

准备内容：

```text
Base URL: https://api.aiphui.top/v1
API Key: 复制“星人 Codex 文本令牌”
Model: gpt-5.5
```

操作步骤：

1. 先打开原版 Codex App，确认已经能正常进入界面。
2. 关闭原版 Codex App。
3. 打开 `Codex++ 管理工具`。
4. 进入 `中转注入` 或 API 配置相关页面。
5. 新增一个配置，名称可以写 `星人 API`。
6. `Base URL` 填 `https://api.aiphui.top/v1`。
7. `API Key` 粘贴 `第三方接入` 里的 `星人 Codex 文本令牌`。
8. 模型填写 `gpt-5.5`；想省额度可以先填 `gpt-5.4-mini`。
9. 应用中转注入。
10. 以后日常启动请双击 `Codex++`，不要从原版 Codex 快捷方式启动。

如果 Codex++ 需要写入 `~/.codex/config.toml`，等价配置大致是：

```toml
model_provider = "CodexPlusPlus"

[model_providers.CodexPlusPlus]
name = "CodexPlusPlus"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://api.aiphui.top/v1"
experimental_bearer_token = "sk-你的星人Codex文本令牌"
```

不要把 `experimental_bearer_token` 里的真实 Key 发到群里、截图里或 GitHub issue 里。

## 四、Codex++ 两个软件的功能说明

### Codex++

`Codex++` 是静默启动器：

- 启动 Codex App。
- 通过 Chromium DevTools Protocol 注入增强脚本。
- 不显示管理界面。
- 不修改 Codex App 原始安装文件。
- macOS 上静默入口会隐藏 Dock 图标。
- 会在启动时检查更新；发现更新时会拉起管理工具提示更新。

日常使用建议：配置完成后，只打开 `Codex++`。

### Codex++ 管理工具

`Codex++ 管理工具` 是 Tauri 控制面板：

- 启动、检查、修复和更新 Codex++。
- 配置中转注入，添加多个自定义 API 配置。
- 在星人 API 和官方 ChatGPT 登录态之间切换。
- 管理增强功能开关。
- 管理用户脚本。
- 查看诊断和日志。
- 处理配置同步和本地会话状态。

常用增强功能：

- 解锁 API Key 登录模式下不可用的插件入口。
- 特殊插件强制安装。
- 会话删除按钮。
- 会话 Markdown 导出。
- 项目移动。
- Timeline。
- 从 Word 等富文本来源粘贴时只保留纯文本，避免被误识别成图片或文件附件。
- 远程 SSH 上下文中从 Codex 打开文件到 Zed Remote Development。
- 从 `upstream/<base-branch>` 创建新 worktree，减少从旧本地分支派生导致的冲突。

本地数据位置：

| 数据 | 位置 |
|---|---|
| Codex 配置 | `~/.codex/config.toml` |
| Codex 登录状态 | `~/.codex/auth.json` |
| Codex 本地数据库 | `~/.codex/sqlite/*.db` 或旧版 `~/.codex/state_5.sqlite` |
| Codex++ 状态与日志 | `~/.codex-session-delete/` |
| 配置同步备份 | `~/.codex/backups_state/provider-sync` |

## 五、如果你使用的是 Codex CLI

如果你不是使用桌面 Codex App，而是在终端里运行 `codex` 命令，不需要安装 Codex++。直接配置 OpenAI-compatible 客户端即可：

```text
Base URL: https://api.aiphui.top/v1
API Key: 复制“星人 Codex 文本令牌”
Model: gpt-5.5
```

macOS / Linux 可参考：

```bash
mkdir -p "$HOME/.codex"
printf "%s" "sk-你的星人Codex文本令牌" > "$HOME/.codex/xingren_api_key"
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

codex --profile xingren "请只回复：Codex 接入成功"
```

Windows PowerShell 可参考：

```powershell
$key = Read-Host "请输入你的星人 Codex 文本令牌"
$codexDir = Join-Path $HOME ".codex"
New-Item -ItemType Directory -Force -Path $codexDir | Out-Null
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

codex --profile xingren "请只回复：Codex 接入成功"
```

## 六、普通 OpenAI-compatible 客户端

适用工具：

- Cherry Studio
- OpenCat
- Chatbox
- Dify 的 OpenAI-compatible 模型接入
- 其他支持 OpenAI API 的客户端

填写方式：

```text
Base URL: https://api.aiphui.top/v1
API Key: 复制“星人 Codex 文本令牌”
Model: gpt-5.5 / gpt-5.4 / gpt-5.4-mini
```

建议新手先用：

```text
gpt-5.4-mini
```

需要更高质量再换：

```text
gpt-5.5
```

## 七、Dify 接入

1. 打开 Dify。
2. 进入模型接入设置。
3. 选择 `OpenAI-API-compatible`。
4. 填写：

```text
API Base URL: https://api.aiphui.top/v1
API Key: 复制“星人 Codex 文本令牌”
模型名称: gpt-5.4-mini
```

测试成功后，可以继续添加：

```text
gpt-5.5
gpt-5.4
```

注意：不要把 Base URL 填成 `/v1/chat/completions`，只填到 `/v1`。

## 八、Claude Code 接入

Claude Code 使用原生协议，所以要复制 `星人高阶创作令牌`。

macOS / Linux 终端输入：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="sk-你的星人高阶创作令牌"
export ANTHROPIC_MODEL="cc-native-sonnet-fast"
export ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

Windows PowerShell 输入：

```powershell
$env:ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
$env:ANTHROPIC_AUTH_TOKEN="sk-你的星人高阶创作令牌"
$env:ANTHROPIC_MODEL="cc-native-sonnet-fast"
$env:ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="1"
```

推荐模型：

```text
cc-native-haiku
cc-native-sonnet-fast
cc-native-sonnet-full
cc-native-opus-fast
cc-native-opus-full
```

如果你想用 GPT 模型映射 Claude Code：

```text
ANTHROPIC_MODEL=cc-gpt-sonnet
ANTHROPIC_SMALL_FAST_MODEL=cc-gpt-haiku
```

## 九、图像生成接入

复制 `星人图像生成令牌`。

```text
Base URL: https://api.aiphui.top/v1
API Key: 星人图像生成令牌
Model:
- 普通文生图：gpt-image-2-4K
- 图像局部编辑 / mask：gpt-image-2-4K 或 grok-imagine-image
```

图像生成接口通常是：

```text
POST https://api.aiphui.top/v1/images/generations
```

图像编辑接口通常是：

```text
POST https://api.aiphui.top/v1/images/edits
```

Image 2 支持 `/v1/images/edits` 和 mask。`mask` 必须是 PNG、小于 4MB，并且宽高和原图完全一致；透明区域会被重画，不透明区域会尽量保持不变。不同图像模型是独立模型，云 Codex 不会在它们之间自动切换；如果要使用其它图像模型，请在模型选择中明确选择。

生成图片后会在云 Codex 页面内直接预览；打开按钮只是辅助操作。

## 十、视频生成接入

复制 `星人视频生成令牌`。

```text
Base URL: https://api.aiphui.top/v1
API Key: 星人视频生成令牌
Model: 在第三方接入页面复制当前账户开放的视频模型
```

不同视频模型的请求参数可能不同。扩展视频模型走 `/v1/videos` 异步任务接口；参考素材必须显式传公网 URL 或 `Asset://...`，不会因为上传过素材就自动关联。新手建议优先在网站的媒体工坊里使用，不需要自己写接口。

生成视频后会在云 Codex 页面内直接预览；打开按钮只是辅助操作。

## 十一、Codex++ 常见排查

### 打开原版 Codex 后没有增强功能

请从 `Codex++` 启动，不要从原版 Codex 快捷方式启动。只有从 `Codex++` 启动时，增强脚本才会注入。

### Codex++ 菜单没出现

1. 关闭所有 Codex / Codex++ 窗口。
2. 打开 `Codex++ 管理工具`。
3. 查看 `诊断` 和 `日志` 页面。
4. 再从 `Codex++` 启动。

### 插件里提示后端连不上

Windows PowerShell 可先测试本机后端：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:57321/backend/status -Body "{}" -ContentType "application/json"
```

如果接口正常但 Codex 页面仍超时，通常是注入脚本缓存或 CDP bridge 问题。重启 Codex++ 后再试，并把管理工具日志截图给管理员。

### 想回到官方 ChatGPT 登录态

打开 `Codex++ 管理工具`，在 `中转注入` 页面点击清除 API 模式或切回官方登录态。不要手动乱删 `~/.codex` 目录。

### API Key 模式下插件入口不可用

这是 Codex 原生行为。Codex++ 的增强功能可以解锁插件入口；如果仍不可用，先确认增强注入开关已开启，并从 `Codex++` 而不是原版 Codex 启动。

## 十二、常见报错

### 401 / invalid token

含义：API Key 错了。

解决：

1. 重新复制对应 Key。
2. 确认前面有 `sk-`。
3. 不要复制空格。
4. Claude Code 要用 `星人高阶创作令牌`，不要用普通文本 Key。

### 403 / insufficient quota

含义：余额不足，或者 Key 没有额度。

解决：

1. 回到星人 API 控制台检查余额。
2. 兑换充值码。
3. 如果刚充值，刷新页面再试。

### 模型暂不可用

含义：该模型当前暂不可用，或者你的分组没有权限。

解决：

1. 换成 `gpt-5.4-mini` 测试。
2. 检查模型名有没有写错。
3. 如果是 Claude，确认走的是 `https://api.aiphui.top/claude`。
4. 联系管理员检查模型服务状态。

### model not found

含义：模型名称写错，或者这个 Key 不允许调用该模型。

解决：

1. 到 `第三方接入` 页面复制模型名。
2. 文本 Key 不调用图像/视频模型。
3. 图像 Key 不调用 Claude 模型。

### timeout / request timed out

含义：请求超时，可能是模型慢、网络不稳定或模型服务繁忙。

解决：

1. 先用小模型测试。
2. 关闭客户端里的超短超时设置。
3. 流式输出打开时体验更好。
4. 视频生成本来就慢，建议在网站媒体工坊里等待。

### Claude Code 没反应

排查顺序：

1. `ANTHROPIC_BASE_URL` 是否是 `https://api.aiphui.top/claude`。
2. `ANTHROPIC_AUTH_TOKEN` 是否复制了高阶创作令牌。
3. `ANTHROPIC_MODEL` 是否是 `cc-native-sonnet-fast` 这类 Claude Code 模型。
4. 终端重新打开后，之前的 export 会失效，需要重新设置，或写入 shell 配置文件。

## 十三、安全提醒

- 不要把 API Key 发给别人。
- 不要把 API Key 截图发到群里。
- 不同用途复制不同 Key。
- 如果怀疑 Key 泄露，到控制台禁用旧 Key，再刷新 Codex 重新生成。
- 不懂配置时，把报错截图发给管理员，不要发完整 Key。
