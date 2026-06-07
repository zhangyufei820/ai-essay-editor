import { getClientIP } from "@/lib/rate-limit"

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("https://shenxiang.school/api/test", { headers })
}

describe("rate limit client IP resolution", () => {
  it("prefers reverse-proxy controlled x-real-ip over spoofable forwarded chains", () => {
    const request = requestWithHeaders({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    })

    expect(getClientIP(request)).toBe("203.0.113.10")
  })

  it("uses Cloudflare connecting IP before x-forwarded-for", () => {
    const request = requestWithHeaders({
      "cf-connecting-ip": "198.51.100.20",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    })

    expect(getClientIP(request)).toBe("198.51.100.20")
  })

  it("falls back to the proxy-appended end of x-forwarded-for", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "1.1.1.1, 198.51.100.30",
    })

    expect(getClientIP(request)).toBe("198.51.100.30")
  })

  it("ignores malformed client supplied addresses", () => {
    const request = requestWithHeaders({
      "x-real-ip": "not-an-ip",
      "cf-connecting-ip": "also-not-an-ip",
      "x-forwarded-for": "spoofed, 203.0.113.40",
    })

    expect(getClientIP(request)).toBe("203.0.113.40")
  })
})
