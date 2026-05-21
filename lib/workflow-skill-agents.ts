export const WORKFLOW_SKILL_IDS = [
  "khazix-writer",
  "Chinese",
  "Grammar",
  "thesis-helper",
  "mba-thesis-advisor",
  "academic-thesis-review",
  "shenxiang-lunwen-shenping",
  "shenxiang-paper-review-v5",
  "shenxiang-chuzhong-xiuxi-piyue",
  "shenxiang-yi-lunwen-piyue",
  "shenxiang-lunshuowen",
  "shenxiang-gaozhong-lunshuowen",
  "shenxiang-zuowen-shengge",
  "shenxiang-zuowen-zhangxiaofeng",
  "shenxiang-xiaoxuezuowen",
  "shenxiang-xueweipigai-revise",
  "shenxiang-xiaoxue-zuowen-piyue",
  "shenxiang-xiaoxue-xiangxiang-zuowen",
  "shenxiang-xiaoxue-5grade-zhengwen",
  "shenxiang-gaozhong-yingyu-zuowen",
  "xueersi-english-grammar-check",
] as const

export type WorkflowSkillId = (typeof WORKFLOW_SKILL_IDS)[number]

const WORKFLOW_SKILL_ID_SET = new Set<string>(WORKFLOW_SKILL_IDS)

export function isWorkflowSkillAgent(value?: string | null): value is WorkflowSkillId {
  return Boolean(value && WORKFLOW_SKILL_ID_SET.has(value))
}
