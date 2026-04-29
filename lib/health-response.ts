export function buildHealthPayload() {
  return {
    status: "ok" as const,
    service: "ai-essay-editor",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    version: process.env.DEPLOYMENT_VERSION || process.env.NEXT_BUILD_ID || "development",
  }
}
