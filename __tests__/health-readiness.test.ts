import { checkMainSiteReadiness } from "@/lib/health-readiness"

describe("main site readiness", () => {
  const configuration = {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "test-anon-key",
    difyBaseUrl: "http://docker-api-1:5001/v1",
    difyApiKey: "test-dify-key",
  }

  it("reports ready only when Supabase Auth and Dify both respond", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))

    const result = await checkMainSiteReadiness({ ...configuration, fetchImpl })

    expect(result.status).toBe("ready")
    expect(result.dependencies).toEqual({ auth: "ok", ai: "ok" })
  })

  it("reports degraded without exposing dependency URLs or credentials", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED http://docker-api-1:5001"))

    const result = await checkMainSiteReadiness({ ...configuration, fetchImpl })
    const serialized = JSON.stringify(result)

    expect(result.status).toBe("degraded")
    expect(result.dependencies).toEqual({ auth: "ok", ai: "unavailable" })
    expect(serialized).not.toContain("docker-api-1")
    expect(serialized).not.toContain("test-dify-key")
  })

  it("fails closed without dependency credentials", async () => {
    const fetchImpl = jest.fn()

    const result = await checkMainSiteReadiness({
      supabaseUrl: "",
      supabaseAnonKey: "",
      difyBaseUrl: "",
      difyApiKey: "",
      fetchImpl,
      timeoutMs: 500,
    })

    expect(result.status).toBe("degraded")
    expect(result.dependencies).toEqual({ auth: "unavailable", ai: "unavailable" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
