import {
  buildVocabCardWorkflowInputs,
  cleanVocabAnswer,
  resolveVocabCardResult,
} from "@/lib/vocab-card-workflow"

const frontendCard = {
  schema_version: "word_card_frontend_v1",
  render_mode: "premium_word_card",
  status: "success",
  word: "apple",
  hero: {},
  sections: {},
  quality: {},
  ui: {},
}

describe("vocab-card workflow mapping", () => {
  it("maps natural user_message without forcing word", () => {
    expect(buildVocabCardWorkflowInputs({
      query: "你好啊",
      inputs: { user_message: "你好啊", word: "", current_word: "" },
    })).toEqual({
      user_message: "你好啊",
      word: "",
      current_word: "",
      level: "high",
      style: "colorful",
      language: "zh-CN",
    })
  })

  it("allows word-only card generation", () => {
    const inputs = buildVocabCardWorkflowInputs({
      query: "学习单词：apple",
      inputs: { user_message: "", word: "apple", current_word: "" },
    })

    expect(inputs.user_message).toBe("")
    expect(inputs.word).toBe("apple")
  })

  it("keeps current_word for follow-up requests", () => {
    const inputs = buildVocabCardWorkflowInputs({
      query: "考我一下",
      inputs: { user_message: "考我一下", word: "", current_word: "apple" },
    })

    expect(inputs.current_word).toBe("apple")
    expect(inputs.word).toBe("")
  })

  it("never turns the query into a default word", () => {
    const inputs = buildVocabCardWorkflowInputs({
      query: "我要学习这个单词",
      inputs: { user_message: "我要学习这个单词", word: "", current_word: "" },
    })

    expect(inputs.word).toBe("")
    expect(inputs.user_message).toBe("我要学习这个单词")
  })

  it("renders answer only when frontend_card_json is empty", () => {
    const result = resolveVocabCardResult({
      data: {
        outputs: {
          status: "success",
          answer: "你好呀",
          frontend_card_json: "",
        },
      },
    })

    expect(result.frontendCard).toBeNull()
    expect(result.answer).toBe("你好呀")
    expect(result.answer).not.toContain("success")
  })

  it("cleans think tags before rendering answer", () => {
    expect(cleanVocabAnswer("前面<think>hidden</think>你好<thinking>secret</thinking>")).toBe("前面你好")
  })

  it("parses frontend_card_json and updates current word from the card", () => {
    const result = resolveVocabCardResult({
      outputs: {
        answer: "",
        frontend_card_json: JSON.stringify(frontendCard),
      },
    })

    expect(result.frontendCard?.word).toBe("apple")
    expect(result.currentWord).toBe("apple")
  })

  it("preserves previous current word when chat answer omits current_word", () => {
    const result = resolveVocabCardResult({
      outputs: {
        answer: "来做一个小测",
        frontend_card_json: "",
      },
    }, "apple")

    expect(result.currentWord).toBe("apple")
  })

  it("uses text/result as chat fallbacks when no card is returned", () => {
    expect(resolveVocabCardResult({ outputs: { text: "请选择一个单词" } }).answer).toBe("请选择一个单词")
    expect(resolveVocabCardResult({ outputs: { result: "你好呀" } }).answer).toBe("你好呀")
  })

  it("extracts answer from persisted raw JSON output", () => {
    const persisted = JSON.stringify({
      outputs: {
        status: "success",
        answer: "你好呀",
        frontend_card_json: "",
      },
    })

    expect(resolveVocabCardResult(persisted).answer).toBe("你好呀")
  })
})
