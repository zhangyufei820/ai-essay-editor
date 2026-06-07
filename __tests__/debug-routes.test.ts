import { areDebugRoutesEnabled } from "@/lib/debug-routes"

describe("debug route switch", () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalEnableDebugRoutes = process.env.ENABLE_DEBUG_ROUTES

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    })
    if (originalEnableDebugRoutes === undefined) {
      delete process.env.ENABLE_DEBUG_ROUTES
    } else {
      process.env.ENABLE_DEBUG_ROUTES = originalEnableDebugRoutes
    }
  })

  it("stays closed in production even if ENABLE_DEBUG_ROUTES drifts to true", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    })
    process.env.ENABLE_DEBUG_ROUTES = "true"

    expect(areDebugRoutesEnabled()).toBe(false)
  })

  it("can only be enabled outside production with an explicit flag", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    })
    process.env.ENABLE_DEBUG_ROUTES = "true"

    expect(areDebugRoutesEnabled()).toBe(true)
  })
})
