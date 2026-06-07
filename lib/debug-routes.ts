export function areDebugRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEBUG_ROUTES === "true"
}
