export type AllInOneMediaIntent = "image" | "video" | "unknown"

const IMAGE_MEDIA_PATTERNS = [
  /生成(?:图片|图像|图)(?!.*(?:视频|短片|影片|mp4))/i,
  /(?:^|[\s，。,.；;、])(?:画|绘制)(?:一张|一幅|一个|张|个|幅|图|图片|图像|海报|插图|头像|logo|图标)/i,
  /(?:海报|封面图|配图|插图|头像|logo|图标|壁纸|表情包)/i,
  /\b(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|poster|illustration|cover|logo|icon)\b/i,
]

const VIDEO_MEDIA_PATTERNS = [
  /(?:生成|制作|合成|创建).*(?:视频|短片|影片|mp4)/i,
  /(?:图片|图像|首帧|尾帧).*(?:转视频|生成视频|视频)/i,
  /(?:图生视频|文生视频|首尾帧|视频生成|短视频|运镜|镜头生成)/i,
  /\b(?:video|mp4|image-to-video|text-to-video|short film|clip)\b/i,
]

const IMAGE_NEGATION_PATTERNS = [
  /(?:不要|不用|别|无需|无须|不需要|禁止|避免|先别|暂不|不要再|不用再|不必)(?:.*?)(?:生成|制作|创建|输出|提供|画|绘制)?(?:.*?)(?:图片|图像|图|海报|封面图|配图|插图|头像|logo|图标|壁纸|表情包)/i,
  /(?:不|别)(?:生成|制作|创建|输出|提供|画|绘制)(?:.*?)(?:图片|图像|图|海报|封面图|配图|插图|头像|logo|图标|壁纸|表情包)/i,
  /\b(?:do\s+not|don't|dont|no|without|avoid|skip|never)\s+(?:generate|create|make|produce|output)?\s*(?:an?\s+)?(?:image|picture|poster|illustration|cover|logo|icon)\b/i,
  /\b(?:do\s+not|don't|dont|no|without|avoid|skip|never)\b[^.!?\n]*(?:image|picture|poster|illustration|cover|logo|icon)\b/i,
]

const VIDEO_NEGATION_PATTERNS = [
  /(?:不要|不用|别|无需|无须|不需要|禁止|避免|先别|暂不|不要再|不用再|不必)(?:.*?)(?:生成|制作|创建|输出|提供|合成)?(?:.*?)(?:视频|短片|影片|mp4|图生视频|文生视频|短视频)/i,
  /(?:不|别)(?:生成|制作|创建|输出|提供|合成)(?:.*?)(?:视频|短片|影片|mp4|图生视频|文生视频|短视频)/i,
  /\b(?:do\s+not|don't|dont|no|without|avoid|skip|never)\s+(?:generate|create|make|produce|output)?\s*(?:a\s+)?(?:video|mp4|short film|clip)\b/i,
  /\b(?:do\s+not|don't|dont|no|without|avoid|skip|never)\b[^.!?\n]*(?:video|mp4|short film|clip)\b/i,
]

function matchesAnyPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value))
}

export function detectAllInOneMediaRequest(query: string, inputs: unknown): AllInOneMediaIntent {
  const record = inputs && typeof inputs === "object" && !Array.isArray(inputs)
    ? inputs as Record<string, unknown>
    : null
  const parts = [
    query,
    typeof record?.prompt === "string" ? record.prompt : "",
    typeof record?.image_prompt === "string" ? record.image_prompt : "",
    typeof record?.task_type === "string" ? record.task_type : "",
    typeof record?.user_intent === "string" ? record.user_intent : "",
    typeof record?.skill_name === "string" ? record.skill_name : "",
  ].filter(Boolean).join("\n")

  const videoRequested = matchesAnyPattern(parts, VIDEO_MEDIA_PATTERNS)
  const imageRequested = matchesAnyPattern(parts, IMAGE_MEDIA_PATTERNS)
  const videoNegated = matchesAnyPattern(parts, VIDEO_NEGATION_PATTERNS)
  const imageNegated = matchesAnyPattern(parts, IMAGE_NEGATION_PATTERNS)

  if (videoRequested && !videoNegated) return "video"
  if (imageRequested && !imageNegated) return "image"
  return "unknown"
}
