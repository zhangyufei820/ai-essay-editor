describe("client auth headers", () => {
  const originalWindow = global.window

  function installStorage(values: Record<string, string | null>) {
    const storage = {
      getItem: jest.fn((key: string) => values[key] ?? null),
    }

    Object.defineProperty(global, "window", { value: { localStorage: storage }, configurable: true })
    Object.defineProperty(global, "localStorage", { value: storage, configurable: true })

    return storage
  }

  afterEach(() => {
    jest.resetModules()
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

  it("clears both first-party and Authing SDK token cache on logout", async () => {
    const removeItem = jest.fn()
    Object.defineProperty(global, "window", { value: { localStorage: { removeItem } }, configurable: true })

    const { clearStoredAuthTokens } = await import("@/lib/client-auth")
    clearStoredAuthTokens()

    expect(removeItem).toHaveBeenCalledWith("idToken")
    expect(removeItem).toHaveBeenCalledWith("authingToken")
    expect(removeItem).toHaveBeenCalledWith("accessToken")
    expect(removeItem).toHaveBeenCalledWith("_authing_token")
    expect(removeItem).toHaveBeenCalledWith("_authing_user")
  })
})
