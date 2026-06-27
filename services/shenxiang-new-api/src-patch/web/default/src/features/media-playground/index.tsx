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
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getUserGroups, getUserModels } from '@/features/playground/api'
import {
  cacheGeneratedMedia,
  createImageEditTask,
  createImageTask,
  createVideo,
  fetchImageTask,
  fetchVideo,
} from './api'
import {
  compactJson,
  downloadUrl,
  extractImageTaskId,
  extractVideoTaskId,
  extractVideoUrl,
  fileToDataUrl,
  getImageTaskProgress,
  getImageTaskStatus,
  getVideoProgress,
  getVideoStatus,
  imageTaskToResult,
  splitSize,
} from './lib'
import {
  IMAGE_MODELS,
  MEDIA_MODEL_CONFIGS,
  VIDEO_MODELS,
  getMediaModelConfig,
} from './model-config'
import type {
  ImageWorkflow,
  MediaMode,
  MediaResult,
  ModelCapability,
  VideoWorkflow,
} from './types'

const IMAGE_WAIT_MESSAGE =
  '图像任务已提交，后台会持久化结果，可用任务 ID 查询。'


const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  '960x960': '1:1',
  '720x1280': '9:16',
  '1280x720': '16:9',
  '1168x784': '3:2',
  '784x1168': '2:3',
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
  '2048x2048': '1:1',
  '2048x1152': '16:9',
  '3840x2160': '16:9',
  '2160x3840': '9:16',
}

const GPT_IMAGE_2_SIZE_BY_RESOLUTION: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '16:9': '1536x864',
    '9:16': '864x1536',
  },
  '2K': {
    '1:1': '2048x2048',
    '2:3': '1152x1728',
    '3:2': '1728x1152',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4K': {
    '1:1': '2880x2880',
    '2:3': '2160x3240',
    '3:2': '3240x2160',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
}

const IMAGE_GENERATION_GROUP = {
  value: 'default',
  label: '图像生成分组',
}

const IMAGE_EDIT_REFERENCE_LIMIT = 10
const VIDEO_REFERENCE_LIMIT = 5
const MEDIA_RESULT_STORAGE_KEY = 'shenxiang-media-playground-results:v1'
const MEDIA_RESULT_TTL_MS = 72 * 60 * 60 * 1000

function isGrokImageModel(model: string) {
  return model === 'grok-imagine-image'
}

function isGeminiImageModel(model: string) {
  return (
    model === 'banana-2' ||
    model === 'gemini-3-pro-image-preview' ||
    model === 'ecommerce-banana-2'
  )
}

function isGptImage2Model(model: string) {
  return (
    model === 'gpt-image-2-4K' ||
    model === 'image 2电商商品图快速通道(1.5K)'
  )
}

function clampCount(value: number, model: ModelCapability) {
  const max = Math.max(1, model.maxCount ?? 1)
  return Math.min(Math.max(1, Number(value) || 1), max)
}

function imageAspectRatioFor(size: string, aspectRatio: string) {
  return aspectRatio && aspectRatio !== 'auto'
    ? aspectRatio
    : (SIZE_TO_ASPECT_RATIO[size] ?? size)
}

function imageResponseFormat(aspectRatio: string, imageSize: string) {
  return {
    image: {
      aspectRatio,
      ...(imageSize && imageSize !== 'auto' ? { imageSize } : {}),
    },
  }
}

function gptImage2SizeFor(aspectRatio: string, imageSize: string) {
  if (imageSize === 'auto') return 'auto'
  const normalizedResolution = imageSize && imageSize !== 'auto' ? imageSize : '1K'
  return (
    GPT_IMAGE_2_SIZE_BY_RESOLUTION[normalizedResolution]?.[aspectRatio] ??
    GPT_IMAGE_2_SIZE_BY_RESOLUTION[normalizedResolution]?.['1:1'] ??
    '1024x1024'
  )
}

function sizeOptionLabel(size: string, model: ModelCapability) {
  if (
    model.kind === 'image' &&
    (model.sizeParam === 'size' || model.sizeParam === 'aspect_ratio')
  ) {
    return SIZE_TO_ASPECT_RATIO[size] ?? size
  }
  return size
}

function resolutionOptionLabel(resolution: string) {
  return resolution === 'auto' ? '默认' : resolution
}

function userFacingGenerationError(error: unknown) {
  const message =
    error instanceof Error && error.message ? error.message : '生成失败'
  const lower = message.toLowerCase()
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : ''
  if (
    lower.includes('prompt_blocked') ||
    lower.includes('content_policy_violation') ||
    lower.includes('rejected by the safety system') ||
    lower.includes('safety_violations=')
  ) {
    return '提示词或参考图被安全策略拒绝，请调整内容后重试。'
  }
  if (
    code === 'econnaborted' ||
    lower.includes('timeout') ||
    lower.includes('network error')
  ) {
    return '本次生成等待时间过长，请稍后刷新媒体工坊查看结果；如果没有结果，再降低分辨率或重试。'
  }
  return message
}

function isPersistentMediaUrl(url?: string) {
  if (!url) return false
  return url.startsWith('/') || /^https?:\/\//i.test(url)
}

function restoreStoredResults(): MediaResult[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MEDIA_RESULT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter((item): item is MediaResult => {
      const url = item?.cachedUrl || item?.url
      return (
        typeof item?.id === 'string' &&
        (item?.kind === 'image' || item?.kind === 'video') &&
        typeof item?.createdAt === 'number' &&
        now - item.createdAt < MEDIA_RESULT_TTL_MS &&
        isPersistentMediaUrl(url)
      )
    })
  } catch {
    return []
  }
}

function persistResults(results: MediaResult[]) {
  if (typeof window === 'undefined') return
  const now = Date.now()
  const storable = results
    .filter((item) => now - item.createdAt < MEDIA_RESULT_TTL_MS)
    .map((item) => {
      const durableUrl = item.cachedUrl || item.url
      if (!isPersistentMediaUrl(durableUrl)) return null
      return {
        ...item,
        url: isPersistentMediaUrl(item.url) ? item.url : durableUrl,
        cachedUrl: item.cachedUrl,
      }
    })
    .filter(Boolean)
    .slice(0, 60)
  window.localStorage.setItem(MEDIA_RESULT_STORAGE_KEY, JSON.stringify(storable))
}

const DEFAULT_PROMPT =
  '一张高级科技感海报，主体是一位年轻创业者站在城市夜景前，干净、真实、有商业质感。'

export function MediaPlayground() {
  const [mode, setMode] = useState<MediaMode>('image')
  const [imageWorkflow, setImageWorkflow] = useState<ImageWorkflow>('generate')
  const [videoWorkflow, setVideoWorkflow] = useState<VideoWorkflow>('text')
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id)
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id)
  const [group, setGroup] = useState('')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [size, setSize] = useState(IMAGE_MODELS[0].defaultSize)
  const [quality, setQuality] = useState(IMAGE_MODELS[0].defaultQuality ?? '')
  const [outputFormat, setOutputFormat] = useState('png')
  const [outputCompression, setOutputCompression] = useState(100)
  const [aspectRatio, setAspectRatio] = useState(
    IMAGE_MODELS[0].defaultAspectRatio ?? 'auto'
  )
  const [resolution, setResolution] = useState(
    IMAGE_MODELS[0].defaultResolution ?? 'auto'
  )
  const [inputFidelity, setInputFidelity] = useState('auto')
  const [background, setBackground] = useState('auto')
  const [count, setCount] = useState(1)
  const [duration, setDuration] = useState(VIDEO_MODELS[0].defaultDuration ?? 5)
  const [fps, setFps] = useState(VIDEO_MODELS[0].defaultFps ?? 24)
  const [seed, setSeed] = useState('')
  const [enhancePrompt, setEnhancePrompt] = useState(true)
  const [watermark, setWatermark] = useState(false)
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [lastFrameFile, setLastFrameFile] = useState<File | null>(null)
  const [maskFile, setMaskFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taskMessage, setTaskMessage] = useState('')
  const [imageTaskLookup, setImageTaskLookup] = useState('')
  const [results, setResults] = useState<MediaResult[]>([])
  const [resultsLoaded, setResultsLoaded] = useState(false)
  const [showRequest, setShowRequest] = useState(false)

  const activeModelId = mode === 'image' ? imageModel : videoModel
  const activeModel = getMediaModelConfig(activeModelId) ?? IMAGE_MODELS[0]
  const referenceFileLimit =
    mode === 'image' ? IMAGE_EDIT_REFERENCE_LIMIT : VIDEO_REFERENCE_LIMIT

  const { data: userModels = [] } = useQuery({
    queryKey: ['media-playground-models'],
    queryFn: getUserModels,
  })

  const { data: userGroups = [] } = useQuery({
    queryKey: ['media-playground-groups'],
    queryFn: getUserGroups,
  })

  const modelAccess = useMemo(() => {
    const available = new Set(userModels.map((item) => item.value))
    return MEDIA_MODEL_CONFIGS.reduce<Record<string, boolean>>((acc, model) => {
      acc[model.id] = available.size === 0 || available.has(model.id)
      return acc
    }, {})
  }, [userModels])

  const availableModelIds = useMemo(
    () => new Set(userModels.map((item) => item.value)),
    [userModels]
  )

  const visibleImageModels = useMemo(
    () =>
      IMAGE_MODELS.filter(
        (model) => !model.private || availableModelIds.has(model.id)
      ),
    [availableModelIds]
  )

  const visibleVideoModels = useMemo(
    () =>
      VIDEO_MODELS.filter(
        (model) => !model.private || availableModelIds.has(model.id)
      ),
    [availableModelIds]
  )

  useEffect(() => {
    if (!group && userGroups.length > 0) {
      const fallback =
        userGroups.find((item) => item.value === 'default')?.value ??
        userGroups[0].value
      setGroup(fallback)
    }
  }, [group, userGroups])

  const effectiveGroup = mode === 'image' ? IMAGE_GENERATION_GROUP.value : group
  const visibleGroupOptions =
    mode === 'image'
      ? [IMAGE_GENERATION_GROUP]
      : userGroups

  useEffect(() => {
    setResults(restoreStoredResults())
    setResultsLoaded(true)
  }, [])

  useEffect(() => {
    if (!resultsLoaded) return
    persistResults(results)
  }, [results, resultsLoaded])

  useEffect(() => {
    const model = getMediaModelConfig(activeModelId)
    if (!model) return
    setSize(model.defaultSize)
    setQuality(model.defaultQuality ?? '')
    setCount((value) => clampCount(value, model))
    if (model.kind === 'image') {
      setOutputFormat(model.outputFormats?.[0] ?? 'url')
      setAspectRatio(
        model.defaultAspectRatio ??
          model.aspectRatios?.[0] ??
          SIZE_TO_ASPECT_RATIO[model.defaultSize] ??
          'auto'
      )
      setResolution(model.defaultResolution ?? model.resolutions?.[0] ?? 'auto')
    }
    if (model.defaultDuration) setDuration(model.defaultDuration)
    if (model.defaultFps) setFps(model.defaultFps)
  }, [activeModelId])

  useEffect(() => {
    setReferenceFiles((files) =>
      files.length > referenceFileLimit
        ? files.slice(0, referenceFileLimit)
        : files
    )
  }, [referenceFileLimit])

  const requestPayload = useMemo(() => {
    if (mode === 'image') {
      const effectiveCount = clampCount(count, activeModel)
      const effectiveAspectRatio = imageAspectRatioFor(size, aspectRatio)
      const payload: Record<string, unknown> = {
        model: imageModel,
        group: effectiveGroup,
        prompt,
      }
      if (isGrokImageModel(imageModel)) {
        payload.n = effectiveCount
        if (effectiveAspectRatio) payload.aspect_ratio = effectiveAspectRatio
        if (resolution && resolution !== 'auto') payload.resolution = resolution
        if (outputFormat && outputFormat !== 'url') payload.response_format = outputFormat
        return payload
      }
      if (isGeminiImageModel(imageModel)) {
        const responseFormat = imageResponseFormat(effectiveAspectRatio, resolution)
        payload.responseFormat = responseFormat
        payload.generationConfig = {
          responseModalities: ['TEXT', 'IMAGE'],
          responseFormat,
        }
        if (negativePrompt.trim()) {
          payload.extra_fields = { negative_prompt: negativePrompt.trim() }
        }
        return payload
      }
      const isGptImage2 = isGptImage2Model(imageModel)
      payload.n = effectiveCount
      payload.size = isGptImage2
        ? gptImage2SizeFor(effectiveAspectRatio, resolution)
        : size
      if (isGptImage2 && resolution && resolution !== 'auto') {
        payload.resolution = resolution
      }
      if (quality) payload.quality = quality
      if (outputFormat && outputFormat !== 'url') {
        payload.output_format = outputFormat
      }
      if (
        activeModel.supportsOutputCompression &&
        outputFormat !== 'png' &&
        outputFormat !== 'url'
      ) {
        payload.output_compression = outputCompression
      }
      if (imageWorkflow === 'edit' && activeModel.supportsInputFidelity) {
        payload.input_fidelity = inputFidelity
      }
      if (activeModel.backgroundOptions?.includes(background) && background !== 'auto') {
        payload.background = background
      }
      if (negativePrompt.trim()) {
        payload.extra_fields = { negative_prompt: negativePrompt.trim() }
      }
      return payload
    }

    const { width, height } = splitSize(size)
    const payload: Record<string, unknown> = {
      model: videoModel,
      group: effectiveGroup,
      prompt,
      seconds: String(duration),
      duration,
      size,
      width,
      height,
      fps,
      response_format: 'url',
    }
    if (activeModel.supportsPromptEnhancement) {
      payload.enhance_prompt = enhancePrompt
    }
    if (activeModel.supportsWatermark) {
      payload.watermark = watermark
    }
    if (seed.trim()) payload.seed = Number(seed)
    if (negativePrompt.trim()) {
      payload.metadata = { negative_prompt: negativePrompt.trim() }
    }
    if (videoWorkflow === 'image') {
      payload.image = '上传的第一张参考图会在提交时自动填入'
      payload.images = ['最多 5 张参考图会在提交时自动填入']
    }
    if (videoWorkflow === 'first-last') {
      payload.image = '上传的第一张首帧 / 参考图会在提交时自动填入'
      payload.images = [
        '最多 5 张首帧 / 参考图会在提交时自动填入',
        '上传的尾帧图片会在提交时自动填入',
      ]
      payload.metadata = {
        ...(payload.metadata as Record<string, unknown> | undefined),
        last_frame_image: '上传的尾帧图片会在提交时自动填入',
        frames: [
          { role: 'first_frame', image: '上传的第一张首帧图片会在提交时自动填入' },
          { role: 'last_frame', image: '上传的尾帧图片会在提交时自动填入' },
        ],
      }
    }
    return payload
  }, [
    activeModel,
    activeModel.supportsInputFidelity,
    activeModel.supportsOutputCompression,
    activeModel.supportsPromptEnhancement,
    activeModel.supportsWatermark,
    background,
    count,
    duration,
    effectiveGroup,
    enhancePrompt,
    fps,
    imageModel,
    imageWorkflow,
    inputFidelity,
    mode,
    negativePrompt,
    outputCompression,
    outputFormat,
    prompt,
    quality,
    aspectRatio,
    resolution,
    seed,
    size,
    videoModel,
    videoWorkflow,
    watermark,
  ])

  const selectedModelAllowed = modelAccess[activeModelId] !== false

  function addReferenceFiles(files: FileList | File[] | null | undefined) {
    const incoming = Array.from(files ?? [])
    if (incoming.length === 0) return
    const available = referenceFileLimit - referenceFiles.length
    if (available <= 0) {
      toast.warning(`最多支持上传 ${referenceFileLimit} 张参考图。`)
      return
    }
    const accepted = incoming.slice(0, available)
    setReferenceFiles((current) =>
      [...current, ...accepted].slice(0, referenceFileLimit)
    )
    if (incoming.length > accepted.length) {
      toast.warning(`最多支持上传 ${referenceFileLimit} 张参考图，已保留前 ${referenceFileLimit} 张。`)
    }
  }

  function removeReferenceFile(index: number) {
    setReferenceFiles((files) => files.filter((_, itemIndex) => itemIndex !== index))
  }

  async function cacheResult(result: MediaResult) {
    try {
      const cached = await cacheGeneratedMedia(result.url, result.kind)
      return { ...result, cachedUrl: cached.url }
    } catch (error) {
      toast.warning(
        error instanceof Error
          ? error.message
          : '生成成功，但临时下载缓存失败，请直接下载原始链接。'
      )
      return result
    }
  }

  async function handleSubmit() {
    if (!selectedModelAllowed) {
      toast.error('当前用户分组暂未开放这个模型。')
      return
    }
    if (!prompt.trim()) {
      toast.error('请先写一句你想生成什么。')
      return
    }
    if (mode === 'image' && imageWorkflow === 'edit' && referenceFiles.length === 0) {
      toast.error('图像修改需要先上传参考图。')
      return
    }
    if (mode === 'video' && videoWorkflow !== 'text' && referenceFiles.length === 0) {
      toast.error('图生视频需要先上传首帧或参考图。')
      return
    }
    if (mode === 'video' && videoWorkflow === 'first-last' && !lastFrameFile) {
      toast.error('首尾帧视频需要同时上传首帧和尾帧。')
      return
    }

    setIsSubmitting(true)
    setTaskMessage(mode === 'video' ? '正在提交视频任务...' : IMAGE_WAIT_MESSAGE)
    try {
      if (mode === 'image') {
        let response
        if (imageWorkflow === 'edit') {
          const form = new FormData()
          Object.entries(requestPayload).forEach(([key, value]) => {
            if (value === undefined || value === null) return
            form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
          })
          referenceFiles.forEach((file) => form.append('image', file))
          if (maskFile) form.set('mask', maskFile)
          response = await createImageEditTask(form)
        } else {
          response = await createImageTask(requestPayload)
        }
        if (response.error?.message) throw new Error(response.error.message)
        if (!response.success) throw new Error(response.message || '图像任务提交失败。')
        const taskId = extractImageTaskId(response)
        if (!taskId) throw new Error('图像任务提交成功但没有返回任务 ID。')
        setImageTaskLookup(taskId)
        setTaskMessage(`图像任务已提交：${taskId}，正在等待持久化结果...`)
        const imageResult = await pollImageTask(taskId)
        setResults((prev) => [imageResult, ...prev])
        toast.success('图像已生成，请立即下载保存。')
        return
      }

      const payload = { ...requestPayload }
      if (videoWorkflow === 'image' || videoWorkflow === 'first-last') {
        const referenceFrames = await Promise.all(
          referenceFiles.map((file) => fileToDataUrl(file))
        )
        payload.image = referenceFrames[0]
        payload.images = referenceFrames
      }
      if (videoWorkflow === 'first-last') {
        const lastFrame = await fileToDataUrl(lastFrameFile!)
        const referenceFrames = Array.isArray(payload.images)
          ? (payload.images as string[])
          : [payload.image as string]
        payload.images = [...referenceFrames, lastFrame]
        payload.metadata = {
          ...(payload.metadata as Record<string, unknown> | undefined),
          last_frame_image: lastFrame,
          frames: [
            ...referenceFrames.map((image, index) => ({
              role: index === 0 ? 'first_frame' : 'reference_frame',
              image,
            })),
            { role: 'last_frame', image: lastFrame },
          ],
        }
      }

      const submit = await createVideo(payload)
      if (submit.error?.message) throw new Error(submit.error.message)
      const directUrl = extractVideoUrl(submit)
      if (directUrl) {
        const directResult = createVideoResult(submit, directUrl)
        const cached = await cacheResult(directResult)
        setResults((prev) => [cached, ...prev])
        toast.success('视频已生成，请立即下载保存。')
        return
      }
      const taskId = extractVideoTaskId(submit)
      if (!taskId) throw new Error('视频任务提交成功但没有返回任务 ID。')
      setTaskMessage(`视频任务已提交：${taskId}，正在等待结果...`)

      const videoResult = await pollVideo(taskId)
      const cached = await cacheResult(videoResult)
      setResults((prev) => [cached, ...prev])
      toast.success('视频已生成，请立即下载保存。')
    } catch (error) {
      toast.error(userFacingGenerationError(error))
    } finally {
      setIsSubmitting(false)
      setTaskMessage('')
    }
  }

  async function pollImageTask(taskId: string): Promise<MediaResult> {
    const deadline = Date.now() + 30 * 60 * 1000
    while (Date.now() < deadline) {
      const response = await fetchImageTask(taskId)
      if (response.error?.message) throw new Error(response.error.message)
      if (!response.success || !response.data) {
        throw new Error(response.message || '图像任务查询失败。')
      }
      const status = getImageTaskStatus(response)
      const progress = getImageTaskProgress(response)
      setTaskMessage(`图像任务 ${response.data.task_id}：${status}，进度 ${progress}%`)
      if (status === 'completed') {
        const result = imageTaskToResult(response.data)
        if (result) return result
        throw new Error('图像任务完成但没有返回持久化图片。')
      }
      if (status === 'failed') {
        throw new Error(response.data.fail_reason || response.data.data?.error || '图像任务失败。')
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    throw new Error('图像生成等待超时，请稍后用任务 ID 查询结果。')
  }

  async function lookupImageTask() {
    const taskId = imageTaskLookup.trim()
    if (!taskId) {
      toast.error('请输入任务 ID。')
      return
    }
    setIsSubmitting(true)
    setTaskMessage(`正在查询图像任务：${taskId}`)
    try {
      const response = await fetchImageTask(taskId)
      if (response.error?.message) throw new Error(response.error.message)
      if (!response.success || !response.data) {
        throw new Error(response.message || '图像任务查询失败。')
      }
      const status = getImageTaskStatus(response)
      if (status === 'completed') {
        const result = imageTaskToResult(response.data)
        if (!result) throw new Error('图像任务完成但没有返回持久化图片。')
        setResults((prev) => [result, ...prev.filter((item) => item.id !== result.id)])
        toast.success('已找到图像任务结果。')
        return
      }
      if (status === 'failed') {
        throw new Error(response.data.fail_reason || response.data.data?.error || '图像任务失败。')
      }
      toast.info(`图像任务仍在处理中：${status}`)
    } catch (error) {
      toast.error(userFacingGenerationError(error))
    } finally {
      setIsSubmitting(false)
      setTaskMessage('')
    }
  }

  async function pollVideo(taskId: string): Promise<MediaResult> {
    const deadline = Date.now() + 10 * 60 * 1000
    while (Date.now() < deadline) {
      const response = await fetchVideo(taskId)
      const status = getVideoStatus(response)
      const progress = getVideoProgress(response)
      const url = extractVideoUrl(response)
      setTaskMessage(`视频任务 ${status}，进度 ${progress}%`)
      if (url) return createVideoResult(response, url, taskId)
      if (status === 'failed') {
        throw new Error(response.error?.message || '视频任务失败。')
      }
      if (status === 'completed') {
        throw new Error('视频完成但没有返回视频地址。')
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    throw new Error('视频生成等待超时，请稍后到任务日志查看结果。')
  }

  function createVideoResult(
    response: Parameters<typeof extractVideoTaskId>[0],
    url: string,
    taskId = ''
  ): MediaResult {
    const id =
      taskId ||
      extractVideoTaskId(response) ||
      `direct-${Date.now()}`
    return {
      id: `video-${id}`,
      kind: 'video',
      url,
      taskId,
      status: 'completed',
      createdAt: Date.now(),
    }
  }

  return (
    <div className='bg-background min-h-full'>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6'>
        <MediaHeader mode={mode} onModeChange={setMode} />

        <div className='grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]'>
          <section className='bg-card text-card-foreground rounded-lg border'>
            <div className='border-b p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-base font-semibold'>生成设置</h2>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    选择模型和用途，系统会自动整理请求格式。
                  </p>
                </div>
                <Badge
                  variant={selectedModelAllowed ? 'secondary' : 'destructive'}
                >
                  {selectedModelAllowed ? '可用' : '无权限'}
                </Badge>
              </div>
            </div>

            <div className='space-y-5 p-4'>
              {mode === 'image' ? (
                <ImageControls
                  activeModel={activeModel}
                  models={visibleImageModels}
                  modelAccess={modelAccess}
                  modelValue={imageModel}
                  workflow={imageWorkflow}
                  onModelChange={setImageModel}
                  onWorkflowChange={setImageWorkflow}
                />
              ) : (
                <VideoControls
                  activeModel={activeModel}
                  models={visibleVideoModels}
                  modelAccess={modelAccess}
                  modelValue={videoModel}
                  workflow={videoWorkflow}
                  onModelChange={setVideoModel}
                  onWorkflowChange={setVideoWorkflow}
                />
              )}

              {mode === 'video' ? (
                <Field label='用户分组'>
                  <NativeSelect
                    className='w-full'
                    value={effectiveGroup}
                    onChange={(event) => setGroup(event.target.value)}
                  >
                    {visibleGroupOptions.map((item) => (
                      <NativeSelectOption key={item.value} value={item.value}>
                        {item.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}

              <Field label='你想生成什么'>
                <Textarea
                  className='min-h-32 resize-none'
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder='用自然语言描述画面、主体、风格、镜头和用途。'
                />
              </Field>

              <Field label='不想出现的内容'>
                <Input
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder='可选，例如：低清晰度、畸形手指、文字错误'
                />
              </Field>

              {(imageWorkflow === 'edit' ||
                (mode === 'video' && videoWorkflow !== 'text')) && (
                <UploadPanel
                  videoWorkflow={videoWorkflow}
                  referenceFiles={referenceFiles}
                  referenceFileLimit={referenceFileLimit}
                  lastFrameFile={lastFrameFile}
                  maskFile={maskFile}
                  showMask={mode === 'image' && imageWorkflow === 'edit'}
                  onReferenceFilesAdd={addReferenceFiles}
                  onReferenceFileRemove={removeReferenceFile}
                  onLastFrameFileChange={setLastFrameFile}
                  onMaskFileChange={setMaskFile}
                />
              )}

              <MediaParameters
                activeModel={activeModel}
                mode={mode}
                imageWorkflow={imageWorkflow}
                count={count}
                duration={duration}
                fps={fps}
                inputFidelity={inputFidelity}
                quality={quality}
                outputFormat={outputFormat}
                outputCompression={outputCompression}
                background={background}
                enhancePrompt={enhancePrompt}
                watermark={watermark}
                seed={seed}
                size={size}
                onCountChange={setCount}
                onDurationChange={setDuration}
                onEnhancePromptChange={setEnhancePrompt}
                onFpsChange={setFps}
                onInputFidelityChange={setInputFidelity}
                onQualityChange={setQuality}
                onOutputFormatChange={setOutputFormat}
                onOutputCompressionChange={setOutputCompression}
                aspectRatio={aspectRatio}
                resolution={resolution}
                onAspectRatioChange={setAspectRatio}
                onResolutionChange={setResolution}
                onBackgroundChange={setBackground}
                onSeedChange={setSeed}
                onSizeChange={setSize}
                onWatermarkChange={setWatermark}
              />

              <Button
                className='h-10 w-full'
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedModelAllowed}
              >
                {isSubmitting ? (
                  <Loader2 className='mr-2 size-4 animate-spin' />
                ) : mode === 'image' ? (
                  <Wand2 className='mr-2 size-4' />
                ) : (
                  <Film className='mr-2 size-4' />
                )}
                {isSubmitting
                  ? '生成中...'
                  : mode === 'image'
                    ? '生成图像'
                    : '生成视频'}
              </Button>
            </div>
          </section>

          <section className='bg-card flex min-h-[640px] flex-col rounded-lg border'>
            <div className='flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between'>
              <div>
                <h2 className='text-base font-semibold'>结果预览</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                  可预览、复制链接，也可以直接下载临时文件。
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setShowRequest((value) => !value)}
              >
                <Copy className='mr-2 size-4' />
                {showRequest ? '隐藏请求' : '查看请求'}
              </Button>
            </div>

            {taskMessage && (
              <div className='bg-muted/40 mx-4 mt-4 rounded-lg border p-3 text-sm'>
                <div className='flex items-center gap-2'>
                  <Loader2 className='size-4 animate-spin' />
                  <span>{taskMessage}</span>
                </div>
              </div>
            )}

            {mode === 'image' && (
              <div className='mx-4 mt-4 flex gap-2'>
                <Input
                  value={imageTaskLookup}
                  onChange={(event) => setImageTaskLookup(event.target.value)}
                  placeholder='task_id'
                  className='h-9'
                />
                <Button
                  variant='outline'
                  size='sm'
                  disabled={isSubmitting}
                  onClick={lookupImageTask}
                >
                  查询
                </Button>
              </div>
            )}

            {showRequest && (
              <pre className='bg-muted/40 mx-4 mt-4 max-h-72 overflow-auto rounded-lg border p-3 text-xs leading-relaxed'>
                {compactJson(requestPayload)}
              </pre>
            )}

            <ResultGrid results={results} />
            <RetentionNotice />
          </section>
        </div>
      </div>
    </div>
  )
}

function MediaHeader({
  mode,
  onModeChange,
}: {
  mode: MediaMode
  onModeChange: (mode: MediaMode) => void
}) {
  return (
    <header className='bg-card flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between md:p-5'>
      <div className='min-w-0'>
        <div className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Sparkles className='size-4' />
          星人媒体工坊
        </div>
        <h1 className='mt-2 text-2xl font-semibold tracking-normal md:text-3xl'>
          图像和视频生成
        </h1>
        <p className='text-muted-foreground mt-2 max-w-2xl text-sm'>
          面向不会写 API
          的用户：选择模型、填写画面描述、上传参考图，然后下载结果。
        </p>
      </div>
      <Tabs
        value={mode}
        onValueChange={(value) => onModeChange(value as MediaMode)}
      >
        <TabsList>
          <TabsTrigger value='image'>
            <ImageIcon className='size-4' />
            图像
          </TabsTrigger>
          <TabsTrigger value='video'>
            <Film className='size-4' />
            视频
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </header>
  )
}

function ImageControls(props: {
  activeModel: ModelCapability
  models: ModelCapability[]
  modelAccess: Record<string, boolean>
  modelValue: string
  workflow: ImageWorkflow
  onModelChange: (value: string) => void
  onWorkflowChange: (value: ImageWorkflow) => void
}) {
  const workflowDisabled = !props.activeModel.supportsEdit
  return (
    <div className='space-y-4'>
      <Field label='图像模型'>
        <ModelSelect
          models={props.models}
          modelAccess={props.modelAccess}
          value={props.modelValue}
          onChange={props.onModelChange}
        />
      </Field>
      <Segmented
        value={props.workflow}
        items={[
          { value: 'generate', label: '文生图', icon: ImageIcon },
          {
            value: 'edit',
            label: '图像修改',
            icon: Upload,
            disabled: workflowDisabled,
          },
        ]}
        onChange={(value) => props.onWorkflowChange(value as ImageWorkflow)}
      />
      <ModelNotes model={props.activeModel} />
    </div>
  )
}

function VideoControls(props: {
  activeModel: ModelCapability
  models: ModelCapability[]
  modelAccess: Record<string, boolean>
  modelValue: string
  workflow: VideoWorkflow
  onModelChange: (value: string) => void
  onWorkflowChange: (value: VideoWorkflow) => void
}) {
  return (
    <div className='space-y-4'>
      <Field label='视频模型'>
        <ModelSelect
          models={props.models}
          modelAccess={props.modelAccess}
          value={props.modelValue}
          onChange={props.onModelChange}
        />
      </Field>
      <Segmented
        value={props.workflow}
        items={[
          { value: 'text', label: '文生视频', icon: Film },
          { value: 'image', label: '图生视频', icon: Upload },
          { value: 'first-last', label: '首尾帧', icon: CheckCircle2 },
        ]}
        onChange={(value) => props.onWorkflowChange(value as VideoWorkflow)}
      />
      <ModelNotes model={props.activeModel} />
    </div>
  )
}

function ModelSelect(props: {
  models: ModelCapability[]
  modelAccess: Record<string, boolean>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect
      className='w-full'
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.models.map((model) => (
        <NativeSelectOption key={model.id} value={model.id}>
          {model.label}
          {props.modelAccess[model.id] === false ? '（当前分组未开放）' : ''}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function ModelNotes({ model }: { model: ModelCapability }) {
  return (
    <div className='bg-muted/30 rounded-lg border p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline'>{model.vendorLabel}</Badge>
        <Badge variant='outline'>{model.endpoint}</Badge>
      </div>
      <p className='text-foreground mt-3 text-sm'>{model.description}</p>
      <ul className='text-muted-foreground mt-2 space-y-1 text-xs'>
        {model.notes.map((note) => (
          <li key={note}>- {note}</li>
        ))}
      </ul>
    </div>
  )
}

function MediaParameters(props: {
  activeModel: ModelCapability
  mode: MediaMode
  imageWorkflow: ImageWorkflow
  count: number
  duration: number
  enhancePrompt: boolean
  fps: number
  inputFidelity: string
  quality: string
  outputFormat: string
  outputCompression: number
  aspectRatio: string
  resolution: string
  background: string
  watermark: boolean
  seed: string
  size: string
  onCountChange: (value: number) => void
  onDurationChange: (value: number) => void
  onEnhancePromptChange: (value: boolean) => void
  onFpsChange: (value: number) => void
  onInputFidelityChange: (value: string) => void
  onQualityChange: (value: string) => void
  onOutputFormatChange: (value: string) => void
  onOutputCompressionChange: (value: number) => void
  onAspectRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onBackgroundChange: (value: string) => void
  onSeedChange: (value: string) => void
  onSizeChange: (value: string) => void
  onWatermarkChange: (value: boolean) => void
}) {
  const imageRatioOptions =
    props.mode === 'image'
      ? (props.activeModel.aspectRatios?.length
          ? props.activeModel.aspectRatios
          : props.activeModel.sizes)
      : []
  const imageRatioValue =
    props.mode === 'image' && props.activeModel.aspectRatios?.length
      ? props.aspectRatio
      : props.size
  const handleImageRatioChange = (value: string) => {
    if (props.activeModel.aspectRatios?.length) {
      props.onAspectRatioChange(value)
      if (props.activeModel.sizes.includes(value)) {
        props.onSizeChange(value)
      }
      return
    }
    props.onSizeChange(value)
    props.onAspectRatioChange(value)
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      {props.mode === 'image' && props.activeModel.resolutions?.length ? (
        <Field label='画面尺寸'>
          <NativeSelect
            className='w-full'
            value={props.resolution}
            onChange={(event) => props.onResolutionChange(event.target.value)}
          >
            {props.activeModel.resolutions.map((resolution) => (
              <NativeSelectOption key={resolution} value={resolution}>
                {resolutionOptionLabel(resolution)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field label={props.mode === 'image' ? '画面尺寸' : '视频尺寸'}>
          <NativeSelect
            className='w-full'
            value={props.size}
            onChange={(event) => props.onSizeChange(event.target.value)}
          >
            {props.activeModel.sizes.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {sizeOptionLabel(size, props.activeModel)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}

      {props.mode === 'image' && imageRatioOptions.length ? (
        <Field label='画面比例'>
          <NativeSelect
            className='w-full'
            value={imageRatioValue}
            onChange={(event) => handleImageRatioChange(event.target.value)}
          >
            {imageRatioOptions.map((ratio) => (
              <NativeSelectOption key={ratio} value={ratio}>
                {ratio}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {props.mode === 'image' && (
        <>
          <Field label='清晰度'>
            <NativeSelect
              className='w-full'
              value={props.quality}
              onChange={(event) => props.onQualityChange(event.target.value)}
            >
              {(props.activeModel.qualities ?? ['auto']).map((quality) => (
                <NativeSelectOption key={quality} value={quality}>
                  {quality}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label='生成数量'>
            <div className='flex items-center gap-3'>
              <Slider
                min={1}
                max={props.activeModel.maxCount ?? 1}
                step={1}
                value={[clampCount(props.count, props.activeModel)]}
                onValueChange={(value) =>
                  props.onCountChange(
                    clampCount(
                      Array.isArray(value) ? (value[0] ?? 1) : value,
                      props.activeModel
                    )
                  )
                }
              />
              <span className='w-8 text-right text-sm'>
                {clampCount(props.count, props.activeModel)}
              </span>
            </div>
          </Field>
          <Field label='输出格式'>
            <NativeSelect
              className='w-full'
              value={props.outputFormat}
              onChange={(event) =>
                props.onOutputFormatChange(event.target.value)
              }
            >
              {(props.activeModel.outputFormats ?? ['url']).map((format) => (
                <NativeSelectOption key={format} value={format}>
                  {format}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {props.activeModel.supportsOutputCompression &&
            props.outputFormat !== 'png' &&
            props.outputFormat !== 'url' && (
              <Field label='压缩质量'>
                <div className='flex items-center gap-3'>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[props.outputCompression]}
                    onValueChange={(value) =>
                      props.onOutputCompressionChange(
                        Array.isArray(value) ? (value[0] ?? 100) : value
                      )
                    }
                  />
                  <span className='w-10 text-right text-sm'>
                    {props.outputCompression}
                  </span>
                </div>
              </Field>
            )}
          {props.activeModel.backgroundOptions?.length ? (
            <Field label='背景'>
              <NativeSelect
                className='w-full'
                value={props.background}
                onChange={(event) => props.onBackgroundChange(event.target.value)}
              >
                {props.activeModel.backgroundOptions.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {option}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {props.imageWorkflow === 'edit' &&
            props.activeModel.supportsInputFidelity && (
              <Field label='参考图保真度'>
                <NativeSelect
                  className='w-full'
                  value={props.inputFidelity}
                  onChange={(event) =>
                    props.onInputFidelityChange(event.target.value)
                  }
                >
                  <NativeSelectOption value='auto'>auto</NativeSelectOption>
                  <NativeSelectOption value='low'>low</NativeSelectOption>
                  <NativeSelectOption value='high'>high</NativeSelectOption>
                </NativeSelect>
              </Field>
            )}
        </>
      )}

      {props.mode === 'video' && (
        <>
          <Field label='时长'>
            <NativeSelect
              className='w-full'
              value={String(props.duration)}
              onChange={(event) =>
                props.onDurationChange(Number(event.target.value))
              }
            >
              {(props.activeModel.durations ?? [5]).map((duration) => (
                <NativeSelectOption key={duration} value={duration}>
                  {duration} 秒
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label='帧率'>
            <NativeSelect
              className='w-full'
              value={String(props.fps)}
              onChange={(event) =>
                props.onFpsChange(Number(event.target.value))
              }
            >
              {(props.activeModel.fps ?? [24]).map((fps) => (
                <NativeSelectOption key={fps} value={fps}>
                  {fps} fps
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label='Seed'>
            <Input
              inputMode='numeric'
              value={props.seed}
              onChange={(event) => props.onSeedChange(event.target.value)}
              placeholder='可选，留空随机'
            />
          </Field>
          {props.activeModel.supportsPromptEnhancement && (
            <SwitchField
              label='智能润色提示词'
              description='开启后让上游优化镜头语言，适合小白用户；关闭则更严格按原文执行。'
              checked={props.enhancePrompt}
              onCheckedChange={props.onEnhancePromptChange}
            />
          )}
          {props.activeModel.supportsWatermark && (
            <SwitchField
              label='添加水印'
              description='默认关闭，方便用户直接保存成品。'
              checked={props.watermark}
              onCheckedChange={props.onWatermarkChange}
            />
          )}
        </>
      )}
    </div>
  )
}

function UploadPanel(props: {
  videoWorkflow: VideoWorkflow
  referenceFiles: File[]
  referenceFileLimit: number
  lastFrameFile: File | null
  maskFile: File | null
  showMask: boolean
  onReferenceFilesAdd: (files: FileList | File[] | null | undefined) => void
  onReferenceFileRemove: (index: number) => void
  onLastFrameFileChange: (file: File | null) => void
  onMaskFileChange: (file: File | null) => void
}) {
  const referenceLabel =
    props.videoWorkflow === 'first-last'
      ? '首帧 / 参考图'
      : props.videoWorkflow === 'image'
        ? '参考图 / 首帧'
        : '参考图'

  return (
    <div className='grid gap-3'>
      <MultiFileInput
        label={referenceLabel}
        files={props.referenceFiles}
        maxFiles={props.referenceFileLimit}
        onAdd={props.onReferenceFilesAdd}
        onRemove={props.onReferenceFileRemove}
      />
      {props.videoWorkflow === 'first-last' && (
        <FileInput
          label='尾帧'
          file={props.lastFrameFile}
          onChange={props.onLastFrameFileChange}
        />
      )}
      {props.showMask && (
        <FileInput
          label='遮罩图（可选）'
          file={props.maskFile}
          onChange={props.onMaskFileChange}
        />
      )}
    </div>
  )
}

function MultiFileInput({
  label,
  files,
  maxFiles,
  onAdd,
  onRemove,
}: {
  label: string
  files: File[]
  maxFiles: number
  onAdd: (files: FileList | File[] | null | undefined) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className='grid gap-2'>
      <label className='bg-muted/20 hover:bg-muted/40 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors'>
        <Upload className='text-muted-foreground size-5' />
        <span className='mt-2 text-sm font-medium'>{label}</span>
        <span className='text-muted-foreground mt-1 max-w-full truncate text-xs'>
          已选 {files.length} / {maxFiles} 张，点击可继续上传 PNG / JPG / WEBP
        </span>
        <input
          type='file'
          multiple
          accept='image/png,image/jpeg,image/webp'
          className='sr-only'
          onChange={(event) => {
            onAdd(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
      {files.length > 0 && (
        <div className='grid gap-2'>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className='bg-muted/20 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs'
            >
              <span className='min-w-0 truncate'>
                {index + 1}. {file.name}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 shrink-0 px-2'
                onClick={() => onRemove(index)}
              >
                移除
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileInput({
  label,
  file,
  onChange,
}: {
  label: string
  file: File | null
  onChange: (file: File | null) => void
}) {
  return (
    <label className='bg-muted/20 hover:bg-muted/40 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors'>
      <Upload className='text-muted-foreground size-5' />
      <span className='mt-2 text-sm font-medium'>{label}</span>
      <span className='text-muted-foreground mt-1 max-w-full truncate text-xs'>
        {file ? file.name : '点击上传 PNG / JPG / WEBP'}
      </span>
      <input
        type='file'
        accept='image/png,image/jpeg,image/webp'
        className='sr-only'
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  )
}

function RetentionNotice() {
  return (
    <div className='text-muted-foreground mt-auto border-t px-4 py-3 text-xs leading-relaxed'>
      生成后的临时预览文件保留 24 小时，到期自动清理；请在有效期内下载保存。
    </div>
  )
}

function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className='bg-muted/20 flex min-h-20 items-center justify-between gap-3 rounded-lg border p-3'>
      <div className='min-w-0'>
        <div className='text-sm font-medium'>{label}</div>
        <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function ResultGrid({ results }: { results: MediaResult[] }) {
  if (results.length === 0) {
    return (
      <div className='flex flex-1 items-center justify-center p-6'>
        <div className='max-w-sm text-center'>
          <div className='bg-muted/40 mx-auto flex size-12 items-center justify-center rounded-lg border'>
            <Sparkles className='text-muted-foreground size-5' />
          </div>
          <h3 className='mt-4 text-base font-semibold'>等待你的第一个作品</h3>
          <p className='text-muted-foreground mt-2 text-sm'>
            生成完成后，图像和视频会出现在这里。临时文件保留 24 小时。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3'>
      {results.map((result) => {
        const usableUrl = result.cachedUrl || result.url
        return (
          <div
            key={result.id}
            className='bg-background overflow-hidden rounded-lg border'
          >
            <div className='bg-muted/30 flex aspect-square items-center justify-center overflow-hidden'>
              {result.kind === 'image' ? (
                <img
                  src={usableUrl}
                  alt='generated result'
                  className='h-full w-full object-contain'
                />
              ) : (
                <video
                  src={usableUrl}
                  className='h-full w-full object-contain'
                  controls
                  playsInline
                />
              )}
            </div>
            <div className='space-y-3 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <Badge variant='secondary'>
                  {result.kind === 'image' ? '图像' : '视频'}
                </Badge>
                <span className='text-muted-foreground text-xs'>
                  24小时内有效
                </span>
              </div>
              {result.revisedPrompt && (
                <p className='text-muted-foreground line-clamp-2 text-xs'>
                  {result.revisedPrompt}
                </p>
              )}
              <div className='grid grid-cols-2 gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    void navigator.clipboard.writeText(usableUrl)
                    toast.success('链接已复制')
                  }}
                >
                  <Copy className='mr-2 size-4' />
                  复制
                </Button>
                <Button
                  size='sm'
                  onClick={() =>
                    downloadUrl(
                      usableUrl,
                      result.kind === 'image'
                        ? 'xingren-image.png'
                        : 'xingren-video.mp4'
                    )
                  }
                >
                  <Download className='mr-2 size-4' />
                  下载
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className='block space-y-2'>
      <span className='text-sm font-medium'>{label}</span>
      {children}
    </label>
  )
}

function Segmented(props: {
  value: string
  items: Array<{
    value: string
    label: string
    icon: React.ElementType
    disabled?: boolean
  }>
  onChange: (value: string) => void
}) {
  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
      {props.items.map((item) => (
        <button
          key={item.value}
          type='button'
          disabled={item.disabled}
          onClick={() => props.onChange(item.value)}
          className={cn(
            'flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
            props.value === item.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background hover:bg-muted',
            item.disabled && 'cursor-not-allowed opacity-40'
          )}
        >
          <item.icon className='size-4' />
          {item.label}
        </button>
      ))}
    </div>
  )
}
