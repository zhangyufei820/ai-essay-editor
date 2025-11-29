# 使用自己的API密钥指南

本指南说明如何配置和使用您自己的AI API密钥，而不是通过Vercel AI Gateway。

## 支持的AI提供商

系统支持以下AI提供商的自定义API密钥：

1. **OpenAI** - GPT系列模型
2. **Anthropic** - Claude系列模型
3. **Google** - Gemini系列模型
4. **DeepSeek** - 国产高性价比模型
5. **Moonshot (月之暗面)** - Kimi系列模型

## 配置步骤

### 1. 获取API密钥

**OpenAI:**
- 访问 https://platform.openai.com/api-keys
- 创建新的API密钥
- 复制密钥（只显示一次）

**Anthropic:**
- 访问 https://console.anthropic.com/settings/keys
- 创建新的API密钥
- 复制密钥

**Google AI:**
- 访问 https://makersuite.google.com/app/apikey
- 创建API密钥
- 复制密钥

**DeepSeek:**
- 访问 https://platform.deepseek.com/api_keys
- 注册并创建API密钥
- 价格：约¥0.001/1K tokens（非常便宜）

**Moonshot (Kimi):**
- 访问 https://platform.moonshot.cn/console/api-keys
- 注册并创建API密钥
- 支持超长上下文（200K tokens）

### 2. 在Vercel中添加环境变量

在v0的环境变量设置中添加以下变量：

\`\`\`bash
# OpenAI
CUSTOM_OPENAI_API_KEY=sk-xxx
CUSTOM_OPENAI_BASE_URL=https://api.openai.com/v1

# Anthropic
CUSTOM_ANTHROPIC_API_KEY=sk-ant-xxx
CUSTOM_ANTHROPIC_BASE_URL=https://api.anthropic.com

# Google
CUSTOM_GOOGLE_API_KEY=AIzaSyxxx

# DeepSeek（推荐：性价比高）
CUSTOM_DEEPSEEK_API_KEY=sk-xxx
CUSTOM_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# Moonshot（推荐：超长上下文）
CUSTOM_MOONSHOT_API_KEY=sk-xxx
CUSTOM_MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
\`\`\`

### 3. 使用自定义API

配置完成后，系统会自动检测并使用您的自定义API密钥。

**优先级：**
1. 如果配置了自定义API密钥，优先使用
2. 如果没有配置，回退到Vercel AI Gateway

## 成本对比

| 提供商 | 模型 | 价格（每1K tokens） | 特点 |
|--------|------|-------------------|------|
| OpenAI | GPT-4 | $0.03 | 最强大 |
| Anthropic | Claude-3.5 | $0.015 | 长上下文 |
| Google | Gemini Pro | $0.002 | 性价比高 |
| DeepSeek | DeepSeek-V3 | ¥0.001 | 极低价格 |
| Moonshot | Kimi | ¥0.012 | 200K上下文 |

## 国内AI提供商推荐

如果您的用户主要在中国，推荐使用以下国产AI：

1. **DeepSeek** - 性价比最高，质量接近GPT-4
2. **Moonshot (Kimi)** - 超长上下文，适合处理长文档
3. **智谱AI (GLM)** - 中文理解能力强
4. **百川智能** - 专注中文场景

## 使用建议

1. **混合使用**：简单任务用便宜模型，复杂任务用高级模型
2. **设置预算**：在各平台设置月度预算上限
3. **监控使用**：定期检查API使用量和费用
4. **缓存优化**：对相同问题缓存结果，减少API调用

## 故障排除

**问题：API密钥无效**
- 检查密钥是否正确复制
- 确认密钥没有过期
- 检查账户是否有余额

**问题：请求失败**
- 检查BASE_URL是否正确
- 确认网络可以访问API端点
- 查看错误日志获取详细信息

**问题：费用过高**
- 使用更便宜的模型
- 减少max_tokens限制
- 实现请求缓存
- 设置速率限制
