import fs from "fs"
import path from "path"
import yaml from "js-yaml"

type GatewayModel = {
  model_name: string
  litellm_params?: {
    model?: string
    api_base?: string
    api_key?: string
    extra_headers?: Record<string, string>
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
      categories?: Array<{ category?: string; action?: string; severity_threshold?: string }>
    }
  }>
  router_settings: {
    cooldown_time?: number
    allowed_fails?: number
    num_retries?: number
    timeout?: number
    routing_strategy?: string
    routing_strategy_args?: Record<string, number>
    allowed_fails_policy?: Record<string, number>
    fallbacks?: Array<Record<string, string[]>>
  }
  litellm_settings?: { request_timeout?: number; num_retries?: number }
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

function fallbackMap(config: GatewayConfig) {
  const targets = new Map<string, string[]>()
  for (const fallback of config.router_settings.fallbacks || []) {
    for (const [source, values] of Object.entries(fallback)) targets.set(source, values)
  }
  return targets
}

describe("llm gateway New API primary policy", () => {
  it("pins every production alias to one New API deployment", () => {
    const config = loadConfig()
    const productionAliases = [
      "sx-fast-chat",
      "sx-chinese-text",
      "sx-math-text",
      "sx-general-text",
      "sx-image-vision",
      "sx-claude-sonnet-4-6",
      "sx-claude-opus-4-6-thinking",
      "sx-gemini-3.1-pro",
      "gpt-4o-mini",
      "gpt-5.2",
      "gpt-5.3",
      "gpt-5.3-spark",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-pro",
      "gpt-5.5",
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-3-7-sonnet-20250219",
      "claude-sonnet-4-6-thinking",
      "claude-opus-4-6-thinking",
      "gemini-3.1-flash-lite-preview",
      "gemini-3-pro-image-preview",
      "gemini-3.1-pro-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "grok-4.2",
    ]

    for (const alias of productionAliases) {
      const deployments = modelsByName(config, alias)
      expect(deployments).toHaveLength(1)
      expect(deployments[0]?.litellm_params?.api_base).toBe("os.environ/SHENXIANG_NEW_API_BASE_URL")
      expect([
        "os.environ/SHENXIANG_NEW_API_TEXT_API_KEY",
        "os.environ/SHENXIANG_NEW_API_CLAUDE_API_KEY",
      ]).toContain(deployments[0]?.litellm_params?.api_key)
      expect(deployments[0]?.litellm_params?.extra_headers?.["User-Agent"]).toBe("shenxiang-llm-gateway/1.0")
      expect(deployments[0]?.model_info?.mode).toBe("chat")
    }
  })

  it("uses the dedicated user token family for OpenAI and Claude primaries", () => {
    const config = loadConfig()

    for (const alias of ["sx-fast-chat", "sx-math-text", "sx-general-text", "sx-image-vision", "gpt-5.4", "gpt-5.5"]) {
      expect(modelsByName(config, alias)[0]?.litellm_params?.api_key).toBe(
        "os.environ/SHENXIANG_NEW_API_TEXT_API_KEY",
      )
    }

    for (const alias of ["sx-chinese-text", "claude-sonnet-4-6", "claude-opus-4-7"]) {
      expect(modelsByName(config, alias)[0]?.litellm_params?.api_key).toBe(
        "os.environ/SHENXIANG_NEW_API_CLAUDE_API_KEY",
      )
    }
  })

  it("retains Viva as the only direct fallback supplier", () => {
    const config = loadConfig()
    const targets = fallbackMap(config)
    const productionModels = config.model_list.filter((item) => !item.model_name.startsWith("fallback-viva-"))
    const fallbackModels = config.model_list.filter((item) => item.model_name.startsWith("fallback-viva-"))

    expect(fallbackModels.length).toBeGreaterThanOrEqual(10)
    for (const model of fallbackModels) {
      expect(model.litellm_params?.api_base).toBe("os.environ/VIVAAPI_LLM_BASE_URL")
      expect(model.litellm_params?.api_key).toBe("os.environ/VIVAAPI_LLM_API_KEY")
    }

    for (const model of productionModels) {
      const modelTargets = targets.get(model.model_name)
      expect(modelTargets?.length).toBeGreaterThan(0)
      expect(modelTargets?.every((target) => target.startsWith("fallback-viva-"))).toBe(true)
    }

    const serialized = fs.readFileSync(configPath, "utf8")
    expect(serialized).not.toMatch(/TOKENFLUX|MOONAPIX/i)
    expect(new Set(config.model_list.map((item) => item.litellm_params?.api_base))).toEqual(
      new Set(["os.environ/SHENXIANG_NEW_API_BASE_URL", "os.environ/VIVAAPI_LLM_BASE_URL"]),
    )
  })

  it("only points fallbacks at configured aliases", () => {
    const config = loadConfig()
    const modelNames = new Set(config.model_list.map((item) => item.model_name))

    for (const targets of fallbackMap(config).values()) {
      for (const target of targets) expect(modelNames.has(target)).toBe(true)
    }
  })

  it("keeps the requested primary model mappings explicit", () => {
    const config = loadConfig()
    expect(modelsByName(config, "sx-fast-chat")[0]?.litellm_params?.model).toBe("openai/gpt-5.5")
    expect(modelsByName(config, "sx-general-text")[0]?.litellm_params?.model).toBe("openai/gpt-5.4-mini")
    expect(modelsByName(config, "sx-chinese-text")[0]?.litellm_params?.model).toBe("openai/claude-sonnet-4-6")
    expect(modelsByName(config, "claude-opus-4-7")[0]?.litellm_params?.model).toBe("openai/claude-opus-4-7")
  })

  it("keeps bounded active health checks and proactive routing", () => {
    const config = loadConfig()
    expect(config.general_settings.background_health_checks).toBe(true)
    expect(config.general_settings.enable_health_check_routing).toBe(true)
    expect(config.general_settings.health_check_concurrency).toBe(1)
    expect(config.general_settings.health_check_interval).toBeGreaterThanOrEqual(180)
    expect(config.general_settings.health_check_staleness_threshold).toBeGreaterThanOrEqual(360)
    expect(config.general_settings.health_check_skip_disabled_background_models).toBe(true)
    expect(config.router_settings.cooldown_time).toBeGreaterThanOrEqual(30)
    expect(config.router_settings.cooldown_time).toBeLessThanOrEqual(60)
    expect(config.router_settings.allowed_fails).toBe(1)
    expect(config.router_settings.num_retries).toBe(0)
    expect(config.litellm_settings?.num_retries).toBe(0)
    expect(config.router_settings.timeout).toBeLessThanOrEqual(22)
    expect(config.litellm_settings?.request_timeout).toBeLessThanOrEqual(22)
    expect(config.router_settings.allowed_fails_policy?.AuthenticationErrorAllowedFails).toBe(0)
    expect(config.router_settings.allowed_fails_policy?.BadRequestErrorAllowedFails).toBe(0)
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
    expect(probes.length).toBeLessThanOrEqual(5)
    expect(probes.every((item) => (item.model_info?.health_check_timeout || 0) <= 10)).toBe(true)
    expect(probes.every((item) => (item.model_info?.health_check_max_tokens || 0) <= 3)).toBe(true)
  })

  it("keeps gateway aliases ASCII-safe for response headers", () => {
    const config = loadConfig()
    for (const model of config.model_list) expect(model.model_name).toMatch(/^[\x20-\x7E]+$/)
    for (const [source, targets] of fallbackMap(config)) {
      expect(source).toMatch(/^[\x20-\x7E]+$/)
      for (const target of targets) expect(target).toMatch(/^[\x20-\x7E]+$/)
    }
  })

  it("enables the global sensitive-content guardrail", () => {
    const config = loadConfig()
    const guardrail = config.guardrails?.find((item) => item.guardrail_name === "sx-global-sensitive-content")
    expect(guardrail?.litellm_params?.guardrail).toBe("litellm_content_filter")
    expect(guardrail?.litellm_params?.default_on).toBe(true)
    expect(guardrail?.litellm_params?.mode).toEqual(["pre_call", "post_call"])
    expect(guardrail?.litellm_params?.blocked_words_file).toBe("/app/guardrails/blocked-words.yaml")
    expect(guardrail?.litellm_params?.categories).toEqual([
      expect.objectContaining({ category: "harmful_illegal_weapons", action: "BLOCK" }),
    ])
  })

  it("keeps the mounted blocked-words policy limited to pornographic and firearm terms", () => {
    const policyPath = path.join(process.cwd(), "services/llm-gateway/guardrails/blocked-words.yaml")
    const policy = yaml.load(fs.readFileSync(policyPath, "utf8")) as {
      blocked_words?: Array<{ keyword?: string; action?: string; description?: string }>
    }
    const keywords = new Set((policy.blocked_words || []).map((item) => item.keyword))
    const descriptions = new Set((policy.blocked_words || []).map((item) => item.description))

    expect(policy.blocked_words?.length).toBeGreaterThanOrEqual(10)
    expect(keywords.has("色情")).toBe(true)
    expect(keywords.has("枪支")).toBe(true)
    expect(keywords.has("暴力")).toBe(false)
    expect(keywords.has("毒品")).toBe(false)
    expect(descriptions).toEqual(new Set(["色情内容", "枪支内容"]))
    expect((policy.blocked_words || []).every((item) => item.action === "BLOCK")).toBe(true)
  })

  it("keeps production runtime safety settings", () => {
    const compose = fs.readFileSync(path.join(process.cwd(), "docker-compose.prod.yml"), "utf8")
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8")
    expect(compose).toContain("./services/llm-gateway/guardrails:/app/guardrails:ro")
    expect(compose).toContain("mem_limit: 2304m")
    expect(compose).toMatch(/llm-gateway:\n[\s\S]*?init: true/)
    expect(compose).toMatch(/nextjs:\n[\s\S]*?init: true/)
    expect(compose).not.toMatch(/curl\s+-f\s+http:\/\/localhost:3000/)
    expect(dockerfile).toContain("fetch('http://127.0.0.1:3000')")
  })

  it("documents only the active New API primary and Viva fallback credentials", () => {
    const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8")
    expect(example).toContain("SHENXIANG_NEW_API_BASE_URL=")
    expect(example).toContain("SHENXIANG_NEW_API_TEXT_API_KEY=")
    expect(example).toContain("SHENXIANG_NEW_API_CLAUDE_API_KEY=")
    expect(example).toContain("SHENXIANG_NEW_API_IMAGE_API_KEY=")
    expect(example).toContain("VIVAAPI_LLM_API_KEY=")
    expect(example).not.toMatch(/TOKENFLUX_LLM|MOONAPIX_LLM/)
  })

  it("keeps the durable image gateway on asynchronous New API task polling", () => {
    const patchFile = fs.readFileSync(
      path.join(process.cwd(), "deploy/patches/dify-image-gateway-new-api-async.patch"),
      "utf8",
    )
    expect(patchFile).toContain("PRIMARY_UPSTREAM_ASYNC")
    expect(patchFile).toContain("/images/generations?async=true")
    expect(patchFile).toContain("/images/tasks/{task_id}")
    expect(patchFile).toContain("PRIMARY_UPSTREAM_ASYNC_TIMEOUT")
    expect(patchFile).toContain('"120"')

    const fallbackModelPatch = fs.readFileSync(
      path.join(process.cwd(), "deploy/patches/dify-image-gateway-viva-fallback-model.patch"),
      "utf8",
    )
    expect(fallbackModelPatch).toContain("FALLBACK_MODEL_ALIAS_MAP")
    expect(fallbackModelPatch).toContain("GPT_IMAGE_2_FALLBACK_MODEL")
  })

  it("keeps the production Node runtime and cleanup unit valid", () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8")
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      engines?: { node?: string }
    }
    const unit = fs.readFileSync(
      path.join(process.cwd(), "deploy/systemd/shenxiang-container-runtime-cleanup.service"),
      "utf8",
    )

    expect(packageJson.engines?.node).toBe(">=22")
    expect(dockerfile.match(/^FROM node:22 AS (?:builder|runner)$/gm)).toHaveLength(2)
    expect(unit).toContain("Documentation=file:/data/ai-essay-editor/docs/SERVER-CLEANUP-SOP.md")
  })
})
