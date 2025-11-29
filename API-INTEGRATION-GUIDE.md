# API集成指南

本文档说明如何从您的自定义前端（shenxiang.school）调用后端API。

## API端点

### 1. 作文批改API
**端点**: `POST /api/essay-grade`

**请求体**:
\`\`\`json
{
  "essayText": "作文全文内容",
  "gradeLevel": "小学|初中|高中",
  "topic": "作文题目",
  "wordLimit": "字数要求"
}
\`\`\`

**响应**:
\`\`\`json
{
  "result": {
    "originalText": "原文",
    "finalVersion": "润色后的版本",
    "diagnosis": {
      "compliance": "规范性评估",
      "structure": "结构分析"
    },
    "comparisons": [
      {
        "aspect": "优化方面",
        "original": "原文摘录",
        "improved": "改进摘录",
        "highlight": "优化说明"
      }
    ],
    "learningPoints": {
      "structure": "结构要点",
      "language": "语言要点",
      "theme": "主题要点"
    }
  },
  "extractedText": "提取的作文文本"
}
\`\`\`

### 2. 聊天API
**端点**: `POST /api/chat`

**请求头**:
\`\`\`
Content-Type: application/json
X-AI-Provider: vivaapi (可选)
X-AI-Model: 模型名称 (可选，默认gpt-4o)
\`\`\`

**请求体**:
\`\`\`json
{
  "messages": [
    {
      "role": "user",
      "content": "用户消息"
    }
  ],
  "files": [], // 可选：文件数组
  "extractedText": "" // 可选：提取的文本
}
\`\`\`

**响应**: 流式响应（SSE格式）

## CORS配置

所有API端点已配置CORS，允许来自任何域名的请求（包括shenxiang.school）。

## 环境变量

确保在Vercel项目中配置以下环境变量：

\`\`\`
CUSTOM_OPENAI_API_KEY=您的VivaAPI密钥
CUSTOM_OPENAI_BASE_URL=https://www.vivaapi.cn/v1
\`\`\`

## 支持的模型

VivaAPI支持以下模型：
- GPT系列: gpt-5, gpt-5-2025-08-07, gpt-5-mini等
- Claude系列: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929等
- Gemini系列: gemini-2.5-flash, gemini-3-pro等

## 使用示例

### 从前端调用作文批改API:

\`\`\`javascript
const response = await fetch('https://your-vercel-domain.vercel.app/api/essay-grade', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    essayText: '学生作文全文...',
    gradeLevel: '高中',
    topic: '记叙文',
    wordLimit: '800字'
  })
});

const result = await response.json();
console.log(result);
\`\`\`

### 从前端调用聊天API (流式):

\`\`\`javascript
const response = await fetch('https://your-vercel-domain.vercel.app/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-AI-Model': 'gpt-5'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '你好' }
    ]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  // 处理流式数据...
}
\`\`\`

## 错误处理

API会返回以下HTTP状态码：
- 200: 成功
- 400: 请求参数错误
- 429: API限流（需要重试）
- 500: 服务器错误

错误响应格式：
\`\`\`json
{
  "error": "错误描述"
}
\`\`\`

## 注意事项

1. VivaAPI可能会出现429限流错误，后端已实现指数退避重试机制
2. 作文批改API最长执行时间为60秒
3. 聊天API最长执行时间为30秒
4. 流式响应使用SSE（Server-Sent Events）格式
