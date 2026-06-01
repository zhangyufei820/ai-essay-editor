import {
  chooseProvider,
  getConfiguredProviders,
  recordProviderResult,
  scoreProvider,
  setProviderHealthSnapshot,
} from "@/lib/ai-provider-health"

describe("ai provider health routing", () => {
  it("uses configured provider order when no health data exists", () => {
    expect(getConfiguredProviders("music", { AI_MUSIC_PROVIDERS: "a,b,c" })).toEqual(["a", "b", "c"])
    const choice = chooseProvider("music", { AI_MUSIC_PROVIDERS: "a,b,c" })
    expect(choice.provider).toBe("a")
    expect(choice.score).toBe(100)
  })

  it("avoids providers in open circuit", () => {
    setProviderHealthSnapshot({
      provider: "a",
      modality: "video",
      status: "open_circuit",
      cooldownUntil: new Date(Date.now() + 60_000).toISOString(),
    })
    setProviderHealthSnapshot({
      provider: "b",
      modality: "video",
      status: "healthy",
      p95LatencyMs: 100,
    })

    const choice = chooseProvider("video", { AI_VIDEO_PROVIDERS: "a,b" })

    expect(choice.provider).toBe("b")
  })

  it("moves repeated failures into cooldown", () => {
    let snapshot = recordProviderResult({ modality: "tts", provider: "openai", ok: false, now: new Date("2026-06-01T00:00:00.000Z") })
    snapshot = recordProviderResult({ modality: "tts", provider: "openai", ok: false, now: new Date("2026-06-01T00:00:01.000Z") })
    snapshot = recordProviderResult({ modality: "tts", provider: "openai", ok: false, rateLimited: true, now: new Date("2026-06-01T00:00:02.000Z") })

    expect(snapshot.status).toBe("open_circuit")
    expect(scoreProvider(snapshot, new Date("2026-06-01T00:00:03.000Z"))).toBe(-1)
  })
})
