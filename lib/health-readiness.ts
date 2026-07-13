type DependencyStatus = "ok" | "unavailable"

type ReadinessOptions = {
  supabaseUrl: string
  supabaseAnonKey: string
  difyBaseUrl: string
  difyApiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

async function isReachable(fetchImpl: typeof fetch, url: string, init: RequestInit) {
  try {
    const response = await fetchImpl(url, init)
    return response.ok
  } catch {
    return false
  }
}

export async function checkMainSiteReadiness(options: ReadinessOptions) {
  const fetchImpl = options.fetchImpl || fetch
  const timeoutMs = options.timeoutMs || 3_000

  const authCheck = options.supabaseUrl && options.supabaseAnonKey
    ? isReachable(fetchImpl, new URL("/auth/v1/health", options.supabaseUrl).toString(), {
        headers: { apikey: options.supabaseAnonKey },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      })
    : Promise.resolve(false)

  const difyBaseUrl = options.difyBaseUrl.replace(/\/+$/, "")
  const aiCheck = difyBaseUrl && options.difyApiKey
    ? isReachable(fetchImpl, `${difyBaseUrl}/info`, {
        headers: { Authorization: `Bearer ${options.difyApiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      })
    : Promise.resolve(false)

  const [authReady, aiReady] = await Promise.all([authCheck, aiCheck])
  const dependencies: Record<"auth" | "ai", DependencyStatus> = {
    auth: authReady ? "ok" : "unavailable",
    ai: aiReady ? "ok" : "unavailable",
  }

  return {
    status: authReady && aiReady ? "ready" as const : "degraded" as const,
    service: "ai-essay-editor",
    timestamp: new Date().toISOString(),
    dependencies,
  }
}
