import { PHET_SIMS, PHET_SIM_BY_ID, type PhetSim, type PhetSubject } from "@/lib/phet/sims-catalog"

export type PhetLocale = "zh_CN" | "en"
export type PhetSortMode = "recommended" | "popular" | "recent"
export type PhetAchievementId = "math_explorer" | "physics_experimenter" | "scientist_spirit"

export type PhetAchievement = {
  id: PhetAchievementId
  title: string
  description: string
}

export const PHET_COMPLETION_CREDITS = 15

export const PHET_ACHIEVEMENTS: Record<PhetAchievementId, PhetAchievement> = {
  math_explorer: {
    id: "math_explorer",
    title: "数学探索者",
    description: "完成全部数学互动实验。",
  },
  physics_experimenter: {
    id: "physics_experimenter",
    title: "物理实验家",
    description: "完成全部物理互动实验。",
  },
  scientist_spirit: {
    id: "scientist_spirit",
    title: "科学家精神",
    description: "连续 3 天使用互动实验室。",
  },
}

export function buildPhetSimUrl(simId: string, locale: PhetLocale = "zh_CN") {
  return `https://phet.colorado.edu/sims/html/${simId}/latest/${simId}_${locale}.html`
}

export function buildPhetThumbnailUrl(simId: string) {
  return `https://phet.colorado.edu/sims/html/${simId}/latest/${simId}-600.png`
}

export function getPhetSim(simId: string) {
  return PHET_SIM_BY_ID.get(simId) || null
}

export function isPhetSimId(simId: unknown): simId is string {
  return typeof simId === "string" && PHET_SIM_BY_ID.has(simId)
}

export function getSubjectLabel(subject: PhetSubject) {
  const labels: Record<PhetSubject, string> = {
    math: "数学",
    physics: "物理",
    chemistry: "化学",
    biology: "生物",
    "earth-science": "地球科学",
  }
  return labels[subject]
}

export function getDifficultyLabel(difficulty: PhetSim["difficulty"]) {
  return difficulty === 1 ? "基础" : difficulty === 2 ? "进阶" : "挑战"
}

export function matchesGrade(sim: PhetSim, grade?: number | null) {
  if (!grade) return true
  return grade >= sim.grade_range[0] && grade <= sim.grade_range[1]
}

export function searchPhetSims(query: string, sims: PhetSim[] = PHET_SIMS) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return sims

  return sims.filter((sim) => {
    const haystack = [
      sim.id,
      sim.name_en,
      sim.name_zh,
      sim.subject,
      sim.description_zh,
      ...sim.topics,
      ...sim.learning_goals,
      ...sim.interactive_elements,
    ].join(" ").toLowerCase()
    return haystack.includes(keyword)
  })
}

export function filterPhetSims(options: {
  query?: string
  subject?: PhetSubject | "all"
  grade?: number | null
  difficulty?: PhetSim["difficulty"] | "all"
  sims?: PhetSim[]
}) {
  const base = searchPhetSims(options.query || "", options.sims || PHET_SIMS)
  return base.filter((sim) => {
    const subjectOk = !options.subject || options.subject === "all" || sim.subject === options.subject
    const gradeOk = matchesGrade(sim, options.grade)
    const difficultyOk = !options.difficulty || options.difficulty === "all" || sim.difficulty === options.difficulty
    return subjectOk && gradeOk && difficultyOk
  })
}

export function sortPhetSims(sims: PhetSim[], mode: PhetSortMode = "recommended", recentIds: string[] = []) {
  const popularOrder = new Map([
    "forces-and-motion-basics",
    "graphing-quadratics",
    "circuit-construction-kit-dc",
    "energy-skate-park-basics",
    "graphing-lines",
    "projectile-motion",
  ].map((id, index) => [id, index]))
  const recentOrder = new Map(recentIds.map((id, index) => [id, index]))

  return [...sims].sort((a, b) => {
    if (mode === "recent") {
      return (recentOrder.get(a.id) ?? 999) - (recentOrder.get(b.id) ?? 999)
    }
    if (mode === "popular") {
      return (popularOrder.get(a.id) ?? 999) - (popularOrder.get(b.id) ?? 999)
    }
    return a.difficulty - b.difficulty || a.grade_range[0] - b.grade_range[0] || a.name_zh.localeCompare(b.name_zh, "zh-Hans-CN")
  })
}

export function getRecommendedPhetSims(options: { grade?: number | null; subject?: PhetSubject | "all"; limit?: number }) {
  return sortPhetSims(filterPhetSims({ grade: options.grade, subject: options.subject || "all" }), "recommended").slice(0, options.limit || 6)
}

export function getRelatedPhetSims(sim: PhetSim, limit = 4) {
  const topicSet = new Set(sim.topics)
  return PHET_SIMS
    .filter((candidate) => candidate.id !== sim.id)
    .map((candidate) => ({
      sim: candidate,
      score:
        (candidate.subject === sim.subject ? 2 : 0) +
        candidate.topics.filter((topic) => topicSet.has(topic)).length +
        (matchesGrade(candidate, sim.grade_range[0]) ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.sim.difficulty - b.sim.difficulty)
    .slice(0, limit)
    .map((item) => item.sim)
}

export function buildPhetChatPrompt(sim: PhetSim, kind: "flashcards" | "quiz" | "animation") {
  const topics = sim.topics.join("、")
  if (kind === "flashcards") {
    return `请为 PhET 实验《${sim.name_zh}》生成一组关于 ${topics} 的复习闪卡，包含概念、例题和易错点。`
  }
  if (kind === "quiz") {
    return `请围绕 PhET 实验《${sim.name_zh}》和知识点 ${topics} 生成一套分层测验，包含选择题、填空题和解析。`
  }
  return `请生成一个关于 ${topics} 的教学动画脚本，参考 PhET 实验《${sim.name_zh}》的交互过程，包含中文讲解、关键标注和动态演示步骤。`
}

export function buildPhetChatHref(sim: PhetSim, kind: "flashcards" | "quiz" | "animation") {
  const prompt = encodeURIComponent(buildPhetChatPrompt(sim, kind))
  if (kind === "flashcards") return `/chat/vocab-card?prompt=${prompt}`
  if (kind === "quiz") return `/chat/quanquan-math?prompt=${prompt}`
  return `/chat?agent=open-claw&prompt=${prompt}`
}

export function calculatePhetStreak(dates: Array<string | Date>, now: Date = new Date()) {
  const dayKeys = new Set(
    dates
      .map((value) => new Date(value))
      .filter((date) => Number.isFinite(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10)),
  )
  let streak = 0
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return streak
}

export function getUnlockedPhetAchievements(completedSimIds: string[], activityDates: Array<string | Date> = [], now: Date = new Date()) {
  const completed = new Set(completedSimIds)
  const subjectComplete = (subject: PhetSubject) => PHET_SIMS.filter((sim) => sim.subject === subject).every((sim) => completed.has(sim.id))
  const achievements: PhetAchievementId[] = []

  if (subjectComplete("math")) achievements.push("math_explorer")
  if (subjectComplete("physics")) achievements.push("physics_experimenter")
  if (calculatePhetStreak(activityDates, now) >= 3) achievements.push("scientist_spirit")

  return achievements
}

export function buildPhetLearningPlanTask(sim: PhetSim) {
  return {
    type: "phet_sim" as const,
    sim_id: sim.id,
    title: `完成 PhET 实验：${sim.name_zh}`,
    subject: sim.subject,
    topics: sim.topics,
    estimated_minutes: sim.duration_minutes,
  }
}
