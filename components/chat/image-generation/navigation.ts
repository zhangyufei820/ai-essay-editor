interface BuildImageChatRouteParams {
  prompt: string
  mode: string
  size: string
  fileCount: number
}

export function buildImageChatRoute(baseRoute: string, params: BuildImageChatRouteParams): string {
  const searchParams = new URLSearchParams()

  if (params.prompt.trim()) {
    searchParams.set('prompt', params.prompt.trim())
  }

  if (params.mode) {
    searchParams.set('mode', params.mode)
  }

  if (params.size) {
    searchParams.set('size', params.size)
  }

  if (params.fileCount > 0) {
    searchParams.set('files', String(params.fileCount))
  }

  const query = searchParams.toString()
  return query ? `${baseRoute}?${query}` : baseRoute
}
