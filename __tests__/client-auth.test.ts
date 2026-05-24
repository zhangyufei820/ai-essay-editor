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
      currentUser: JSON.stringify({ id: "507f1f77bcf86cd799439011" }),
    })

    const { getVerifiedAuthHeaders } = await import("@/lib/client-auth")
    await expect(getVerifiedAuthHeaders({
      id: "507f1f77bcf86cd799439011",
      tokenSet: { idToken: "argument.id.signature" },
    })).resolves.toEqual({ Authorization: "Bearer argument.id.signature" })
  })
})
