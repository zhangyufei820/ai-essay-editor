const INTERNAL_RESULT_MARKER_PATTERN =
  /(?:workflow_run_id|request_id|node_id|引用节点|直接回复\s*\d+)\s*[:：=]/i

const ZERO_SCORE_PATTERNS = [
  /综合总分.*?100%.*?0[^\d]/,
  /综合.*?得分.*?[：:]\s*0[^\d]/,
  /总分.*?[：:]\s*0[^\d]/,
  /等级判定.*?无法判定/,
] as const

const VALID_ESSAY_INDICATORS = [
  /批改/,
  /评分/,
  /得分/,
  /分数/,
  /优点/,
  /缺点/,
  /建议/,
  /修改/,
  /润色/,
  /原文/,
  /总评/,
  /点评/,
  /结构/,
  /语言/,
  /内容/,
  /主题/,
  /开头/,
  /结尾/,
  /段落/,
] as const

const SCORE_FIELD_PATTERN =
  /(?:综合)?(?:总分|得分|分数|评分|score)(?:\s*[*_`~]{1,3})?\s*(?:为\s*)?[:：|]?\s*(\d+(?:\.\d+)?)(?=\s*(?:[/／]\s*\d+(?:\.\d+)?)?\s*(?:[*_`~]{1,3}\s*)?(?:分|分数|$|[，,。；;\n]))/gi
const TABLE_SCORE_LABEL_PATTERN = /^(?:综合)?(?:总分|得分|分数|评分)$/
const TABLE_SCORE_CELL_PATTERN = /^(\d+(?:\.\d+)?)(?:\s*[/／]\s*\d+(?:\.\d+)?)?\s*分?$/

function extractScoreValues(text: string) {
  const inlineScores = Array.from(text.matchAll(SCORE_FIELD_PATTERN), (match) => Number(match[1]))
  const tableScores = text.split(/\r?\n/).flatMap((line) => {
    const row = line.trim()
    if (!row.startsWith("|") || !row.endsWith("|")) return []

    const cells = row.slice(1, -1).split("|")
      .map((cell) => cell.replace(/[*_`~]/g, "").trim())
    if (!TABLE_SCORE_LABEL_PATTERN.test(cells[0] || "")) return []

    // The score follows a weight or maximum-score cell in grading tables.
    const score = cells.slice(1).map((cell) => cell.match(TABLE_SCORE_CELL_PATTERN))
      .filter((match): match is RegExpMatchArray => match !== null)
      .at(-1)
    return score ? [Number(score[1])] : []
  })

  return [...inlineScores, ...tableScores].filter(Number.isFinite)
}

export function isValidEssayCorrectionResult(responseText: string): boolean {
  const text = responseText.trim()
  if (text.length < 100) return false
  if (INTERNAL_RESULT_MARKER_PATTERN.test(text)) return false

  const zeroScoreCount = ZERO_SCORE_PATTERNS.filter((pattern) => pattern.test(text)).length
  if (zeroScoreCount >= 2) return false

  const indicatorCount = VALID_ESSAY_INDICATORS.filter((pattern) => pattern.test(text)).length
  const scoreValues = extractScoreValues(text)
  return indicatorCount >= 3 && scoreValues.some((score) => score > 0)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * A valid report may recover a workflow only when Dify explicitly marks the
 * workflow as partially successful. Fatal error events and failed workflows
 * must win over any plausible-looking text streamed before the failure.
 */
export function canRecoverPartialEssayCorrection(
  value: unknown,
  candidateTexts: string[],
): boolean {
  const event = asRecord(value)
  if (!event || event.event !== "workflow_finished") return false

  const data = asRecord(event.data)
  const status = String(data?.status || event.status || "")
    .toLowerCase()
    .replace(/_/g, "-")

  return status === "partial-succeeded"
    && candidateTexts.some(isValidEssayCorrectionResult)
}
