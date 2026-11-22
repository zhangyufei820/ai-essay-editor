import { getWritingAnswerFailure, isInvalidWorkflowSkillResult } from "@/lib/workflow-skill-result"

const longEssay = "请升格下面的论述文：" + "人与世界如何相处，需要从个人、社会与公共秩序三个层次讨论。".repeat(12)

describe("workflow skill result", () => {
  it.each([
    '```json\n{\n  "skill": "thesis-helper",\n  服务暂时不可用，请稍后重试。\n}\n```',
    '{"skill":"thesis-helper","intent":"draft","confidence":0.9,"params":{}}',
    '```json\n{\n  "skill": "academic-thesis-review",\n  "query": "请评估我的论文提纲"\n}\n```',
    '{"skill":"thu-thesis","query":"请评估这段论文"}',
    '{"skill":"dissertation-workflow-core","query":"帮我规划章节"}',
    '{"skill":"thesis-helper",\nPluginInvokeError: API request failed with status code 503',
    '```json\n{"intent":"draft","skill":"thesis-helper","params":',
    '<think>正在识别论文类型</think>\n```json\n{"skill":"thesis-helper","query":"请评估绪论"}\n```',
  ])("rejects a router control payload (%s)", (answer) => {
    expect(getWritingAnswerFailure(answer)).toBe("routing_payload")
  })

  it.each([
    "服务暂时不可用，请稍后重试。",
    "**智能服务暂时不可用。请稍后重试或切换其他功能。**",
    "论文写作暂时无法处理这次请求，请重试。",
    "智能服务响应超时或连接中断。请先刷新当前会话或历史记录查看是否已有结果；若仍无结果，再重新提交。",
    "PluginInvokeError: API request failed with status code 503",
  ])("rejects a standalone service error (%s)", (answer) => {
    expect(getWritingAnswerFailure(answer)).toBe("provider_error")
  })

  it.each([
    "可以。请提供论文主题、研究方向和预期篇幅。",
    '```json\n{"title":"研究提纲","sections":["绪论","研究方法"],"error":null}\n```',
    '{"skill":"thesis-helper"}',
    '{"skill":"semantic-search","query":"论文索引"}',
    '{"skill":"thesis-helper","query":"题目","title":"公开调研"}',
    '{"skill":"thesis-helper","title":"论文规划","sections":["绪论","分析"]}',
    '下文用路由结构作为反例。\n```json\n{"skill":"thesis-helper","intent":"draft","params":{}}\n```\n正文应先阐明研究问题。',
    '接口文档可用 `{"error":"provider unavailable"}` 表示故障。',
  ])("preserves meaningful guidance and ordinary JSON (%s)", (answer) => {
    expect(getWritingAnswerFailure(answer)).toBeNull()
  })

  it("rejects the production greeting for a submitted long essay", () => {
    expect(isInvalidWorkflowSkillResult(
      "shenxiang-gaozhong-lunshuowen",
      longEssay,
      "你好呀，我可以帮你写公众号文章、润色中文、修改作文、处理论文或优化英语作文。你想先处理哪一类内容？",
    )).toBe(true)
  })

  it("accepts an actual writing result and does not alter short conversations", () => {
    expect(isInvalidWorkflowSkillResult(
      "shenxiang-gaozhong-lunshuowen",
      longEssay,
      "这篇文章的中心论点清楚，但第二段的例证与结论衔接较弱。建议先界定‘和’的含义，再分别论证个人与社会层面的关系。",
    )).toBe(false)
    expect(isInvalidWorkflowSkillResult("shenxiang-gaozhong-lunshuowen", "你好", "你好呀，我可以帮你写公众号文章。你想先处理哪一类内容？")).toBe(false)
    expect(isInvalidWorkflowSkillResult(null, longEssay, "你想先处理哪一类内容？")).toBe(false)
  })
})
