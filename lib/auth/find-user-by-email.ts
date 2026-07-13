type AuthLookupClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function findAuthUserIdByEmail(client: AuthLookupClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const { data, error } = await client.rpc("find_auth_user_id_by_email", {
    lookup_email: normalizedEmail,
  })

  if (error) {
    throw new Error("AUTH_USER_LOOKUP_UNAVAILABLE")
  }

  if (data === null || data === undefined || data === "") {
    return undefined
  }

  if (typeof data !== "string" || !UUID_PATTERN.test(data)) {
    throw new Error("AUTH_USER_LOOKUP_UNAVAILABLE")
  }

  return data
}
