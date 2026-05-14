import { recordPhetUsage } from "@/lib/phet/phet-progress"
import { POST } from "@/app/api/lab/record/route"
import { addCredits } from "@/lib/credits"
import { requireUser } from "@/lib/auth/verified-user"

jest.mock("@/lib/credits", () => ({
  addCredits: jest.fn(async () => true),
}))

jest.mock("@/lib/auth/verified-user", () => ({
  requireUser: jest.fn(async () => ({ user: { id: "user-1" }, response: null })),
}))

type TableState = {
  phet_usage: any[]
  phet_learning_events: any[]
  phet_user_achievements: any[]
}

function createSupabaseMock(initialUsage: any[] = []) {
  const state: TableState = {
    phet_usage: [...initialUsage],
    phet_learning_events: [],
    phet_user_achievements: [],
  }

  const from = jest.fn((table: keyof TableState) => ({
    select: jest.fn(() => ({
      eq: jest.fn((_field: string, userId: string) => ({
        order: jest.fn(async () => ({
          data: state[table].filter((row) => row.user_id === userId),
          error: null,
        })),
      })),
    })),
    insert: jest.fn(async (payload: any) => {
      const rows = Array.isArray(payload) ? payload : [payload]
      state[table].push(...rows.map((row) => ({
        created_at: row.created_at || new Date().toISOString(),
        ...row,
      })))
      return { error: null }
    }),
    upsert: jest.fn(async (payload: any) => {
      const rows = Array.isArray(payload) ? payload : [payload]
      state[table].push(...rows)
      return { error: null }
    }),
  }))

  return { from, state }
}

function request(body: unknown) {
  return new Request("http://localhost/api/lab/record", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any
}

describe("PhET lab record API", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("rejects unauthenticated users", async () => {
    ;(requireUser as jest.Mock).mockResolvedValueOnce({
      user: null,
      response: Response.json({ error: "未授权访问" }, { status: 401 }),
    })

    const response = await POST(request({ sim_id: "forces-and-motion-basics", completed: true }))

    expect(response.status).toBe(401)
  })

  it("rejects unknown simulations", async () => {
    const response = await POST(request({ sim_id: "unknown", completed: true }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_SIM_ID" })
  })

  it("awards 15 bonus credits on first completion", async () => {
    const supabase = createSupabaseMock()

    const result = await recordPhetUsage({
      userId: "user-1",
      simId: "forces-and-motion-basics",
      durationSeconds: 120,
      completed: true,
    }, supabase as any)

    expect(result).toMatchObject({
      xp_earned: 15,
      first_completion: true,
      total_uses: 1,
    })
    expect(addCredits).toHaveBeenCalledWith(
      "user-1",
      15,
      "bonus",
      "完成 PhET 实验：力和运动基础",
      "phet:forces-and-motion-basics",
      expect.objectContaining({ actionType: "phet_completion" }),
    )
    expect(supabase.state.phet_learning_events).toHaveLength(1)
  })

  it("does not double-award repeated completions", async () => {
    const supabase = createSupabaseMock([
      {
        user_id: "user-1",
        sim_id: "forces-and-motion-basics",
        completed: true,
        completed_at: "2026-05-14T01:00:00Z",
        created_at: "2026-05-14T01:00:00Z",
      },
    ])

    const result = await recordPhetUsage({
      userId: "user-1",
      simId: "forces-and-motion-basics",
      durationSeconds: 60,
      completed: true,
    }, supabase as any)

    expect(result.first_completion).toBe(false)
    expect(result.xp_earned).toBe(0)
    expect(addCredits).not.toHaveBeenCalled()
  })

  it("unlocks subject and streak achievements", async () => {
    const mathIds = [
      "graphing-quadratics",
      "graphing-lines",
      "graphing-slope-intercept",
      "function-builder",
      "function-builder-basics",
      "calculus-grapher",
      "curve-fitting",
      "equation-grapher",
      "trig-tour",
      "unit-rates",
      "area-builder",
      "fraction-matcher",
      "make-a-ten",
      "number-line-integers",
    ]
    const supabase = createSupabaseMock([
      ...mathIds.map((simId) => ({
        user_id: "user-1",
        sim_id: simId,
        completed: true,
        completed_at: "2026-05-12T01:00:00Z",
        created_at: "2026-05-12T01:00:00Z",
      })),
      {
        user_id: "user-1",
        sim_id: "forces-and-motion-basics",
        completed: false,
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: "user-1",
        sim_id: "density",
        completed: false,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ])

    const result = await recordPhetUsage({
      userId: "user-1",
      simId: "proportion-playground",
      durationSeconds: 90,
      completed: true,
    }, supabase as any)

    expect(result.achievements_unlocked.map((item) => item.id)).toEqual(
      expect.arrayContaining(["math_explorer", "scientist_spirit"]),
    )
    expect(supabase.state.phet_user_achievements.length).toBeGreaterThanOrEqual(2)
  })
})
