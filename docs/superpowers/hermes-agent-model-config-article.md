# Hermes Agent 装好了，然后呢？接模型才是真正的开始

上篇把环境装好了，很多人卡在这里：打开终端，输入 `hm`，弹出一个配置界面，然后——不知道填什么。

这篇解决最后一公里。

---

## 先搞清楚你的情况：免费还是付费？

这是最重要的选择题。选错了，要么连不上，要么花冤枉钱。

**按优先级排序，四个方案：**

| 优先级 | 方案 | 代表模型 | 费用 | 是否需要代理 |
|--------|------|----------|------|-------------|
| 🥇 第一梯队 | 硅基流动（等免费平台） | Qwen、DeepSeek 等 | **免费额度** | ❌ 不需要 |
| 🥈 第二梯队 | 国产模型官方 | Kimi、MiniMax | 按量，有免费额度 | ❌ 不需要 |
| 🥉 第三梯队 | 国内中转 API | Claude、GPT-4o、Gemini | 极低（≈官方 3-5 折） | ❌ 不需要 |
| 第四梯队 | OpenRouter / 官方 | Claude、GPT-4o、DeepSeek | 按官方定价 | ⚠️ 需要 |

**新用户建议**：从第一或第二梯队开始，零成本验证流程，确认通了再考虑付费。

---

## 方案一：硅基流动——零成本，模型多（推荐新手）

硅基流动（siliconflow.com）是国内一家 AI 模型聚合平台，新用户送 Token，免费用 Qwen、DeepSeek 等主流模型。

### 注册拿 Key

1. 访问 `siliconflow.com`，注册账号
2. 进入「API Keys」页面，点「创建」，复制 Key

### 接入 Hermes

硅基流动兼容 OpenAI 格式，用 Custom Endpoint 方式接入：

```bash
hermes model
```

向导里选 **Custom endpoint**（或 Custom API），然后：

- **Base URL** 填：`https://api.siliconflow.cn/v1`
- **API Key** 填：刚才复制的 Key
- **模型** 填：`Qwen/Qwen2.5-72B-Instruct`（或从平台控制台复制具体模型名）

### 验证

```bash
hermes "你好，请说出你的模型名称"
```

能回复，说明通了。

---

## 方案二：Kimi / MiniMax——国产官方，无需代理

### Kimi 接入步骤

**拿 Key**：访问 `platform.moonshot.cn` → 注册 → 「API Keys」→「新建」→ 复制（`sk-` 开头）

**接入**：
```bash
hermes model
```
选 **Kimi**，粘贴 Key，模型选 `moonshot-v1-128k`

**验证**：
```bash
hermes "你好，你是什么模型？"
```

### MiniMax 接入步骤

**拿 Key**：访问 `minimax.io` → 注册 → 拿 Key

**接入**：
```bash
hermes model
```
选 **MiniMax**，粘贴 Key，按向导选模型

**验证同上。**

⚠️ 两个平台都有免费额度，用完按量计费，适合小规模使用。

---

## 方案三：国内中转 API——用 Claude/GPT 但国内直连（付费但极便宜）

有稳定需求（如每天几十条对话），中转 API 是最优解。国内有很多中转平台，特点：兼容 OpenAI 格式、国内直连、价格约为官方的 3-5 折。

### 常见平台

| 平台 | 地址 | 特点 |
|------|------|------|
| **硅基流动**（也有付费版） | siliconflow.com | 模型多，稳定 |
| **高端复刻** | gaoduanfuke.com | 注册送 502 次 |
| **PoloAPI** | poloai.top | 支持 Grok-3、Thinking |

### 接入方式（和中转平台通用）

拿到的 Key 通常是 OpenAI 格式，接入方法：

```bash
hermes model
```

选 **Custom endpoint**，填：

- **Base URL**：中转平台给你的地址（格式如 `https://api.xx.com/v1`）
- **API Key**：粘贴你拿到的 Key
- **模型名**：填你需要的模型，如 `gpt-4o`、`claude-3-5-sonnet-20241022`

### 验证

```bash
hermes "你好"
```

能回复，按量查账单即可。

---

## 方案四：OpenRouter / Nous Portal——需要网络加速

⚠️ 这两个方案需要你的网络加速工具（Surge / Stash / Clash）正常工作，能访问外网。如果"允许局域网"没开，或代理挂了，这步会报 `Connection timeout`。

### OpenRouter

注册 `openrouter.ai`，拿 Key（`sk-or-` 开头）。

```bash
hermes model
```
选 **OpenRouter**，粘贴 Key，选模型。

常用模型：
- `deepseek/deepseek-r1`——推理强，价格低
- `anthropic/claude-sonnet-4-5`——编程写作质量高
- `openai/gpt-4o-mini`——速度快，便宜

### Nous Portal（原生 Hermes）

订阅制，OAuth 登录，不需要手动填 Key。

```bash
hermes model
```
选 **Nous Portal**，浏览器弹出授权页，登录 nousresearch.com 账号即可。

---

## 进阶：v0.8 Live Model Switching——对话中实时换模型

从 v0.8.0 开始，不用重启，直接在对话里换底层模型：

```
/model openrouter deepseek/deepseek-r1
/model kimi moonshot-v1-128k
```

典型用法：便宜模型处理数据整理，遇到复杂推理问题，一条命令切到 DeepSeek-R1，处理完再切回来。

---

## 常见翻车点

**1. 填了 Key，报 `AuthenticationError`**

Key 填错了，或者有多余空格。先查配置：

```bash
hermes config list
```

重新设：

```bash
hermes config set openai_api_key "你的key"
```

**2. 报 `ConnectionError: timeout`**

网络问题，不是 Key 的问题。三个解法：
- 换用第一/二/三梯队方案（国内直连，不需要代理）
- 检查加速工具的"允许局域网"有没有开
- 重启 WSL：`wsl --shutdown`，重开终端重试

**3. 报 `model not found`**

模型名拼错了。用向导选，不要手打：

```bash
hermes model
```

**4. 同时配了多个 Provider，不知道现在用哪个**

直接问它：

```bash
hermes "你是哪个模型？"
```

---

## 开始第一次对话

```bash
hm
```

进入对话，输入第一条消息。模型接好了，Hermes 会从你的问题里学习，越用越懂你。

---

**四句话总结：**

- 零成本起步 → 硅基流动免费额度
- 国内官方 → Kimi 或 MiniMax（注册有免费额度）
- 想用 Claude/GPT 但不想折腾代理 → 国内中转 API（≈官方 3-5 折）
- 有代理 → OpenRouter / Nous Portal，选择更多

下篇：把 Hermes 接入飞书、Telegram，让它变成团队里随时能用的 AI 助手。
