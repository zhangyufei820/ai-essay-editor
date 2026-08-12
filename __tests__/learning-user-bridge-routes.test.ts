import fs from "fs"
import path from "path"

const root = process.cwd()

const learningRoutes = [
  "app/api/dashboard/route.ts",
  "app/api/flashcards/due/route.ts",
  "app/api/flashcards/generate/route.ts",
  "app/api/flashcards/review/route.ts",
  "app/api/user/progress/route.ts",
  "app/api/teacher/students/route.ts",
]

describe("learning API user bridge", () => {
  it("routes learning features through the Authing to Supabase bridge", () => {
    for (const route of learningRoutes) {
      const src = fs.readFileSync(path.join(root, route), "utf8")
      expect(src).toContain("requireLearningUserId")
      expect(src).not.toContain("requireUser(request)")
      expect(src).not.toContain("UNSUPPORTED_USER_ID")
    }
  })

  it("does not reintroduce unsupported synced-account errors", () => {
    for (const route of learningRoutes) {
      const src = fs.readFileSync(path.join(root, route), "utf8")
      expect(src).not.toMatch(/仅支持已同步的 Supabase 用户账号|教师账号未同步到 Supabase/)
    }
  })

  it("uses a persistent exact bridge instead of scanning the Supabase auth directory", () => {
    const src = fs.readFileSync(path.join(root, "lib/learning-user.ts"), "utf8")
    const entitlements = fs.readFileSync(path.join(root, "lib/user-entitlements.ts"), "utf8")
    const migration = fs.readFileSync(path.join(root, "scripts/026_auth_user_bridges.sql"), "utf8")

    expect(src).toContain('.from("auth_user_bridges")')
    expect(src).toContain('const AUTHING_PROVIDER = "authing"')
    expect(src).toContain("provider: AUTHING_PROVIDER")
    expect(src).toContain('supabase.rpc("merge_bridged_user_credits"')
    expect(src).not.toContain("listUsers(")
    expect(entitlements).not.toContain("listUsers(")
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.auth_user_bridges")
    expect(migration).toContain("raw_user_meta_data->>'authing_user_id'")
    expect(migration).toContain("REVOKE ALL ON public.auth_user_bridges")
  })

  it("ships service-role-only atomic credit merge and referral settlement functions", () => {
    const migration = fs.readFileSync(
      path.join(root, "supabase/migrations/012_identity_credit_and_referral_atomicity.sql"),
      "utf8",
    )

    expect(migration).toContain("create or replace function public.merge_bridged_user_credits")
    expect(migration).toContain("create or replace function public.grant_referral_credits_once")
    expect(migration).toContain("for update")
    expect(migration).toContain("grant execute on function public.merge_bridged_user_credits(text, text) to service_role")
    expect(migration).toContain("grant execute on function public.grant_referral_credits_once(text, text) to service_role")
    expect(migration).toContain("revoke all on function public.merge_bridged_user_credits(text, text) from public, anon, authenticated")
    expect(migration).toContain("revoke all on function public.grant_referral_credits_once(text, text) from public, anon, authenticated")
  })

  it("keeps referral settlement on canonical identities with a single database-side use increment", () => {
    const processRoute = fs.readFileSync(
      path.join(root, "app/api/referral/process/route.ts"),
      "utf8",
    )
    const syncRoute = fs.readFileSync(
      path.join(root, "app/api/auth/sync/route.ts"),
      "utf8",
    )
    const migration = fs.readFileSync(
      path.join(root, "supabase/migrations/012_identity_credit_and_referral_atomicity.sql"),
      "utf8",
    )

    expect(processRoute).toContain("requireLearningUserId(request)")
    expect(processRoute.indexOf("rejectUntrustedOrigin(request)")).toBeLessThan(
      processRoute.indexOf("requireLearningUserId(request)"),
    )
    expect(processRoute).toContain("邀请奖励仅在完成受邀注册确认后自动结算")
    expect(processRoute).not.toContain("handleReferralSignup")
    expect(processRoute).not.toContain("metadata?.referral_code")
    expect(processRoute).not.toContain('.update({ uses: currentUses + 1 })')
    expect(syncRoute).toContain("requireLearningUserId(request)")
    expect(syncRoute.indexOf("rejectUntrustedOrigin(request)")).toBeLessThan(
      syncRoute.indexOf("requireLearningUserId(request)"),
    )
    expect(syncRoute).toContain("const verifiedUserId = auth.userId!")
    expect(syncRoute).toContain(".from('user_credits')")
    expect(syncRoute).not.toContain("Upsert 积分也失败")
    expect(migration).toContain("source_account_exists := found")
    expect(migration).toContain("coalesce(bridge.supabase_user_id, rc.user_id)")
    expect(migration).toContain("bridge.provider_user_id = rc.user_id")
    expect(migration.match(/set uses = coalesce\(uses, 0\) \+ 1/g)).toHaveLength(1)
  })
})
