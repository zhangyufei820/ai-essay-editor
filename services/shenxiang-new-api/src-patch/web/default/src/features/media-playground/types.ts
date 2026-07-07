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

export type MediaMode = 'image' | 'video'

export type ImageWorkflow = 'generate' | 'edit'

export type VideoWorkflow = 'text' | 'image' | 'first-last'

export type MediaKind = 'image' | 'video'

export type ModelCapability = {
  id: string
  label: string
  kind: MediaKind
  vendorLabel: string
  endpoint: string
  description: string
  supportsEdit?: boolean
  supportsImageToVideo?: boolean
  supportsFirstLastFrame?: boolean
  supportsInputFidelity?: boolean
  supportsOutputCompression?: boolean
  supportsPromptEnhancement?: boolean
  supportsWatermark?: boolean
  private?: boolean
  sizes: string[]
  sizeParam?: 'size' | 'aspect_ratio' | 'responseFormat'
  qualities?: string[]
  aspectRatios?: string[]
  resolutions?: string[]
  durations?: number[]
  fps?: number[]
  outputFormats?: string[]
  backgroundOptions?: string[]
  maxCount?: number
  defaultSize: string
  defaultQuality?: string
  defaultAspectRatio?: string
  defaultResolution?: string
  defaultDuration?: number
  defaultFps?: number
  notes: string[]
}

export type MediaResult = {
  id: string
  kind: MediaKind
  url: string
  displayUrl?: string
  cachedUrl?: string
  revisedPrompt?: string
  taskId?: string
  status?: string
  createdAt: number
}

export type ImageGenerationResponse = {
  created?: number
  data?: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
  error?: {
    message?: string
  }
}

export type ImageTaskItem = {
  task_id: string
  request_id?: string
  status: string
  progress?: string
  submit_time?: number
  start_time?: number
  finish_time?: number
  model?: string
  prompt?: string
  action?: string
  result_url?: string
  fail_reason?: string
  quota?: number
  data?: {
    cached_url?: string
    item?: {
      url?: string
      cachedUrl?: string
      displayUrl?: string
      revisedPrompt?: string
      [key: string]: unknown
    }
    error?: string
    [key: string]: unknown
  }
  item?: {
    url?: string
    cachedUrl?: string
    displayUrl?: string
    revisedPrompt?: string
    [key: string]: unknown
  }
}

export type ImageTaskCreateResponse = {
  success?: boolean
  message?: string
  data?: {
    task_id: string
    request_id?: string
    status: string
    poll_url?: string
  }
  error?: {
    message?: string
  }
}

export type ImageTaskFetchResponse = {
  success?: boolean
  message?: string
  data?: ImageTaskItem
  error?: {
    message?: string
  }
}

export type VideoSubmitResponse = {
  id?: string
  task_id?: string
  taskId?: string
  object?: string
  status?: string
  task_status?: string
  taskStatus?: string
  progress?: number
  data?: {
    id?: string
    task_id?: string
    taskId?: string
    status?: string
    task_status?: string
    taskStatus?: string
    progress?: number
    [key: string]: unknown
  }
  metadata?: Record<string, unknown>
  error?: {
    message?: string
  }
}

export type VideoFetchResponse = VideoSubmitResponse & {
  completed_at?: number
  expires_at?: number
}

export type MediaCacheResponse = {
  success: boolean
  message?: string
  data?: {
    url: string
    public_url?: string
    upstream_url?: string
    expires_in: number
  }
}

export type MediaListResponse = {
  success: boolean
  message?: string
  data?: {
    items: MediaResult[]
  }
}
