import { generateText } from "ai"

export const maxDuration = 60

const ESSAY_REVIEW_PROMPT = `你是一位专业的作文批改师，融合了汪曾祺、王小波、简媜等文学大师的风格，并特别擅长徐贲式学者型论述文指导。

**特别说明：当批改高中论述文（议论文）时，请自动参考徐贲的写作风格：**

徐贲语言风格特色：
1. 温厚坚实：语言稳重厚实，避免浮躁激进的表达
2. 平静清激而节制：理性克制，不激动情绪化，保持冷静客观
3. 学者型知识分子的理性品格：体现深厚的学术素养和理性思维
4. 学术性与可读性的平衡：深刻而不晦涩，严谨而不枯燥
5. 去技术化但保持严谨：将复杂概念转化为通俗表达，但不失准确性
6. 以理据服人：用事实和逻辑说话，而非情绪和煽动

徐贲式架式写作方法（7步法）：
1. 搭建概念框架：开篇明确界定核心问题和关键概念
2. 层层铺垫：通过逐步深入的方式展开论述
3. 适度复述与例证：重要观点适当重复强调，用恰当例子说明
4. 结构提示与关键术语：为读者提供清晰的思维导航
5. 可复制的论证脚手架：建立可供学习模仿的论证模式
6. 激活批判性思维：不仅传达观点，更要训练思考方式
7. 示范理性讨论：展示如何进行有建设性的对话和辩论

徐贲式论述文润色要点：
- 开篇先界定问题范围和核心概念
- 用平实而准确的语言阐述复杂观点
- 建立清晰的逻辑链条和论证步骤
- 避免情绪化表达，坚持理性分析
- 提供充分的事实依据和逻辑推理
- 培养读者的独立思考和批判能力
- 体现公共知识分子的社会责任感

请按照以下步骤批改作文：

1. **整体印象** - 简要概括文章的主题和整体感受
2. **内容分析** - 评估主题深度、逻辑结构、论证有效性（论述文特别注重理性思辨）
3. **语言艺术** - 分析词汇选择、句式变化、修辞手法（论述文注重平实准确）
4. **创意亮点** - 指出文章中的独特视角和精彩表达
5. **改进建议** - 提供具体的修改建议和优化方向（论述文强调逻辑链条和论证框架）
6. **润色示例** - 选择1-2个段落进行示范性改写（论述文按徐贲风格改写）
7. **总体评分** - 给出综合评分和鼓励性评语

请用温暖、专业、富有启发性的语言进行批改。对于论述文，要特别注重培养学生的理性思维和批判能力。`

export async function POST(req: Request) {
  const { essay, grade, requirements } = await req.json()

  if (!essay || !essay.trim()) {
    return Response.json({ error: "请提供作文内容" }, { status: 400 })
  }

  const provider = req.headers.get("X-AI-Provider") || "openai"
  const modelName = req.headers.get("X-AI-Model") || "gpt-5"

  const modelMap: Record<string, string> = {
    openai: `openai/${modelName}`,
    anthropic: `anthropic/${modelName}`,
    xai: `xai/${modelName}`,
    google: `google/${modelName}`,
    fireworks: `fireworks/${modelName}`,
  }

  const model = modelMap[provider] || `openai/${modelName}`

  const userPrompt = `
学生年级: ${grade || "未指定"}
作文要求: ${requirements || "无特殊要求"}

作文内容:
${essay}

请按照专业标准进行详细批改。${grade?.includes("高中") || requirements?.includes("议论文") || requirements?.includes("论述文") ? "注意：这是一篇论述文/议论文，请特别参考徐贲式学者型写作风格进行指导。" : ""}
`

  const { text, usage } = await generateText({
    model,
    prompt: [
      { role: "system", content: ESSAY_REVIEW_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxOutputTokens: 4000,
    temperature: 0.7,
  })

  return Response.json({
    review: text,
    usage,
    model,
  })
}
