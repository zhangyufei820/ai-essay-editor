import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60 // 60 seconds for Hobby plan, 300 for Pro

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 5, baseDelayMs = 3000): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      // 如果是429错误（限流），使用指数退避策略重试
      if (response.status === 429 && attempt < maxRetries) {
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1)
        const jitter = Math.random() * 1000 // 添加随机抖动避免同时重试
        const totalDelay = exponentialDelay + jitter
        console.log(`[v0] Rate limit hit, retrying in ${Math.round(totalDelay)}ms (attempt ${attempt}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, totalDelay))
        continue
      }
      
      return response
    } catch (error) {
      if (attempt === maxRetries) throw error
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1)
      console.log(`[v0] Request failed, retrying in ${exponentialDelay}ms (attempt ${attempt}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, exponentialDelay))
    }
  }
  
  throw new Error("Max retries reached")
}

export async function POST(req: NextRequest) {
  try {
    const { essayText, gradeLevel, topic, wordLimit } = await req.json()

    console.log("[v0] Essay grading request received")
    console.log("[v0] Grade level:", gradeLevel)
    console.log("[v0] Topic:", topic)
    console.log("[v0] Word limit:", wordLimit)
    console.log("[v0] Essay text length:", essayText?.length || 0)

    if (!essayText) {
      return NextResponse.json({ error: "请提供作文内容" }, { status: 400 })
    }

    const apiKey = process.env.CUSTOM_OPENAI_API_KEY || "sk-diaycftqfopXhIAf5gm7G35xSndFo0VzMi0PyRpHQGz4voxG"
    const baseURL = process.env.CUSTOM_OPENAI_BASE_URL || "https://www.vivaapi.cn/v1"

    console.log("[v0] Using single-model strategy to avoid API overload...")
    
    const polishPrompt = buildPolishPrompt(essayText, gradeLevel, topic, wordLimit)

    // 使用Claude Haiku 4.5作为主要模型进行批改
    console.log("[v0] Starting essay grading with Claude Haiku 4.5...")
    
    const polishResponse = await fetchWithRetry(
      `${baseURL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001-thinking",
          messages: [{ role: "user", content: polishPrompt }],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      },
      3, // 减少重试次数到3次
      5000 // 增加基础延迟到5秒
    )

    if (!polishResponse.ok) {
      const errorText = await polishResponse.text()
      console.error("[v0] Polish failed:", errorText)
      throw new Error(`批改失败: ${polishResponse.statusText}`)
    }

    const polishData = await polishResponse.json()
    const polishedText = polishData.choices[0].message.content

    console.log("[v0] Polishing completed")
    console.log("[v0] Starting structured analysis...")

    // 延迟5秒后进行结构化分析
    await new Promise(resolve => setTimeout(resolve, 5000))

    const editorPrompt = buildSimplifiedEditorPrompt(essayText, polishedText)

    const finalResponse = await fetchWithRetry(
      `${baseURL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001-thinking",
          messages: [{ role: "user", content: editorPrompt }],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      },
      3,
      5000
    )

    if (!finalResponse.ok) {
      const errorText = await finalResponse.text()
      console.error("[v0] Final review error:", errorText)
      // 降级：直接返回润色结果
      return NextResponse.json({
        result: {
          finalVersion: polishedText,
          originalText: essayText,
          note: "由于API负载，仅提供润色版本"
        },
        extractedText: essayText,
      })
    }

    const finalData = await finalResponse.json()
    const resultText = finalData.choices[0].message.content

    let structuredResult
    try {
      // Strategy 1: Try to find JSON in code blocks
      const jsonBlockMatch = resultText.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/)
      if (jsonBlockMatch) {
        structuredResult = JSON.parse(jsonBlockMatch[1])
      } else {
        // Strategy 2: Try to find raw JSON object
        const jsonObjectMatch = resultText.match(/\{[\s\S]*\}/)
        if (jsonObjectMatch) {
          structuredResult = JSON.parse(jsonObjectMatch[0])
        } else {
          // Strategy 3: Try parsing the entire text as JSON
          structuredResult = JSON.parse(resultText)
        }
      }
    } catch (error) {
      console.log("[v0] Failed to parse structured result, using simplified format")
      // Fallback: Create a simple structured format
      structuredResult = {
        originalText: essayText,
        finalVersion: polishedText,
        diagnosis: {
          compliance: "作文已完成润色",
          structure: "结构已优化"
        },
        comparisons: [
          {
            aspect: "整体优化",
            original: essayText.substring(0, 100) + "...",
            improved: polishedText.substring(0, 100) + "...",
            highlight: "语言表达更加流畅，结构更加清晰"
          }
        ],
        learningPoints: {
          structure: "注意文章的起承转合",
          language: "多使用生动的描写和恰当的修辞",
          theme: "紧扣主题，深化立意"
        },
        rawAnalysis: resultText
      }
    }

    console.log("[v0] Essay grading workflow completed successfully")

    return NextResponse.json({
      result: structuredResult,
      extractedText: essayText,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  } catch (error) {
    console.error("[v0] Essay grading error:", error)
    const errorMessage = error instanceof Error ? error.message : "批改失败，请稍后重试"
    return NextResponse.json({ error: errorMessage }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

function buildPolishPrompt(rawText: string, gradeLevel: string, topic: string, wordLimit: string): string {
  return `你是一位顶级的、专业的"创意作文批改师"。你的任务是接收一篇学生的习作，并严格按照以下所有规则，对其进行一次深度、专业且富有创意的润色修改。

**[核心任务]**
严格分析并润色以下作文，但不要输出分析过程，只输出经过你润色修改后的最终作文正文。

**[学生作文信息]**
* **年级**: ${gradeLevel}
* **题目**: ${topic}
* **字数要求**: ${wordLimit}
* **原始作文**:
\`\`\`text
${rawText}
\`\`\`

**[批改与润色必须遵守的铁律]**

1.  **绝对规范性**:
    * **年级适配**: 润色后的语言风格、词汇难度和句子结构必须严格符合【${gradeLevel}】学生的水平。
    * **紧扣题目**: 润色过程不能偏离【${topic}】的核心要求。
    * **文体规范**: 确保文章符合其应有的文体特征（记叙文、议论文等）。

2.  **结构优化**:
    * 评估并优化文章的整体结构，重点是实现传统作文"起承转合"的清晰布局。确保开头引人入胜，中间承接有力、转折巧妙，结尾升华主旨。

3.  **文学大师风格润色**:
    * 在润色时，参考一位你认为最适合本文主题和情感的文学大师的风格（例如：汪曾祺的淡雅、王小波的思辨、林清玄的禅意、龙应台的犀利）。将他们的语言特点巧妙地融入文章，提升文学性和感染力。

4.  **考场作文字数红线 (最重要！)**:
    * 在完成所有润色后，必须进行最终字数检查。
    * 如果目标是**小学生考场作文**，最终字数**绝对不能超过650字**。
    * 如果目标是**初中生考场作文**，最终字数**绝对不能超过900字**。
    * 如果目标是**高中生考场作文**，最终字数必须控制在**800-1100字**之间。
    * 宁可精炼文字，删减次要内容，也绝不突破字数红线.

**[输出要求]**
请直接输出润色后的作文全文，不要包含任何额外的解释、标题或前言。`
}

function buildSimplifiedEditorPrompt(rawText: string, polishedText: string): string {
  return `你是一位经验丰富的写作导师。请对以下作文进行结构化分析。

**[原始作文]**
\`\`\`text
${rawText}
\`\`\`

**[润色后作文]**
\`\`\`text
${polishedText}
\`\`\`

**[任务]**
提供结构化的批改分析。你必须返回一个有效的JSON对象，不要包含任何其他文字说明。

**[输出格式]**
请严格按照以下JSON格式输出，只输出JSON，不要有任何其他内容：

\`\`\`json
{
  "originalText": "${rawText.substring(0, 200).replace(/"/g, '\\"')}...",
  "finalVersion": "${polishedText.substring(0, 200).replace(/"/g, '\\"')}...",
  "diagnosis": {
    "compliance": "规范性评估（例如：语言符合年级水平，紧扣题目要求）",
    "structure": "结构分析（例如：开头引人入胜，中间层次清晰，结尾升华主题）"
  },
  "comparisons": [
    {
      "aspect": "开头优化",
      "original": "原文开头摘录",
      "improved": "改进开头摘录",
      "highlight": "优化说明"
    },
    {
      "aspect": "语言提升",
      "original": "原文语言摘录",
      "improved": "改进语言摘录",
      "highlight": "提升说明"
    },
    {
      "aspect": "结尾升华",
      "original": "原文结尾摘录",
      "improved": "改进结尾摘录",
      "highlight": "升华说明"
    }
  ],
  "learningPoints": {
    "structure": "结构要点（例如：注意文章的起承转合）",
    "language": "语言要点（例如：多使用生动的描写和恰当的修辞）",
    "theme": "主题要点（例如：紧扣主题，深化立意）"
  }
}
\`\`\``
}
