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
import { api } from '@/lib/api'
import type {
  ImageGenerationResponse,
  MediaCacheResponse,
  MediaListResponse,
  VideoFetchResponse,
  VideoSubmitResponse,
} from './types'

const IMAGE_REQUEST_TIMEOUT_MS = 240_000

export async function generateImage(payload: Record<string, unknown>) {
  const res = await api.post<ImageGenerationResponse>(
    '/pg/images/generations',
    payload,
    { skipErrorHandler: true, timeout: IMAGE_REQUEST_TIMEOUT_MS }
  )
  return res.data
}

export async function editImage(payload: FormData) {
  const res = await api.post<ImageGenerationResponse>(
    '/pg/images/edits',
    payload,
    {
      skipErrorHandler: true,
      timeout: IMAGE_REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  )
  return res.data
}

export async function createVideo(payload: Record<string, unknown>) {
  const res = await api.post<VideoSubmitResponse>('/pg/videos', payload, {
    skipErrorHandler: true,
  })
  return res.data
}

export async function fetchVideo(taskId: string) {
  const res = await api.get<VideoFetchResponse>(
    `/pg/videos/${encodeURIComponent(taskId)}`,
    { skipErrorHandler: true, disableDuplicate: true }
  )
  return res.data
}

export async function cacheGeneratedMedia(
  url: string,
  kind: 'image' | 'video',
  metadata?: Record<string, unknown>
) {
  const res = await api.post<MediaCacheResponse>(
    '/pg/media/cache',
    { url, kind, ...(metadata ?? {}) },
    { skipErrorHandler: true }
  )
  if (!res.data.success || !res.data.data?.url) {
    throw new Error(res.data.message || 'Failed to cache generated media')
  }
  return res.data.data
}

export async function listCachedMedia() {
  const res = await api.get<MediaListResponse>('/pg/media/list', {
    skipErrorHandler: true,
  })
  return res.data.data?.items ?? []
}
