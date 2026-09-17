export function shouldAttemptEssayFallbackForHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}
