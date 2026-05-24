describe("client auth headers", () => {
  const originalWindow = global.window
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  function installStorage(values: Record<string, string | null>) {
    const storage = {
      getItem: jest.fn((key: string) => values[key] ?? null),
      key: jest.fn((index: number) => Object.keys(values)[index] ?? null),
      removeItem: jest.fn((key: string) => {
        delete values[key]
      }),
      get length() {
        return Object.keys(values).length
      },
    }

    Object.defineProperty(global, "window", { value: { localStorage: storage }, configurable: true })
    Object.defineProperty(global, "localStorage", { value: storage, configurable: true })

    return storage
  }

  afterEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    Object.defineProperty(global, "window", { value: originalWindow, configurable: true })
    Reflect.deleteProperty(global, "localStorage")
  })

  it("prefers nested Authing idToken from currentUser over accessToken", async () => {
    const idToken = "id.header.signature"
    const accessToken = "access.header.signature"
    installStorage({
      idToken: null,
      authingToken: accessToken,
      accessToken,
      currentUser: JSON.stringify({
        data: {
          id: "507f1f77bcf86cd799439011",
          tokenSet: {
            id_token: idToken,
            access_token: accessToken,
          },
        },
      }),
    })

    const { getVerifiedAuthHeaders } = await import("@/lib/client-auth")
    await expect(getVerifiedAuthHeaders()).resolves.toEqual({ Authorization: `Bearer ${idToken}` })
  })

  it("uses a JWT nested in the current user argument for verified requests", async () => {
    installStorage({
      idToken: null,
      authingToken: null,
      accessToken: null,
      _authing_token: null,
      _authing_user: null,
      currentUser: JSON.stringify({ id: "507f1f77bcf86cd799439011" }),
    })

    const { getVerifiedAuthHeaders } = await import("@/lib/client-auth")
    await expect(getVerifiedAuthHeaders({
      id: "507f1f77bcf86cd799439011",
      tokenSet: { idToken: "argument.id.signature" },
    })).resolves.toEqual({ Authorization: "Bearer argument.id.signature" })
  })

  it("uses the Authing SDK token cache for existing mobile sessions", async () => {
    installStorage({
      idToken: null,
      authingToken: null,
      accessToken: null,
      _authing_token: "sdk.token.value",
      _authing_user: JSON.stringify({ id: "507f1f77bcf86cd799439011", token: "sdk.token.value" }),
      currentUser: JSON.stringify({ id: "507f1f77bcf86cd799439011" }),
    })

    const { getVerifiedAuthHeaders, hasStoredVerifiedAuthToken } = await import("@/lib/client-auth")
    expect(hasStoredVerifiedAuthToken()).toBe(true)
    await expect(getVerifiedAuthHeaders()).resolves.toEqual({ Authorization: "Bearer sdk.token.value" })
  })

  it("uses the Authing SDK user cache when currentUser is missing", async () => {
    installStorage({
      idToken: null,
      authingToken: null,
      accessToken: null,
      _authing_token: "sdk.only.token",
      _authing_user: JSON.stringify({ id: "507f1f77bcf86cd799439011", token: "sdk.only.token" }),
      currentUser: null,
    })

    const { getVerifiedAuthHeaders } = await import("@/lib/client-auth")
    await expect(getVerifiedAuthHeaders()).resolves.toEqual({ Authorization: "Bearer sdk.only.token" })
  })

  it("uses the Supabase auth storage access token when the live session helper is unavailable", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rnujdnmxufmzgjvmddla.supabase.co"
    installStorage({
      idToken: null,
      authingToken: null,
      accessToken: null,
      _authing_token: null,
      _authing_user: null,
      currentUser: null,
      "sb-rnujdnmxufmzgjvmddla-auth-token": JSON.stringify({
        access_token: "supabase.access.signature",
        refresh_token: "refresh-token",
      }),
    })

    const { getVerifiedAuthHeaders, hasStoredVerifiedAuthToken } = await import("@/lib/client-auth")
    expect(hasStoredVerifiedAuthToken()).toBe(true)
    await expect(getVerifiedAuthHeaders()).resolves.toEqual({ Authorization: "Bearer supabase.access.signature" })
  })

  it("requires an authorization header for upload requests", async () => {
    installStorage({
      idToken: null,
      authingToken: null,
      accessToken: null,
      _authing_token: null,
      _authing_user: null,
      currentUser: null,
    })

    const { AUTH_REQUIRED_MESSAGE, getRequiredAuthHeaders } = await import("@/lib/client-auth")
    await expect(getRequiredAuthHeaders()).rejects.toThrow(AUTH_REQUIRED_MESSAGE)
  })

  it("clears both first-party and Authing SDK token cache on logout", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rnujdnmxufmzgjvmddla.supabase.co"
    const removeItem = jest.fn()
    Object.defineProperty(global, "window", {
      value: {
        localStorage: {
          getItem: jest.fn((key: string) => key === "sb-rnujdnmxufmzgjvmddla-auth-token" ? "{}" : null),
          key: jest.fn((index: number) => ["sb-rnujdnmxufmzgjvmddla-auth-token"][index] ?? null),
          length: 1,
          removeItem,
        },
      },
      configurable: true,
    })

    const { clearStoredAuthTokens } = await import("@/lib/client-auth")
    clearStoredAuthTokens()

    expect(removeItem).toHaveBeenCalledWith("idToken")
    expect(removeItem).toHaveBeenCalledWith("authingToken")
    expect(removeItem).toHaveBeenCalledWith("accessToken")
    expect(removeItem).toHaveBeenCalledWith("_authing_token")
    expect(removeItem).toHaveBeenCalledWith("_authing_user")
    expect(removeItem).toHaveBeenCalledWith("sb-rnujdnmxufmzgjvmddla-auth-token")
  })
})
