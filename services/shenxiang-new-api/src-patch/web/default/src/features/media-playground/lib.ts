/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  ImageGenerationResponse,
  MediaResult,
  VideoFetchResponse,
  VideoSubmitResponse,
} from './types'

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function splitSize(size: string) {
  const [width, height] = size.split('x').map((value) => Number(value))
  return {
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 720,
  }
}

export function extractImageResults(
  response: ImageGenerationResponse
): MediaResult[] {
  if (!Array.isArray(response.data)) return []
  return response.data
    .map((item, index) => {
      const url =
        item.url ||
        (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
      if (!url) return null
      return {
        id: `image-${Date.now()}-${index}`,
        kind: 'image' as const,
        url,
        revisedPrompt: item.revised_prompt,
        createdAt: Date.now(),
      }
    })
    .filter(Boolean) as MediaResult[]
}

export function extractVideoTaskId(response: VideoSubmitResponse): string {
  return response.id || response.task_id || ''
}

export function normalizeVideoStatus(status?: string) {
  const normalized = (status || '').toLowerCase()
  if (['completed', 'succeeded', 'success'].includes(normalized)) {
    return 'completed'
  }
  if (['failed', 'failure', 'error'].includes(normalized)) {
    return 'failed'
  }
  if (['in_progress', 'processing', 'running'].includes(normalized)) {
    return 'processing'
  }
  return normalized || 'queued'
}

export function extractVideoUrl(response: VideoFetchResponse): string {
  const direct = response.metadata?.url
  if (typeof direct === 'string') return direct

  const nestedVideo = response.metadata?.video
  if (nestedVideo && typeof nestedVideo === 'object') {
    const url = (nestedVideo as Record<string, unknown>).url
    if (typeof url === 'string') return url
  }

  const data = response.metadata?.data
  if (data && typeof data === 'object') {
    const url = (data as Record<string, unknown>).url
    if (typeof url === 'string') return url
  }

  return ''
}

export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function compactJson(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}
