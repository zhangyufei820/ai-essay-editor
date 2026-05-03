import { resolveVoiceTtsPayload } from "@/lib/voice-tts-request"

describe("voice tts request mapping", () => {
  it("uses text when present", () => {
    expect(resolveVoiceTtsPayload({ text: "hello", word: "apple" }, 600).text).toBe("hello")
  })

  it("falls back to word for Dify raw JSON calls", () => {
    expect(resolveVoiceTtsPayload({ text: "", word: "apple" }, 600).text).toBe("apple")
    expect(resolveVoiceTtsPayload({ text: "", tts_word: "orange" }, 600).text).toBe("orange")
  })

  it("supports tts_text and preserves format fields", () => {
    const payload = resolveVoiceTtsPayload({
      tts_text: "necessary",
      voice: "custom-provider-voice",
      format: "mp3",
    }, 600)

    expect(payload).toMatchObject({
      text: "necessary",
      voice: "custom-provider-voice",
      format: "mp3",
    })
  })

  it("maps Azure neural voice ids to the configured provider default", () => {
    expect(resolveVoiceTtsPayload({ text: "apple", voice: "en-US-JennyNeural" }, 600).voice).toBe("coral")
  })

  it("limits text length", () => {
    expect(resolveVoiceTtsPayload({ text: "abcdef" }, 3).text).toBe("abc")
  })
})
