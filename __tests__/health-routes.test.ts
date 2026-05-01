import { GET as getApiHealth, HEAD as headApiHealth } from "@/app/api/health/route"

const SENSITIVE_PATTERNS = [
  /service[_-]?role/i,
  /password/i,
  /connection[_-]?string/i,
  /postgres:\/\/[^"\s]+/i,
  /sk_(live|test)_[A-Za-z0-9]+/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
]

describe("health routes", () => {
  it("returns a public API health payload", async () => {
    const response = await getApiHealth()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe("ok")
    expect(body.service).toBe("ai-essay-editor")
    expect(typeof body.timestamp).toBe("string")
    expect(typeof body.version).toBe("string")
  })

  it("supports HEAD on the public API health route", async () => {
    const response = await headApiHealth()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("does not expose obvious secret names or secret-like values", async () => {
    const response = await getApiHealth()
    const body = await response.json()
    const serialized = JSON.stringify(body)

    expect(response.status).toBe(200)
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(serialized).not.toMatch(pattern)
    }
  })
})
