# 星人 API 第三方客户端接入教程

这份教程给零基础用户使用。你只需要记住一句话：不同工具复制不同的 Key，不要把 Key 发给别人。

## 一、先打开四类系统 Key

1. 打开 `https://api.aiphui.top/codex/`。
2. 登录你的星人 API 账号。
3. 点击左侧 `第三方接入`。
4. 页面会自动同步四类 Key：
   - 星人 Codex 文本令牌
   - 星人 Claude 高阶令牌
   - 星人图像生成令牌
   - 星人视频生成令牌
5. 需要接入哪个工具，就复制对应卡片里的 `Base URL` 和 `API Key`。

如果页面提示未登录，请先回到 `https://api.aiphui.top` 登录，再重新打开 Codex。

## 二、普通 OpenAI-compatible 客户端

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

## 三、Dify 接入

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

## 四、Claude Code 接入

Claude Code 使用 Claude 原生协议，所以要复制 `星人 Claude 高阶令牌`。

macOS / Linux 终端输入：

```bash
export ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
export ANTHROPIC_AUTH_TOKEN="sk-你的星人Claude高阶令牌"
export ANTHROPIC_MODEL="cc-native-sonnet-fast"
export ANTHROPIC_SMALL_FAST_MODEL="cc-native-haiku"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
```

Windows PowerShell 输入：

```powershell
$env:ANTHROPIC_BASE_URL="https://api.aiphui.top/claude"
$env:ANTHROPIC_AUTH_TOKEN="sk-你的星人Claude高阶令牌"
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

## 五、图像生成接入

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

`gpt-image-2-4K` 本身支持 `/v1/images/edits` 和 mask。`mask` 必须是 PNG、小于 4MB，并且宽高和原图完全一致；透明区域会被重画，不透明区域会尽量保持不变。`gpt-image-2-4K` 与 `grok-imagine-image` 是独立模型，云 Codex 不会在两者之间自动切换；如果要使用 Grok 图像，请在模型选择中明确选择。

生成图片后请及时下载，平台缓存文件只保留一段时间。

## 六、视频生成接入

复制 `星人视频生成令牌`。

```text
Base URL: https://api.aiphui.top/v1
API Key: 星人视频生成令牌
Model: seedance-2.0 / grok-video-super-720p
```

不同视频模型的请求参数可能不同。新手建议优先在网站的媒体工坊里使用，不需要自己写接口。

生成视频后请及时下载，平台缓存文件只保留一段时间。

## 七、常见报错

### 401 / invalid token

含义：API Key 错了。

解决：

1. 重新复制对应 Key。
2. 确认前面有 `sk-`。
3. 不要复制空格。
4. Claude Code 要用 `星人 Claude 高阶令牌`，不要用普通文本 Key。

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
2. `ANTHROPIC_AUTH_TOKEN` 是否复制了 Claude 高阶令牌。
3. `ANTHROPIC_MODEL` 是否是 `cc-native-sonnet-fast` 这类 Claude Code 模型。
4. 终端重新打开后，之前的 export 会失效，需要重新设置，或写入 shell 配置文件。

## 八、安全提醒

- 不要把 API Key 发给别人。
- 不要把 API Key 截图发到群里。
- 不同用途复制不同 Key。
- 如果怀疑 Key 泄露，到控制台禁用旧 Key，再刷新 Codex 重新生成。
- 不懂配置时，把报错截图发给管理员，不要发完整 Key。
