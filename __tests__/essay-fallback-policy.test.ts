import { shouldAttemptEssayFallbackForHttpStatus } from "@/lib/essay-fallback-policy"

describe("essay fallback HTTP policy", () => {
  it.each([408, 429, 500, 502, 503, 504])("allows fallback for recoverable upstream status %i", (status) => {
    expect(shouldAttemptEssayFallbackForHttpStatus(status)).toBe(true)
  })

  it.each([400, 401, 403, 404, 409, 422])("keeps client, auth, and configuration failures terminal for %i", (status) => {
    expect(shouldAttemptEssayFallbackForHttpStatus(status)).toBe(false)
  })
})
