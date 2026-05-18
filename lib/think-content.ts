export function splitThinkingContent(rawContent: string) {
  const thinkingParts: string[] = []
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi
  let match: RegExpExecArray | null

  while ((match = thinkRegex.exec(rawContent)) !== null) {
    const value = match[1]?.trim()
    if (value) thinkingParts.push(value)
  }

  const answer = rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/<\/think>/gi, "")
    .trim()

  return {
    thinking: thinkingParts.join("\n\n"),
    answer,
    hasThinking: thinkingParts.length > 0,
    hasOpenThinking: /<think>/i.test(rawContent) && !/<\/think>/i.test(rawContent),
  }
}
