import { isWorkflowSkillAgent, type WorkflowSkillId } from "@/lib/workflow-skill-agents"
import { splitThinkingContent } from "@/lib/think-content"

const ROUTING_FIELDS = new Set(["skill", "intent", "confidence", "reply", "params", "params_json", "router_raw"])
// This is the dedicated paper-writing Dify router's output schema.
const PAPER_ROUTING_SKILLS = new Set([
  "thesis-helper", "academic-thesis-review", "mba-thesis-advisor", "thu-thesis", "dissertation-workflow-core",
])
const ROUTING_FIELD_PATTERN = /(?:^|\n|[,{])\s*"(?:intent|confidence|params|params_json|router_raw)"\s*:/
const ROUTING_SKILL_PATTERN = /(?:^|\n|[,{])\s*"skill"\s*:\s*"([A-Za-z0-9-]+|direct_reply)"/
const PUBLIC_SERVICE_ERROR_PATTERN = /^(?:智能|写作|论文写作|模型)?服务(?:暂时)?(?:不可用|异常)[，。！.!\s]*(?:请稍后重试(?:或切换其他功能)?[。！.!\s]*)?$/
const TECHNICAL_SERVICE_ERROR_PATTERN = /^(?:(?:API(?:Timeout|Connection)Error|PluginInvokeError|(?:LiteLLM\.)?(?:Timeout|ServiceUnavailable)Error|provider[_\s-]?error)\s*[:：]|API request failed with status code\s*[45]\d\d\b|(?:Request timed out|No available channel|No fallback model group found)\b)/i
const ROUTING_ERROR_PATTERN = /(?:服务(?:暂时)?不可用|PluginInvokeError|APITimeoutError|provider[_\s-]?error|API request failed with status code|Request timed out|No available channel|No fallback model group found)/i

export function getWritingAnswerFailure(answer: string): "routing_payload" | "provider_error" | null {
  const text = /<think>/i.test(answer) ? splitThinkingContent(answer).answer : answer.trim()
  const candidate = text.replace(/^```(?:json)?[ \t]*\r?\n/i, "").replace(/\s*```$/, "").trim()
  const skill = candidate.startsWith("{") ? candidate.match(ROUTING_SKILL_PATTERN)?.[1] : undefined

  if (skill && (PAPER_ROUTING_SKILLS.has(skill) || skill === "direct_reply" || isWorkflowSkillAgent(skill))) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>
      if (PAPER_ROUTING_SKILLS.has(skill) && value.skill === skill && typeof value.query === "string"
        && Object.keys(value).length === 2) return "routing_payload"
      if (value.skill === skill && ROUTING_FIELD_PATTERN.test(candidate)
        && Object.keys(value).every((key) => ROUTING_FIELDS.has(key))) {
        return "routing_payload"
      }
    } catch {
      if (ROUTING_FIELD_PATTERN.test(candidate) || ROUTING_ERROR_PATTERN.test(candidate)
        || /^\{\s*"skill"\s*:\s*"[^"\n]+"\s*,?\s*$/.test(candidate)) return "routing_payload"
    }
  }

  const plain = candidate.replace(/^(\*{1,2})([\s\S]+?)\1$/, "$2").trim()
  return plain === "论文写作暂时无法处理这次请求，请重试。"
    || /^(?:智能|图片|语音)?服务响应超时或连接中断。请先刷新当前会话或历史记录查看是否已有结果；若仍无结果，再重新提交。$/.test(plain)
    || PUBLIC_SERVICE_ERROR_PATTERN.test(plain) || TECHNICAL_SERVICE_ERROR_PATTERN.test(plain)
    ? "provider_error"
    : null
}

/** A long, explicit skill request must not be settled as an onboarding greeting. */
export function isInvalidWorkflowSkillResult(
  skillId: WorkflowSkillId | null,
  query: string,
  answer: string,
): boolean {
  if (!skillId || query.trim().length < 80) return false

  const text = answer.replace(/\s+/g, "").trim()
  if (!text || text.length > 180) return false

  return /你想先处理哪一类内容|我可以帮你写公众号文章|请(?:先)?(?:提供|发送|上传)(?:需要|你的|这篇|要)?(?:修改|批改|润色)?(?:的)?(?:文章|作文|内容)/.test(text)
}
