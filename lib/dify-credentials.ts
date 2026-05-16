type Env = Record<string, string | undefined>

export type DifyCredentialSelection = {
  credential: string
  source: string
}

export function getDifyCredentialForModel(
  model: string | null | undefined,
  env: Env = process.env,
  defaultCredential = env.ESSAY_CORRECTION_API_KEY || env.DIFY_API_KEY || "",
): DifyCredentialSelection {
  switch (model) {
    case "general-chat":
      return selectGeneralChatCredential(env, defaultCredential)
    case "teaching-pro":
      return selectCredential(env.DIFY_TEACHING_PRO_API_KEY, "DIFY_TEACHING_PRO_API_KEY", defaultCredential)
    case "gpt-5":
      return selectCredential(env.DIFY_API_KEY_GPT5, "DIFY_API_KEY_GPT5", defaultCredential)
    case "claude-opus":
      return selectCredential(env.DIFY_API_KEY_CLAUDE, "DIFY_API_KEY_CLAUDE", defaultCredential)
    case "gemini-pro":
      return selectCredential(env.DIFY_API_KEY_GEMINI, "DIFY_API_KEY_GEMINI", defaultCredential)
    case "gemini-image":
      return selectCredential(
        env.GEMINI_IMAGE_GATEWAY_TOKEN || env.DIFY_IMAGE_GATEWAY_TOKEN,
        env.GEMINI_IMAGE_GATEWAY_TOKEN ? "GEMINI_IMAGE_GATEWAY_TOKEN" : "DIFY_IMAGE_GATEWAY_TOKEN",
        defaultCredential,
      )
    case "banana":
    case "banana-2-pro":
      return selectCredential(env.DIFY_BANANA_API_KEY, "DIFY_BANANA_API_KEY", defaultCredential)
    case "gpt-image-2":
      return selectCredential(env.DIFY_IMAGE_GATEWAY_TOKEN, "DIFY_IMAGE_GATEWAY_TOKEN", defaultCredential)
    case "grok-4.2":
      return selectCredential(env.DIFY_API_KEY_GROK42, "DIFY_API_KEY_GROK42", defaultCredential)
    case "open-claw":
      return selectCredential(env.DIFY_API_KEY_OPENCLAW, "DIFY_API_KEY_OPENCLAW", defaultCredential)
    case "quanquan-math":
      return selectCredential(env.DIFY_QUANQUANMATH_API_KEY, "DIFY_QUANQUANMATH_API_KEY", defaultCredential)
    case "quanquan-english":
      return selectCredential(env.DIFY_QUANQUANENGLISH_API_KEY, "DIFY_QUANQUANENGLISH_API_KEY", defaultCredential)
    case "vocab-card":
      return selectCredential(env.DIFY_VOCAB_CARD_API_KEY, "DIFY_VOCAB_CARD_API_KEY", defaultCredential)
    case "beike-pro":
      return selectCredential(env.DIFY_BEIKE_PRO_API_KEY, "DIFY_BEIKE_PRO_API_KEY", defaultCredential)
    case "banzhuren":
      return selectCredential(env.DIFY_BANZHUREN_API_KEY, "DIFY_BANZHUREN_API_KEY", defaultCredential)
    case "all-in-one-agent":
      return selectRequiredProductionCredential(
        env.DIFY_ALL_IN_ONE_AGENT_API_KEY,
        "DIFY_ALL_IN_ONE_AGENT_API_KEY",
        env,
        defaultCredential,
      )
    case "worksheet-diagnosis":
      return selectRequiredProductionCredential(
        env.DIFY_WORKSHEET_DIAGNOSIS_API_KEY,
        "DIFY_WORKSHEET_DIAGNOSIS_API_KEY",
        env,
        defaultCredential,
      )
    case "ai-writing-paper":
    case "zhongying-essay":
    case "reading-report":
    case "experiment-report":
    case "study-abroad":
    case "resume-optimize":
    case "speech-defense":
    case "school-wechat":
      return selectCredential(env.DIFY_AI_WRITING_PAPER_API_KEY, "DIFY_AI_WRITING_PAPER_API_KEY", defaultCredential)
    default:
      return { credential: defaultCredential, source: "DEFAULT_DIFY_KEY" }
  }
}

function selectGeneralChatCredential(env: Env, defaultCredential: string): DifyCredentialSelection {
  if (env.DIFY_GENERAL_CHAT_API_KEY) {
    return { credential: env.DIFY_GENERAL_CHAT_API_KEY, source: "DIFY_GENERAL_CHAT_API_KEY" }
  }

  if (env.DIFY_API_KEY) {
    return { credential: env.DIFY_API_KEY, source: "DIFY_API_KEY" }
  }

  if (env.NODE_ENV === "production") {
    console.warn("[Dify Credentials] DIFY_GENERAL_CHAT_API_KEY or DIFY_API_KEY is required for general-chat in production")
    return { credential: "", source: "DIFY_GENERAL_CHAT_API_KEY or DIFY_API_KEY" }
  }

  const devFallback = env.DIFY_API_KEY_GPT5 || defaultCredential
  if (devFallback) {
    console.warn("[Dify Credentials] DIFY_GENERAL_CHAT_API_KEY missing; using local development fallback")
  }
  return selectCredential(devFallback, "DIFY_GENERAL_CHAT_API_KEY", defaultCredential)
}

function selectCredential(
  credential: string | undefined,
  source: string,
  defaultCredential: string,
): DifyCredentialSelection {
  if (credential) return { credential, source }
  return { credential: defaultCredential, source: "DEFAULT_DIFY_KEY" }
}

function selectRequiredProductionCredential(
  credential: string | undefined,
  source: string,
  env: Env,
  defaultCredential: string,
): DifyCredentialSelection {
  if (credential) return { credential, source }
  if (env.NODE_ENV === "production") {
    console.warn(`[Dify Credentials] ${source} is required in production`)
    return { credential: "", source }
  }
  return selectCredential(credential, source, defaultCredential)
}
