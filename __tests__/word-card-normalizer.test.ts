import { containsRawDifyWordCardPayload, normalizeDifyWordCardResponse, safeJsonParse } from "@/lib/word-card-normalizer"

const frontendCard = {
  schema_version: "word_card_frontend_v1",
  render_mode: "premium_word_card",
  status: "success",
  word: "necessary",
  hero: {},
  sections: {},
  quality: {},
  ui: {}
}

describe("word-card normalizer", () => {
  it("parses workflow outputs frontend_card_json", () => {
    const result = {
      data: {
        outputs: {
          frontend_card_json: JSON.stringify(frontendCard)
        }
      }
    }

    expect(normalizeDifyWordCardResponse(result)?.word).toBe("necessary")
  })

  it("parses forwarded outputs frontend_card_json", () => {
    const result = {
      outputs: {
        frontend_card_json: frontendCard
      }
    }

    expect(normalizeDifyWordCardResponse(result)?.render_mode).toBe("premium_word_card")
  })

  it("parses root frontend_card_json", () => {
    expect(normalizeDifyWordCardResponse({ frontend_card_json: frontendCard })?.word).toBe("necessary")
  })

  it("merges top-level tts_response into parsed frontend card", () => {
    const card = normalizeDifyWordCardResponse({
      outputs: {
        frontend_card_json: JSON.stringify(frontendCard),
        tts_response: {
          status: "success",
          audio_url: "https://cdn.example.com/necessary.mp3"
        }
      }
    })

    expect(card?.sections?.pronunciation?.audio?.audio_url).toBe("https://cdn.example.com/necessary.mp3")
    expect(card?.sections?.pronunciation?.audio?.status).toBe("success")
  })

  it("does not render internal card_json_text as a frontend card", () => {
    const result = {
      outputs: {
        card_json_text: JSON.stringify({
          card: {
            word: "apple",
            meaning: { primary_cn: "苹果", simple_en: "a fruit" },
            pronunciation: { tts_text: "apple" }
          },
          quality_control: { passed: true, score: 98 }
        })
      }
    }

    expect(normalizeDifyWordCardResponse(result)).toBeNull()
  })

  it("does not expose invalid raw JSON as a card", () => {
    expect(normalizeDifyWordCardResponse({ answer: "{\"status\":\"success\"}" })).toBeNull()
  })

  it("keeps safeJsonParse strict for non-json text", () => {
    expect(safeJsonParse("success {\"status\":\"success\"}")).toBeNull()
  })

  it("detects raw Dify word-card payloads", () => {
    expect(containsRawDifyWordCardPayload("success {\"status\":\"success\"}")).toBe(true)
    expect(containsRawDifyWordCardPayload("{\"frontend_card_json\":\"{}\"}")).toBe(true)
    expect(containsRawDifyWordCardPayload("普通学习说明")).toBe(false)
  })
})
