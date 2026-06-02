import fs from "fs"
import path from "path"
import yaml from "js-yaml"

type GatewayModel = {
  model_name: string
  litellm_params?: {
    model?: string
    api_base?: string
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
  router_settings: {
    cooldown_time?: number
    allowed_fails?: number
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

function deploymentSignature(item: GatewayModel) {
  return [
    item.litellm_params?.model,
    item.litellm_params?.api_base,
    item.litellm_params?.order,
    item.model_info?.id,
  ].join("|")
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

  it("keeps hot text and vision aliases as ordered multi-provider pools", () => {
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
      expect(deployments.length).toBeGreaterThanOrEqual(3)
      expect(deployments.some((item) => item.litellm_params?.order === 1)).toBe(true)
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

  it("shares deployment ids across text aliases for shared circuit state", () => {
    const config = loadConfig()
    const fastIds = new Set(modelsByName(config, "sx-fast-chat").map((item) => item.model_info?.id))
    const mathIds = new Set(modelsByName(config, "sx-math-text").map((item) => item.model_info?.id))
    const generalIds = new Set(modelsByName(config, "sx-general-text").map((item) => item.model_info?.id))

    for (const id of ["deploy-tokenflux-gpt-5-5", "deploy-vivaapi-gpt-5-5", "deploy-moonapix-gpt-5-5"]) {
      expect(fastIds.has(id)).toBe(true)
      expect(mathIds.has(id)).toBe(true)
      expect(generalIds.has(id)).toBe(true)
    }
  })

  it("exposes Chinese Dify labels without adding background probe load", () => {
    const config = loadConfig()
    const aliases = [
      ["sx-fast-chat", "沈翔快速对话"],
      ["sx-chinese-text", "沈翔语文优先"],
      ["sx-math-text", "沈翔数学推理"],
      ["sx-general-text", "沈翔通用文本"],
      ["sx-image-vision", "沈翔图像识别"],
    ] as const

    for (const [canonicalName, chineseName] of aliases) {
      const canonical = modelsByName(config, canonicalName)
      const chinese = modelsByName(config, chineseName)

      expect(chinese.length).toBe(canonical.length)
      expect(chinese.map(deploymentSignature).sort()).toEqual(
        canonical.map(deploymentSignature).sort(),
      )
      expect(chinese.every((item) => item.model_info?.mode === "chat")).toBe(true)
      expect(chinese.every((item) => item.model_info?.disable_background_health_check)).toBe(true)
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
})
