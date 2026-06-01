export type ProviderModality = "text" | "tts" | "stt" | "image" | "music" | "video"
export type ProviderHealthStatus = "healthy" | "degraded" | "open_circuit"

export type ProviderHealthSnapshot = {
  provider: string
  modality: ProviderModality
  status: ProviderHealthStatus
  p50LatencyMs?: number
  p95LatencyMs?: number
  errorRate?: number
  rateLimitCount?: number
  lastSuccessAt?: string
  cooldownUntil?: string
  costWeight?: number
}

export type ProviderChoice = {
  provider: string
  reason: string
  score: number
  snapshot: ProviderHealthSnapshot
}

const DEFAULT_PROVIDERS: Record<ProviderModality, string[]> = {
  text: ["llm-gateway"],
  tts: ["openai", "siliconflow", "minimax"],
  stt: ["openai", "siliconflow"],
  image: ["gpt-image-gateway", "gemini-image-gateway"],
  music: ["vivaapi-suno"],
  video: ["relaydance"],
}

const inMemoryProviderHealth = new Map<string, ProviderHealthSnapshot>()

function keyOf(modality: ProviderModality, provider: string) {
  return `${modality}:${provider}`
}

function parseProviderList(value: string | undefined, fallback: string[]) {
  const providers = (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return providers.length ? providers : fallback
}

export function getConfiguredProviders(modality: ProviderModality, env: Record<string, string | undefined> = process.env) {
  const envKey = `AI_${modality.toUpperCase()}_PROVIDERS`
  return parseProviderList(env[envKey], DEFAULT_PROVIDERS[modality])
}

function isCoolingDown(snapshot: ProviderHealthSnapshot, nowMs: number) {
  if (!snapshot.cooldownUntil) return false
  const cooldownUntilMs = Date.parse(snapshot.cooldownUntil)
  return Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs
}

export function scoreProvider(snapshot: ProviderHealthSnapshot, now = new Date()) {
  const nowMs = now.getTime()
  if (snapshot.status === "open_circuit" || isCoolingDown(snapshot, nowMs)) return -1

  const p95 = snapshot.p95LatencyMs || snapshot.p50LatencyMs || 0
  const latencyPenalty = Math.min(40, p95 / 250)
  const errorPenalty = Math.min(45, (snapshot.errorRate || 0) * 100)
  const rateLimitPenalty = Math.min(20, (snapshot.rateLimitCount || 0) * 2)
  const costPenalty = Math.min(10, snapshot.costWeight || 0)
  const degradedPenalty = snapshot.status === "degraded" ? 20 : 0

  return Math.max(0, Math.round(100 - latencyPenalty - errorPenalty - rateLimitPenalty - costPenalty - degradedPenalty))
}

export function getProviderHealthSnapshot(modality: ProviderModality, provider: string): ProviderHealthSnapshot {
  return inMemoryProviderHealth.get(keyOf(modality, provider)) || {
    provider,
    modality,
    status: "healthy",
  }
}

export function setProviderHealthSnapshot(snapshot: ProviderHealthSnapshot) {
  inMemoryProviderHealth.set(keyOf(snapshot.modality, snapshot.provider), snapshot)
}

export function chooseProvider(modality: ProviderModality, env: Record<string, string | undefined> = process.env): ProviderChoice {
  const providers = getConfiguredProviders(modality, env)
  const snapshots = providers.map((provider) => getProviderHealthSnapshot(modality, provider))
  const scored = snapshots
    .map((snapshot) => ({
      provider: snapshot.provider,
      snapshot,
      score: scoreProvider(snapshot),
    }))
    .sort((a, b) => b.score - a.score)

  const selected = scored.find((candidate) => candidate.score >= 0) || scored[0]
  if (!selected) {
    const provider = DEFAULT_PROVIDERS[modality][0]
    const snapshot = getProviderHealthSnapshot(modality, provider)
    return { provider, snapshot, score: scoreProvider(snapshot), reason: "default_provider" }
  }

  return {
    provider: selected.provider,
    snapshot: selected.snapshot,
    score: selected.score,
    reason: selected.score < 0 ? "all_providers_unhealthy_using_first" : "highest_health_score",
  }
}

export function recordProviderResult(input: {
  modality: ProviderModality
  provider: string
  ok: boolean
  latencyMs?: number
  rateLimited?: boolean
  now?: Date
}) {
  const now = input.now || new Date()
  const current = getProviderHealthSnapshot(input.modality, input.provider)
  const priorErrorRate = current.errorRate || 0
  const nextErrorRate = input.ok
    ? Math.max(0, priorErrorRate * 0.7)
    : Math.min(1, priorErrorRate * 0.7 + 0.3)
  const priorRateLimit = current.rateLimitCount || 0
  const rateLimitCount = input.rateLimited ? priorRateLimit + 1 : Math.max(0, priorRateLimit - 1)
  const status: ProviderHealthStatus =
    nextErrorRate >= 0.6 || rateLimitCount >= 3 ? "open_circuit" :
    nextErrorRate >= 0.25 || rateLimitCount > 0 ? "degraded" :
    "healthy"

  const snapshot: ProviderHealthSnapshot = {
    ...current,
    status,
    p50LatencyMs: input.latencyMs || current.p50LatencyMs,
    p95LatencyMs: input.latencyMs ? Math.max(input.latencyMs, current.p95LatencyMs || 0) : current.p95LatencyMs,
    errorRate: Number(nextErrorRate.toFixed(3)),
    rateLimitCount,
    lastSuccessAt: input.ok ? now.toISOString() : current.lastSuccessAt,
    cooldownUntil: status === "open_circuit" ? new Date(now.getTime() + 60_000).toISOString() : undefined,
  }

  setProviderHealthSnapshot(snapshot)
  return snapshot
}
