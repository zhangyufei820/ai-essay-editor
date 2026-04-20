# 装好了Hermes Agent不知道接哪个模型？看这篇

搞了半天WSL2，然后卡在"选Provider"这步——很多人都在这里放弃了。

---

**一条命令进配置：**
```bash
hermes model
```
向导会问你三件事：用哪家模型、填API Key、选型号。

---

**国内用户，这两个不需要代理，直接连：**

🟢 **Kimi（推荐新手）**
→ platform.moonshot.cn 注册
→ 生成API Key（sk-开头）
→ hermes model 选Kimi，粘贴Key，选 moonshot-v1-128k

🟢 **MiniMax**
→ 同理，minimax.io 注册拿Key

---

**有加速工具的，解锁全部选项：**

⚡ **OpenRouter** = 一个账号用200+个模型
→ Claude、GPT-4o、DeepSeek-R1全有

常用模型：
- `deepseek/deepseek-r1` → 推理分析
- `anthropic/claude-sonnet-4-5` → 写作编程
- `openai/gpt-4o-mini` → 日常快速对话

---

**验证一下：**
```bash
hermes "你好，你是什么模型？"
```
它能回答，就通了。

---

**三个高频翻车点：**

① AuthenticationError → Key填错了，重新设：
`hermes config set openrouter_api_key "你的key"`

② ConnectionError → 不是Key的问题，是网络问题
→ 换Kimi/MiniMax国内直连

③ model not found → 模型名输错了，用向导选不要手打

---

接通模型才算真正开始用Hermes。

下篇：把Hermes接进飞书/Telegram，变成团队AI助手
