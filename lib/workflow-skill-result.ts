import type { WorkflowSkillId } from "@/lib/workflow-skill-agents"

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
