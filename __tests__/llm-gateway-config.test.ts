import fs from "fs"
import path from "path"
import yaml from "js-yaml"

type GatewayModel = {
  model_name: string
  litellm_params?: {
    model?: string
    order?: number
    timeout?: number
  }
  model_info?: {
    id?: string
    mode?: string
    health_check_timeout?: number
    health_check_max_tokens?: number
    disable_background_health_check?: boolean
  }
}

type GatewayConfig = {
  model_list: GatewayModel[]
  guardrails?: Array<{
    guardrail_name?: string
    litellm_params?: {
      guardrail?: string
      mode?: string[]
      default_on?: boolean
      blocked_words_file?: string
      categories?: Array<{
        category?: string
        action?: string
        severity_threshold?: string
      }>
    }
  }>
  router_settings: {
    cooldown_time?: number
    allowed_fails?: number
    routing_strategy?: string
    routing_strategy_args?: Record<string, number>
    allowed_fails_policy?: Record<string, number>
    fallbacks?: Array<Record<string, string[]>>
  }
  general_settings: {
    background_health_checks?: boolean
    enable_health_check_routing?: boolean
    health_check_interval?: number
    health_check_concurrency?: number
    health_check_staleness_threshold?: number
    health_check_skip_disabled_background_models?: boolean
  }
}

const configPath = path.join(process.cwd(), "services/llm-gateway/config.yaml")

function loadConfig() {
  return yaml.load(fs.readFileSync(configPath, "utf8")) as GatewayConfig
}

function modelsByName(config: GatewayConfig, name: string) {
  return config.model_list.filter((item) => item.model_name === name)
}

describe("llm gateway reliability config", () => {
  it("enables bounded active health checks and proactive routing", () => {
    const config = loadConfig()

    expect(config.general_settings.background_health_checks).toBe(true)
    expect(config.general_settings.enable_health_check_routing).toBe(true)
    expect(config.general_settings.health_check_concurrency).toBe(1)
    expect(config.general_settings.health_check_interval).toBeGreaterThanOrEqual(180)
    expect(config.general_settings.health_check_staleness_threshold).toBeGreaterThanOrEqual(360)
    expect(config.general_settings.health_check_skip_disabled_background_models).toBe(true)
    expect(config.router_settings.cooldown_time).toBeGreaterThanOrEqual(240)
    expect(config.router_settings.allowed_fails).toBeLessThanOrEqual(1)
    expect(config.router_settings.allowed_fails_policy?.AuthenticationErrorAllowedFails).toBe(0)
    expect(config.router_settings.allowed_fails_policy?.RateLimitErrorAllowedFails).toBe(0)
    expect(config.router_settings.allowed_fails_policy?.BadRequestErrorAllowedFails).toBe(0)
  })

  it("keeps hot text and vision aliases pinned to a single primary deployment", () => {
    const config = loadConfig()
    const expectedAliases = [
      "sx-fast-chat",
      "sx-chinese-text",
      "sx-math-text",
      "sx-general-text",
      "sx-image-vision",
    ]

    for (const alias of expectedAliases) {
      const deployments = modelsByName(config, alias)
      expect(deployments).toHaveLength(1)
      expect(deployments.every((item) => item.model_info?.id)).toBe(true)
      expect(deployments.every((item) => item.model_info?.mode === "chat")).toBe(true)
      expect(deployments.every((item) => typeof item.litellm_params?.timeout === "number")).toBe(true)
    }
  })

  it("keeps background probes light enough for production traffic", () => {
    const config = loadConfig()
    const enabledDeployments = new Map<string, GatewayModel>()

    for (const deployment of config.model_list) {
      const info = deployment.model_info
      if (!info?.id || info.disable_background_health_check) continue
      if (!enabledDeployments.has(info.id)) enabledDeployments.set(info.id, deployment)
    }

    const probes = [...enabledDeployments.values()]
    expect(probes.length).toBeLessThanOrEqual(15)
    expect(probes.every((item) => (item.model_info?.health_check_timeout || 0) <= 10)).toBe(true)
    expect(probes.every((item) => (item.model_info?.health_check_max_tokens || 0) <= 3)).toBe(true)
  })

  it("keeps hot GPT aliases on the tokenflux primaries while fallback chains reuse shared deployments", () => {
    const config = loadConfig()
    const fastIds = new Set(modelsByName(config, "sx-fast-chat").map((item) => item.model_info?.id))
    const mathIds = new Set(modelsByName(config, "sx-math-text").map((item) => item.model_info?.id))
    const generalIds = new Set(modelsByName(config, "sx-general-text").map((item) => item.model_info?.id))

    for (const id of ["deploy-tokenflux-gpt-5-5"]) {
      expect(fastIds.has(id)).toBe(true)
      expect(mathIds.has(id)).toBe(true)
      expect(generalIds.has(id)).toBe(true)
    }
  })

  it("keeps gateway model names ASCII-safe for response headers", () => {
    const config = loadConfig()

    for (const model of config.model_list) {
      expect(model.model_name).toMatch(/^[\x20-\x7E]+$/)
    }

    for (const fallback of config.router_settings.fallbacks || []) {
      for (const [source, targets] of Object.entries(fallback)) {
        expect(source).toMatch(/^[\x20-\x7E]+$/)
        for (const target of targets) {
          expect(target).toMatch(/^[\x20-\x7E]+$/)
        }
      }
    }
  })

  it("only points fallbacks at configured model names", () => {
    const config = loadConfig()
    const modelNames = new Set(config.model_list.map((item) => item.model_name))

    for (const fallback of config.router_settings.fallbacks || []) {
      for (const targets of Object.values(fallback)) {
        for (const target of targets) {
          expect(modelNames.has(target)).toBe(true)
        }
      }
    }
  })

  it("keeps legacy Dify GPT aliases behind working gateway fallbacks", () => {
    const config = loadConfig()
    const fallbackTargets = new Map<string, string[]>()

    for (const fallback of config.router_settings.fallbacks || []) {
      for (const [source, targets] of Object.entries(fallback)) {
        fallbackTargets.set(source, targets)
      }
    }

    expect(fallbackTargets.get("gpt-5.3")).toEqual(["gpt-5.5", "sx-fast-chat"])
    expect(fallbackTargets.get("gpt-5.3-spark")).toEqual(["gpt-5.5", "sx-fast-chat"])
    expect(fallbackTargets.get("gemini-3.1-pro-preview")).toEqual(["sx-gpt-5.5-vivaapi", "sx-gpt-5.5-moonapix"])
    expect(fallbackTargets.get("gemini-3-pro-image-preview")).toEqual([
      "sx-image-vision",
      "sx-gpt-5.4-mini-vivaapi",
      "sx-gpt-5.4-mini-moonapix",
      "gpt-5.4-mini",
    ])
  })

  it("keeps high-volume legacy Dify text model names routed through gateway-compatible deployments", () => {
    const config = loadConfig()
    const expectedModelNames = [
      "claude-3-7-sonnet-20250219",
      "gemini-3.1-flash-lite-preview",
      "gemini-3-pro-image-preview",
    ]

    for (const name of expectedModelNames) {
      const deployments = modelsByName(config, name)
      expect(deployments.length).toBeGreaterThanOrEqual(2)
      expect(deployments.every((item) => item.model_info?.mode === "chat")).toBe(true)
    }
  })

  it("keeps explicit fallback chains aligned to fastest stable provider order", () => {
    const config = loadConfig()
    const fallbackTargets = new Map<string, string[]>()

    for (const fallback of config.router_settings.fallbacks || []) {
      for (const [source, targets] of Object.entries(fallback)) {
        fallbackTargets.set(source, targets)
      }
    }

    expect(fallbackTargets.get("sx-fast-chat")).toEqual(["sx-gpt-5.5-moonapix", "sx-gpt-5.5-vivaapi", "sx-gemini-3.1-pro"])
    expect(fallbackTargets.get("sx-math-text")).toEqual(["sx-gpt-5.5-moonapix", "sx-gpt-5.5-vivaapi", "sx-gemini-3.1-pro"])
    expect(fallbackTargets.get("sx-general-text")).toEqual(["sx-gpt-5.5-moonapix", "sx-gpt-5.5-vivaapi", "sx-gemini-3.1-pro"])
    expect(fallbackTargets.get("sx-chinese-text")).toEqual([
      "sx-claude-sonnet-4-6",
      "sx-claude-opus-4-7-vivaapi",
      "sx-claude-opus-4-7-moonapix",
      "sx-general-text",
    ])
    expect(fallbackTargets.get("sx-image-vision")).toEqual([
      "sx-gpt-5.4-mini-vivaapi",
      "sx-gpt-5.4-mini-moonapix",
      "sx-image-vision-moonapix",
      "gpt-5.4-mini",
    ])
  })

  it("keeps Chinese-first routing pinned to the fast Claude Sonnet primary", () => {
    const config = loadConfig()
    const chinese = modelsByName(config, "sx-chinese-text")

    expect(chinese).toHaveLength(1)
    expect(chinese[0]?.litellm_params?.model).toBe("openai/claude-sonnet-4-6")
    expect(chinese[0]?.litellm_params?.api_base).toBe("os.environ/MOONAPIX_LLM_BASE_URL")
    expect(chinese[0]?.model_info?.id).toBe("deploy-moonapix-claude-sonnet-4-6")
  })

  it("keeps the fast GPT business aliases pinned to the TokenFlux deployment", () => {
    const config = loadConfig()

    for (const alias of ["sx-fast-chat", "sx-math-text", "sx-general-text"]) {
      const deployments = modelsByName(config, alias)
      expect(deployments).toHaveLength(1)
      expect(deployments[0]?.litellm_params?.api_base).toBe("os.environ/TOKENFLUX_LLM_BASE_URL")
      expect(deployments[0]?.model_info?.id).toBe("deploy-tokenflux-gpt-5-5")
    }
  })

  it("keeps vision routing pinned to GPT-5.4-mini before multimodal fallbacks", () => {
    const config = loadConfig()
    const vision = modelsByName(config, "sx-image-vision")

    expect(vision).toHaveLength(1)
    expect(vision[0]?.litellm_params?.api_base).toBe("os.environ/TOKENFLUX_LLM_BASE_URL")
    expect(vision[0]?.model_info?.id).toBe("deploy-tokenflux-gpt-5-4-mini")
  })

  it("keeps legacy gpt-5.4-mini pinned to the tokenflux primary for long JSON generators", () => {
    const config = loadConfig()
    const legacy = modelsByName(config, "gpt-5.4-mini")

    expect(legacy).toHaveLength(3)
    const byOrder = [...legacy].sort(
      (left, right) => (left.litellm_params?.order || 0) - (right.litellm_params?.order || 0),
    )

    expect(byOrder.map((item) => item.model_info?.id)).toEqual([
      "deploy-tokenflux-gpt-5-4-mini",
      "deploy-moonapix-gpt-5-4-mini",
      "deploy-vivaapi-gpt-5-4-mini",
    ])
    expect(byOrder[0]?.litellm_params?.api_base).toBe("os.environ/TOKENFLUX_LLM_BASE_URL")
  })

  it("exposes the Grok direct model route for independent-model pages", () => {
    const config = loadConfig()
    const grok = modelsByName(config, "grok-4.2")

    expect(grok).toHaveLength(1)
    expect(grok[0]?.litellm_params?.model).toBe("openai/grok-4.2")
    expect(grok[0]?.model_info?.id).toBe("grok-4-2-vivaapi")
  })

  it("uses latency-based routing with explicit fallback chains instead of random shuffle", () => {
    const config = loadConfig()

    expect(config.router_settings.routing_strategy).toBe("latency-based-routing")
    expect(config.router_settings.routing_strategy_args?.ttl).toBe(30)
    expect(config.router_settings.routing_strategy_args?.lowest_latency_buffer).toBe(0)
  })

  it("enables a default-on global sensitive-content guardrail for all gateway models", () => {
    const config = loadConfig()
    const guardrail = config.guardrails?.find((item) => item.guardrail_name === "sx-global-sensitive-content")

    expect(guardrail).toBeDefined()
    expect(guardrail?.litellm_params?.guardrail).toBe("litellm_content_filter")
    expect(guardrail?.litellm_params?.default_on).toBe(true)
    expect(guardrail?.litellm_params?.mode).toEqual(["pre_call", "post_call"])
    expect(guardrail?.litellm_params?.blocked_words_file).toBe("/app/guardrails/blocked-words.yaml")
    expect(guardrail?.litellm_params?.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "harmful_violence", action: "BLOCK" }),
        expect.objectContaining({ category: "harmful_illegal_weapons", action: "BLOCK" }),
      ]),
    )
  })

  it("keeps the mounted blocked-words policy file present with the requested coverage", () => {
    const policyPath = path.join(process.cwd(), "services/llm-gateway/guardrails/blocked-words.yaml")
    expect(fs.existsSync(policyPath)).toBe(true)

    const policy = yaml.load(fs.readFileSync(policyPath, "utf8")) as {
      blocked_words?: Array<{ keyword?: string; action?: string; description?: string }>
    }

    expect(Array.isArray(policy.blocked_words)).toBe(true)
    expect(policy.blocked_words?.length).toBeGreaterThanOrEqual(20)

    const keywords = new Set((policy.blocked_words || []).map((item) => item.keyword))
    const descriptions = new Set((policy.blocked_words || []).map((item) => item.description))

    expect(keywords.has("色情")).toBe(true)
    expect(keywords.has("暴力")).toBe(true)
    expect(keywords.has("血腥")).toBe(true)
    expect(keywords.has("毒品")).toBe(true)
    expect(keywords.has("枪支")).toBe(true)
    expect(keywords.has("国家领导人")).toBe(true)
    expect(descriptions.has("政治敏感内容")).toBe(true)
    expect((policy.blocked_words || []).every((item) => item.action === "BLOCK")).toBe(true)
  })

  it("mounts the guardrail policy directory into the llm-gateway container", () => {
    const composePath = path.join(process.cwd(), "docker-compose.prod.yml")
    const compose = fs.readFileSync(composePath, "utf8")

    expect(compose).toContain("./services/llm-gateway/guardrails:/app/guardrails:ro")
  })
})
