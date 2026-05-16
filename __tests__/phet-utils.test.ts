import {
  PHET_COMPLETION_CREDITS,
  buildPhetChatHref,
  buildPhetLearningPlanTask,
  buildPhetSimUrl,
  calculatePhetStreak,
  filterPhetSims,
  getPhetSim,
  getRecommendedPhetSims,
  getUnlockedPhetAchievements,
  isPhetSimId,
  searchPhetSims,
} from "@/lib/phet/phet-utils"
import { PHET_SIMS } from "@/lib/phet/sims-catalog"

describe("PhET utilities", () => {
  it("builds official PhET HTML URLs and exposes the required catalog", () => {
    expect(PHET_SIMS).toHaveLength(30)
    expect(buildPhetSimUrl("graphing-quadratics", "zh_CN")).toBe(
      "https://phet.colorado.edu/sims/html/graphing-quadratics/latest/graphing-quadratics_zh_CN.html",
    )
    expect(buildPhetSimUrl("graphing-quadratics", "en")).toBe(
      "https://phet.colorado.edu/sims/html/graphing-quadratics/latest/graphing-quadratics_en.html",
    )
    expect(isPhetSimId("forces-and-motion-basics")).toBe(true)
    expect(isPhetSimId("not-a-real-sim")).toBe(false)
  })

  it("searches Chinese names and topic tags", () => {
    expect(searchPhetSims("二次函数").map((sim) => sim.id)).toContain("graphing-quadratics")
    expect(searchPhetSims("摩擦力").map((sim) => sim.id)).toEqual(
      expect.arrayContaining(["forces-and-motion-basics", "friction"]),
    )
  })

  it("filters by subject, grade, and difficulty", () => {
    const results = filterPhetSims({ subject: "math", grade: 8, difficulty: 2 })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((sim) => sim.subject === "math")).toBe(true)
    expect(results.every((sim) => sim.grade_range[0] <= 8 && sim.grade_range[1] >= 8)).toBe(true)
    expect(results.every((sim) => sim.difficulty === 2)).toBe(true)
  })

  it("recommends grade-appropriate simulations", () => {
    const recommended = getRecommendedPhetSims({ grade: 7, subject: "physics", limit: 3 })

    expect(recommended.length).toBeGreaterThan(0)
    expect(recommended.length).toBeLessThanOrEqual(3)
    expect(recommended.every((sim) => sim.subject === "physics")).toBe(true)
    expect(recommended.every((sim) => sim.grade_range[0] <= 7 && sim.grade_range[1] >= 7)).toBe(true)
  })

  it("calculates achievements and streaks", () => {
    const mathIds = PHET_SIMS.filter((sim) => sim.subject === "math").map((sim) => sim.id)
    const now = new Date("2026-05-14T12:00:00Z")

    expect(PHET_COMPLETION_CREDITS).toBe(15)
    expect(calculatePhetStreak([
      "2026-05-12T01:00:00Z",
      "2026-05-13T01:00:00Z",
      "2026-05-14T01:00:00Z",
    ], now)).toBe(3)
    expect(getUnlockedPhetAchievements(mathIds, [
      "2026-05-12T01:00:00Z",
      "2026-05-13T01:00:00Z",
      "2026-05-14T01:00:00Z",
    ], now)).toEqual(expect.arrayContaining(["math_explorer", "scientist_spirit"]))
  })

  it("builds chat deep links and learning-plan task payloads", () => {
    const sim = getPhetSim("forces-and-motion-basics")
    expect(sim).not.toBeNull()

    expect(buildPhetChatHref(sim!, "flashcards")).toContain("/chat/vocab-card?prompt=")
    expect(buildPhetChatHref(sim!, "quiz")).toContain("/chat/quanquan-math?prompt=")
    expect(buildPhetChatHref(sim!, "animation")).toContain("/chat?agent=open-claw&prompt=")
    expect(buildPhetLearningPlanTask(sim!)).toMatchObject({
      type: "phet_sim",
      sim_id: "forces-and-motion-basics",
      title: "完成 PhET 实验：力和运动基础",
    })
  })
})
