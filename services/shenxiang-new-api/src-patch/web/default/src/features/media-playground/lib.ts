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
  ImageTaskFetchResponse,
  ImageTaskItem,
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

function normalizeTaskStatus(status?: string) {
  const normalized = (status || '').toLowerCase()
  if (['success', 'completed', 'succeeded'].includes(normalized)) {
    return 'completed'
  }
  if (['failure', 'failed', 'error'].includes(normalized)) {
    return 'failed'
  }
  if (['in_progress', 'processing', 'running'].includes(normalized)) {
    return 'processing'
  }
  return normalized || 'queued'
}

function imageTaskFromResponse(
  response: ImageTaskFetchResponse | ImageTaskItem
): ImageTaskItem {
  if ('task_id' in response) return response
  return response.data as ImageTaskItem
}

export function getImageTaskStatus(response: ImageTaskFetchResponse | ImageTaskItem) {
  const task = imageTaskFromResponse(response)
  return normalizeTaskStatus(task.status)
}

export function getImageTaskProgress(response: ImageTaskFetchResponse | ImageTaskItem) {
  const task = imageTaskFromResponse(response)
  const raw = task.progress || ''
  const match = String(raw).match(/\d+/)
  return match ? Number(match[0]) : 0
}

export function extractImageTaskId(response: { data?: { task_id?: string } }) {
  return response.data?.task_id || ''
}

export function imageTaskToResult(task: ImageTaskItem): MediaResult | null {
  const item = task.item || task.data?.item
  const url =
    item?.cachedUrl ||
    item?.displayUrl ||
    item?.url ||
    task.result_url ||
    task.data?.cached_url ||
    ''
  if (!url) return null
  return {
    id: `image-${task.task_id}`,
    kind: 'image',
    url,
    cachedUrl: item?.cachedUrl || url,
    revisedPrompt:
      typeof item?.revisedPrompt === 'string' ? item.revisedPrompt : undefined,
    taskId: task.task_id,
    status: 'completed',
    createdAt: Date.now(),
  }
}

export function extractVideoTaskId(response: VideoSubmitResponse): string {
  return (
    response.id ||
    response.task_id ||
    response.taskId ||
    response.data?.id ||
    response.data?.task_id ||
    response.data?.taskId ||
    ''
  )
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

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

export function getVideoStatus(response: VideoFetchResponse | VideoSubmitResponse) {
  return normalizeVideoStatus(
    response.status ||
      response.task_status ||
      response.taskStatus ||
      response.data?.status ||
      response.data?.task_status ||
      response.data?.taskStatus ||
      stringValue(response.metadata?.status)
  )
}

export function getVideoProgress(response: VideoFetchResponse | VideoSubmitResponse) {
  return (
    response.progress ||
    response.data?.progress ||
    numberValue(response.metadata?.progress) ||
    0
  )
}

function isUsableMediaUrl(url: string) {
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    /^https?:\/\//i.test(url)
  )
}

function pickVideoUrl(value: unknown, depth = 0): string {
  if (!value || depth > 6) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return isUsableMediaUrl(trimmed) ? trimmed : ''
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickVideoUrl(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const directKeys = [
    'url',
    'video',
    'video_url',
    'videoUrl',
    'output_url',
    'outputUrl',
    'result_url',
    'resultUrl',
    'download_url',
    'downloadUrl',
    'file_url',
    'fileUrl',
    'signed_url',
    'signedUrl',
    'uri',
    'link',
    'href',
    'fail_reason',
    'failReason',
  ]
  for (const key of directKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const found = pickVideoUrl(record[key], depth + 1)
      if (found) return found
    }
  }

  const containerKeys = [
    'metadata',
    'data',
    'result',
    'response',
    'output',
    'outputs',
    'content',
    'items',
    'videos',
    'files',
    'artifact',
    'artifacts',
  ]
  for (const key of containerKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const found = pickVideoUrl(record[key], depth + 1)
      if (found) return found
    }
  }
  return ''
}

export function extractVideoUrl(response: VideoFetchResponse | VideoSubmitResponse): string {
  return pickVideoUrl(response)
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
