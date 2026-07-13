import fs from "fs"
import path from "path"

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

describe("P0/P1 security audit guardrails", () => {
  it("requires verified users for formerly client-userId sensitive APIs", () => {
    const routes = [
      "app/api/chat/route.ts",
      "app/api/suno/run/route.ts",
      "app/api/share/route.ts",
      "app/api/share/claim-reward/route.ts",
      "app/api/referral/get-code/route.ts",
      "app/api/referral/process/route.ts",
      "app/api/stripe/checkout-session/route.ts",
      "app/api/user/update/route.ts",
      "app/api/tts/route.ts",
      "app/api/voice/tts/route.ts",
      "app/api/voice/stt/route.ts",
      "app/api/ocr/route.ts",
      "app/api/essay-grade/route.ts",
      "app/api/essay-review/route.ts",
    ]

    for (const route of routes) {
      expect(read(route)).toMatch(/require(User|LearningUserId)\(/)
    }
  })

  it("does not leak OTPs or magic links to logs or responses", () => {
    const otpStore = read("lib/email-otp-store.ts")
    const verifyOtp = read("app/api/auth/verify-email-otp/route.ts")

    expect(otpStore).not.toContain("JSON.stringify([...otpStore.entries()])")
    expect(otpStore).not.toContain("code: ${code}")
    expect(otpStore).not.toContain("code: ${data.code}")
    expect(verifyOtp).not.toContain("redirectUrl:")
    expect(verifyOtp).toContain("verifyOtp")
  })

  it("keeps high-risk debug and media routes behind explicit auth controls", () => {
    expect(fs.existsSync(path.join(root, "app/api/debug/init-tables/route.ts"))).toBe(false)
    expect(fs.existsSync(path.join(root, "app/api/debug/orders/route.ts"))).toBe(false)
    expect(read("app/api/openclaw-media-sign/[...path]/route.ts")).toContain("requireUser(request)")
    expect(read("app/api/openclaw-media/[...path]/route.ts")).toContain("verifySignedOpenClawMediaPath(mediaPath, exp, sig, auth.user.id)")
    expect(read("lib/openclaw-media-server.ts")).not.toContain("process.env.SUPABASE_SERVICE_ROLE_KEY ||")
  })

  it("uses safer cache, redirect, and remote-fetch defaults", () => {
    expect(read("app/api/tts/route.ts")).toContain('"Cache-Control": "private, no-store"')
    expect(read("app/api/voice/tts/route.ts")).toContain('"Cache-Control": "private, no-store"')
    expect(read("app/auth/callback/route.ts")).toContain("safeInternalRedirectPath")
    expect(read("app/login/page.tsx")).toContain("safeInternalRedirectPath")
    expect(read("lib/cos.ts")).toContain("assertAllowedSourceUrl(sourceUrl)")
  })

  it("hardens P1 security configuration and user feedback plumbing", () => {
    expect(read("next.config.mjs")).not.toContain("'unsafe-eval'")
    expect(read("lib/cors.ts")).not.toContain("X-User-Id")
    expect(read("app/layout.tsx")).toContain("<Toaster richColors")
    expect(read("lib/admin-auth.ts")).toContain("randomBytes(32)")
    expect(read("lib/credits.ts")).toContain('.eq("credits", credits.credits)')
    expect(read("lib/xunhupay.ts")).not.toContain("收到完整参数")
  })

  it("does not ship the wechat-pay placeholder code", () => {
    expect(fs.existsSync(path.join(root, "lib/wechat-pay.ts"))).toBe(false)
    expect(fs.existsSync(path.join(root, "app/payment/wechat"))).toBe(false)
    expect(fs.existsSync(path.join(root, "app/api/payment/wechat"))).toBe(false)
  })

  it("keeps xunhupay channel intact (real payment path)", () => {
    expect(fs.existsSync(path.join(root, "lib/xunhupay.ts"))).toBe(true)
    expect(fs.existsSync(path.join(root, "app/api/payment/xunhupay/create/route.ts"))).toBe(true)
    expect(fs.existsSync(path.join(root, "app/api/payment/xunhupay/notify/route.ts"))).toBe(true)
  })

  it("keeps entitlement linking and callbacks on verified, exact identities", () => {
    const entitlements = read("lib/user-entitlements.ts")
    const membership = read("app/api/user/membership/route.ts")
    const difyChat = read("app/api/dify-chat/route.ts")
    const xunhupayNotify = read("app/api/payment/xunhupay/notify/route.ts")

    expect(entitlements).not.toContain("identity?.metadata")
    expect(entitlements).not.toContain("listUsers(")
    expect(entitlements).not.toContain('.like("phone", `%${phone}%`)')
    expect(membership).not.toContain("user_metadata")
    expect(membership).not.toContain("listUsers(")
    expect(difyChat).toContain("resolveRelatedUserIds(userId, identity, supabase)")
    expect(difyChat).not.toContain("resolveMembershipCandidateUserIds")
    expect(xunhupayNotify.indexOf("verifyXunhupaySign(body)")).toBeLessThan(
      xunhupayNotify.indexOf("grantPaymentCreditsOnce(supabase"),
    )
    expect(xunhupayNotify).not.toContain("checkIpRateLimit")
  })

  it("streams generated files and confines active SVG content", () => {
    const route = read("app/api/codex-skill-files/[taskId]/[...path]/route.ts")
    expect(route).toContain("upstream.body")
    expect(route).not.toContain("upstream.arrayBuffer()")
    expect(route).toContain("MAX_CODEX_FILE_BYTES")
    expect(route).toContain('extension === ".svg"')
    expect(route).toContain("sandbox; default-src 'none'")
  })

  it("cancels long-running browser polls when their components unmount", () => {
    for (const file of ["app/tools/page.tsx", "components/chat/gpt-image2-chat-interface.tsx"]) {
      const source = read(file)
      expect(source).toContain("pollingCancelledRef")
      expect(source).toContain("AbortController")
      expect(source).toContain("controller.abort()")
    }
  })

  it("checkout page only offers wechat button", () => {
    const src = read("app/checkout/[productId]/page.tsx")
    expect(src).not.toMatch(/handlePayment\(["']alipay["']\)/)
    expect(src).toMatch(/handlePayment\(\)/)
  })

  it("share page sanitizes printable markdown via DOMPurify", () => {
    const src = read("app/share/[id]/page.tsx")
    expect(src).toContain("DOMPurify.sanitize")
    expect(src).not.toMatch(/printWindow\.document\.write\([^)]*htmlContent\)/)
  })

  it("share creation sends verified auth and surfaces server errors in chat", () => {
    const src = read("components/chat/enhanced-chat-interface.tsx")
    const route = read("app/api/share/route.ts")

    expect(src).toContain("请先登录后再分享到广场")
    expect(src).toContain("...(await getVerifiedAuthHeaders())")
    expect(src).toContain("messages.map(toShareSafeMessage)")
    expect(src).not.toContain("files: m.files")
    expect(src).toContain("parsed?.error || parsed?.message")
    expect(src).toContain('toast.error(err instanceof Error ? err.message : "分享失败，请稍后重试")')
    expect(route).toContain('import { requireLearningUserId } from "@/lib/learning-user"')
    expect(route).toContain("const userId = auth.userId!")
  })

  it("does not hardcode supabase url in dev compose", () => {
    const src = read("docker-compose.yml")
    expect(src).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/)
    expect(src).not.toContain(["sb", "publishable_"].join("_"))
  })

  it("does not restore unrelated dead code surfaces", () => {
    const dead = [
      "app/test",
      "components/AsyncStylesheet.tsx",
    ]
    for (const p of dead) {
      expect(fs.existsSync(path.join(root, p))).toBe(false)
    }
  })
})
