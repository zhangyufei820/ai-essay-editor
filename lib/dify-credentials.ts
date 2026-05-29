type Env = Record<string, string | undefined>

export type DifyCredentialSelection = {
  credential: string
  source: string
}

export function getDifyCredentialForModel(
  model: string | null | undefined,
  env: Env = process.env,
  _defaultCredential = "",
): DifyCredentialSelection {
  switch (model || "general-chat") {
    case "general-chat":
      return selectRequiredCredential(env.DIFY_GENERAL_CHAT_API_KEY, "DIFY_GENERAL_CHAT_API_KEY", env)
    case "standard":
      return selectRequiredCredential(env.ESSAY_CORRECTION_API_KEY, "ESSAY_CORRECTION_API_KEY", env)
    case "workflow-skill":
      return selectRequiredCredential(env.DIFY_WORKFLOW_SKILL_API_KEY, "DIFY_WORKFLOW_SKILL_API_KEY", env)
    case "teaching-pro":
      return selectRequiredCredential(env.DIFY_TEACHING_PRO_API_KEY, "DIFY_TEACHING_PRO_API_KEY", env)
    case "gpt-5":
      return selectRequiredCredential(env.DIFY_API_KEY_GPT5, "DIFY_API_KEY_GPT5", env)
    case "claude-opus":
      return selectRequiredCredential(env.DIFY_API_KEY_CLAUDE, "DIFY_API_KEY_CLAUDE", env)
    case "gemini-pro":
      return selectRequiredCredential(env.DIFY_API_KEY_GEMINI, "DIFY_API_KEY_GEMINI", env)
    case "banana":
    case "banana-2-pro":
      return { credential: "", source: "GEMINI_IMAGE_GATEWAY" }
    case "gemini-image":
      return { credential: "", source: "GEMINI_IMAGE_GATEWAY" }
    case "gpt-image-2":
      return selectRequiredCredential(env.DIFY_GPT_IMAGE_API_KEY, "DIFY_GPT_IMAGE_API_KEY", env)
    case "grok-4.2":
      return selectRequiredCredential(env.DIFY_API_KEY_GROK42, "DIFY_API_KEY_GROK42", env)
    case "open-claw":
      return selectRequiredCredential(env.DIFY_API_KEY_OPENCLAW, "DIFY_API_KEY_OPENCLAW", env)
    case "quanquan-math":
      return selectRequiredCredential(env.DIFY_QUANQUANMATH_API_KEY, "DIFY_QUANQUANMATH_API_KEY", env)
    case "quanquan-english":
      return selectRequiredCredential(env.DIFY_QUANQUANENGLISH_API_KEY, "DIFY_QUANQUANENGLISH_API_KEY", env)
    case "vocab-card":
      return selectRequiredCredential(env.DIFY_VOCAB_CARD_API_KEY, "DIFY_VOCAB_CARD_API_KEY", env)
    case "problem":
      return selectRequiredCredential(env.DIFY_PROBLEM_API_KEY, "DIFY_PROBLEM_API_KEY", env)
    case "beike-pro":
      return selectRequiredCredential(env.DIFY_BEIKE_PRO_API_KEY, "DIFY_BEIKE_PRO_API_KEY", env)
    case "banzhuren":
      return selectRequiredCredential(env.DIFY_BANZHUREN_API_KEY, "DIFY_BANZHUREN_API_KEY", env)
    case "all-in-one-agent":
      return selectRequiredCredential(env.DIFY_ALL_IN_ONE_AGENT_API_KEY, "DIFY_ALL_IN_ONE_AGENT_API_KEY", env)
    case "super-all-in-one-agent":
      return selectRequiredCredential(env.DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY, "DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY", env)
    case "worksheet-diagnosis":
      return selectRequiredCredential(env.DIFY_WORKSHEET_DIAGNOSIS_API_KEY, "DIFY_WORKSHEET_DIAGNOSIS_API_KEY", env)
    case "ai-writing-paper":
    case "zhongying-essay":
    case "reading-report":
    case "study-abroad":
    case "resume-optimize":
    case "speech-defense":
    case "school-wechat":
      return selectRequiredCredential(env.DIFY_AI_WRITING_PAPER_API_KEY, "DIFY_AI_WRITING_PAPER_API_KEY", env)
    case "experiment-report":
      return selectRequiredCredential(env.DIFY_EXPERIMENT_REPORT_API_KEY, "DIFY_EXPERIMENT_REPORT_API_KEY", env)
    default:
      console.warn(`[Dify Credentials] Unsupported Dify model: ${model || "general-chat"}`)
      return { credential: "", source: "UNSUPPORTED_DIFY_MODEL" }
  }
}

function selectRequiredCredential(
  credential: string | undefined,
  source: string,
  env: Env,
): DifyCredentialSelection {
  if (credential) return { credential, source }
  console.warn(`[Dify Credentials] ${source} is required for this Dify app`)
  return { credential: "", source }
}
