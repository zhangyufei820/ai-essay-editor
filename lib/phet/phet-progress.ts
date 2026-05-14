import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { addCredits } from "@/lib/credits"
import {
  PHET_ACHIEVEMENTS,
  PHET_COMPLETION_CREDITS,
  calculatePhetStreak,
  getPhetSim,
  getUnlockedPhetAchievements,
  isPhetSimId,
  type PhetAchievementId,
} from "@/lib/phet/phet-utils"

type PhetUsageRow = {
  sim_id: string
  completed?: boolean | null
  completed_at?: string | null
  created_at?: string | null
}

export type PhetRecordInput = {
  userId: string
  simId: string
  durationSeconds: number
  completed: boolean
}

export type PhetRecordResult = {
  xp_earned: number
  total_uses: number
  first_completion: boolean
  achievements_unlocked: Array<{ id: PhetAchievementId; title: string; description: string }>
  streak_days: number
}

export type PhetProgressResult = {
  completed_sim_ids: string[]
  recent_sim_ids: string[]
  achievements: Array<{ id: PhetAchievementId; title: string; description: string }>
  streak_days: number
  total_uses: number
}

export function getPhetSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("缺少 Supabase 配置")
  }
  return createClient(url, key)
}

function clampDurationSeconds(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(86_400, Math.max(0, Math.floor(value)))
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function achievementPayload(ids: PhetAchievementId[]) {
  return ids.map((id) => PHET_ACHIEVEMENTS[id])
}

export async function loadPhetProgress(userId: string, supabase = getPhetSupabaseAdmin()): Promise<PhetProgressResult> {
  const { data, error } = await supabase
    .from("phet_usage")
    .select("sim_id, completed, completed_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  const rows = (data || []) as PhetUsageRow[]
  const completedSimIds = unique(rows.filter((row) => row.completed).map((row) => row.sim_id).filter(isPhetSimId))
  const recentSimIds = unique(rows.map((row) => row.sim_id).filter(isPhetSimId)).slice(0, 8)
  const activityDates = rows.map((row) => row.completed_at || row.created_at).filter(Boolean) as string[]
  const streakDays = calculatePhetStreak(activityDates)
  const achievementIds = getUnlockedPhetAchievements(completedSimIds, activityDates)

  return {
    completed_sim_ids: completedSimIds,
    recent_sim_ids: recentSimIds,
    achievements: achievementPayload(achievementIds),
    streak_days: streakDays,
    total_uses: rows.length,
  }
}

export async function recordPhetUsage(input: PhetRecordInput, supabase = getPhetSupabaseAdmin()): Promise<PhetRecordResult> {
  if (!isPhetSimId(input.simId)) {
    throw new Error("INVALID_SIM_ID")
  }

  const sim = getPhetSim(input.simId)!
  const durationSeconds = clampDurationSeconds(input.durationSeconds)

  const { data: priorRows, error: priorError } = await supabase
    .from("phet_usage")
    .select("sim_id, completed, completed_at, created_at")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })

  if (priorError) {
    throw priorError
  }

  const existingRows = (priorRows || []) as PhetUsageRow[]
  const wasCompleted = existingRows.some((row) => row.sim_id === input.simId && row.completed)
  const firstCompletion = Boolean(input.completed && !wasCompleted)

  const { error: insertError } = await supabase.from("phet_usage").insert({
    user_id: input.userId,
    sim_id: input.simId,
    duration_seconds: durationSeconds,
    completed: input.completed,
    completed_at: input.completed ? new Date().toISOString() : null,
  })

  if (insertError) {
    throw insertError
  }

  let xpEarned = 0
  if (firstCompletion) {
    const success = await addCredits(
      input.userId,
      PHET_COMPLETION_CREDITS,
      "bonus",
      `完成 PhET 实验：${sim.name_zh}`,
      `phet:${input.simId}`,
      {
        feature: "phet_lab",
        actionType: "phet_completion",
        chargedCredits: PHET_COMPLETION_CREDITS,
        description: `完成 PhET 实验：${sim.name_zh}`,
        rawProviderMetadata: {
          simId: input.simId,
          durationSeconds,
          subject: sim.subject,
        },
      },
    )
    xpEarned = success ? PHET_COMPLETION_CREDITS : 0
  }

  const progress = await loadPhetProgress(input.userId, supabase)
  const previousAchievementIds = getUnlockedPhetAchievements(
    unique(existingRows.filter((row) => row.completed).map((row) => row.sim_id).filter(isPhetSimId)),
    existingRows.map((row) => row.completed_at || row.created_at).filter(Boolean) as string[],
  )
  const previous = new Set(previousAchievementIds)
  const unlockedIds = progress.achievements.map((achievement) => achievement.id).filter((id) => !previous.has(id))

  if (firstCompletion) {
    await supabase.from("phet_learning_events").insert({
      user_id: input.userId,
      sim_id: input.simId,
      event_type: "phet_sim_completed",
      metadata: { duration_seconds: durationSeconds, xp_earned: xpEarned },
    })
  }

  if (unlockedIds.length > 0) {
    await supabase.from("phet_user_achievements").upsert(
      unlockedIds.map((id) => ({
        user_id: input.userId,
        achievement_id: id,
        title: PHET_ACHIEVEMENTS[id].title,
        metadata: { source: "phet_lab" },
      })),
      { onConflict: "user_id,achievement_id" },
    )
  }

  return {
    xp_earned: xpEarned,
    total_uses: progress.total_uses,
    first_completion: firstCompletion,
    achievements_unlocked: achievementPayload(unlockedIds),
    streak_days: progress.streak_days,
  }
}
