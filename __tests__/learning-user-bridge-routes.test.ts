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

  it("paginates the Supabase auth directory instead of scanning only the first 1000 users", () => {
    const src = fs.readFileSync(path.join(root, "lib/learning-user.ts"), "utf8")
    const entitlements = fs.readFileSync(path.join(root, "lib/user-entitlements.ts"), "utf8")

    expect(src).toContain("for (let page = 1; page <= MAX_ADMIN_USER_PAGES; page += 1)")
    expect(src).toContain("listUsers({ page, perPage: ADMIN_USERS_PAGE_SIZE })")
    expect(src).toContain("data.users.length < ADMIN_USERS_PAGE_SIZE")
    expect(src).not.toContain("saveUserMapping")
    expect(entitlements).toContain("listUsers({ page, perPage: ADMIN_USERS_PAGE_SIZE })")
    expect(entitlements).toContain("page <= MAX_ADMIN_USER_PAGES")
  })
})
