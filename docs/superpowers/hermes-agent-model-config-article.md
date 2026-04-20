# Hermes Agent 装好了，然后呢？接模型才是真正的开始

上篇把环境装好了，很多人卡在这里：打开终端，输入 `hm`，弹出一个配置界面，然后——不知道填什么。

这篇解决最后一公里。

---

## 一条命令，进入配置

装好 Hermes Agent 之后，模型接入只需要一条命令：

```bash
hermes model
```

回车，进入交互式向导。向导会依次问你三件事：

1. **选 Provider**：你要用哪家的模型？
2. **填 API Key**：去对应平台复制一个 Key 粘贴进来
3. **选模型**：从列表里选一个你要用的型号

整个流程不超过 2 分钟。

---

## 先搞清楚你的情况：国内还是国外？

这是最重要的选择题。选错了，填完 Key 还是连不上。

**国内用户，首选这两个——不需要代理，直接连：**

| Provider | 代表模型 | 费用 |
|----------|----------|------|
| **Kimi（月之暗面）** | moonshot-v1-128k | 按量计费，新用户有免费额度 |
| **MiniMax** | MiniMax-Text-01 | 按量计费，新用户有免费额度 |

**有稳定网络加速工具的用户，可以解锁全部选择：**

| Provider | 代表模型 | 适合场景 |
|----------|----------|----------|
| **OpenRouter** | Claude、GPT-4o、DeepSeek-R1 等 200+ 个 | 想一个平台用所有主流模型 |
| **Nous Portal** | Hermes 3（70B / 405B）| 想用最原生的 Hermes 模型 |
| **DeepSeek 官方** | DeepSeek-V3、DeepSeek-R1 | 推理任务，性价比高 |

---

## 方案一：Kimi 接入（国内直连，推荐新手）

### 第一步：拿 API Key

打开浏览器，访问 `platform.moonshot.cn`，注册账号，进入「API Keys」页面，点「新建」，复制生成的 Key（以 `sk-` 开头）。

⚠️ **Key 只显示一次，拿到之后先粘贴到记事本里**，不然页面一关就找不回来了。

### 第二步：填入 Hermes

```bash
hermes model
```

向导出来后：
- Provider 列表里选 **Kimi**
- 粘贴刚才复制的 Key
- 模型选 `moonshot-v1-128k`（128k 上下文，适合处理长文档）

### 第三步：验证

```bash
hermes "你好，请说出你用的是什么模型"
```

如果返回了 Kimi 的回复，说明接通了。

✅ 验证成功：看到模型正常回复，没有报错。

---

## 方案二：OpenRouter（一个账号，200+ 个模型）

适合想灵活切换模型的用户。注册一次，Claude、GPT-4o、DeepSeek-R1 都能用。

### 第一步：拿 API Key

访问 `openrouter.ai`，注册，进入「Keys」页面，点「Create Key」，复制。

Key 格式以 `sk-or-` 开头，注意区分不同 provider 的 Key 格式。

### 第二步：填入 Hermes

```bash
hermes model
```

选 **OpenRouter**，粘贴 Key，然后选模型。

模型名格式是"提供商/模型名"，几个常用的：

| 模型 | 适合干什么 |
|------|----------|
| `deepseek/deepseek-r1` | 推理、分析、解题，便宜 |
| `anthropic/claude-sonnet-4-5` | 写作、编程，输出质量高 |
| `openai/gpt-4o-mini` | 日常对话，速度快 |
| `google/gemini-2.0-flash-001` | 长文档处理，免费额度大 |

⚠️ **前提是你的网络加速工具可以连到 openrouter.ai**。如果填完 Key 报 `Connection timeout`，是网络问题，不是 Key 的问题。

---

## 方案三：Nous Portal（原生 Hermes，订阅制）

Hermes Agent 的原厂服务。按月订阅，不需要自己管 Key，模型是 Hermes 3（70B / 405B），函数调用能力是所有方案里最好的。

```bash
hermes model
```

选 **Nous Portal**，会弹出一个 OAuth 登录链接，浏览器里登录 nousresearch.com 账号授权即可，不需要手动填 Key。

---

## v0.8 新功能：对话中实时换模型

从 v0.8.0 开始，不用重启，可以在对话里直接切换底层模型：

```
/model openrouter deepseek/deepseek-r1
/model kimi moonshot-v1-128k
```

实际使用场景：用便宜模型处理数据整理，遇到需要深度推理的问题，一条命令切到 DeepSeek-R1，处理完再切回来。

---

## 常见翻车点

**1. 填了 Key，报 `AuthenticationError`**

Key 填错了，或者有多余的空格。

先查当前配置：
```bash
hermes config list
```

看 Key 有没有问题，重新设：
```bash
hermes config set openrouter_api_key "sk-or-你的key"
```

**2. 报 `ConnectionError: timeout`**

这是网络问题，不是 Key 的问题。

两个选项：
- 换成 Kimi 或 MiniMax（国内直连，不需要代理）
- 检查网络加速工具的"允许局域网"有没有开

**3. 报 `model not found`**

模型名写错了。通过向导重新选，不要手动输模型名：

```bash
hermes model
```

**4. 配了好几个 Provider，不知道现在用的哪个**

```bash
hermes "你是哪家的模型？"
```

它会告诉你。

---

## 开始第一次对话

模型接好后，直接用：

```bash
hm
```

进入对话界面，输入第一条消息。

Hermes 会从你的问题里学习，记录偏好，越用越懂你。

---

环境搭好，模型接通，才算真正准备好了。

下一篇会写怎么把 Hermes 接入飞书、Telegram，让它变成团队里随时能用的 AI 助手。
