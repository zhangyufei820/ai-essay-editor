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
})
