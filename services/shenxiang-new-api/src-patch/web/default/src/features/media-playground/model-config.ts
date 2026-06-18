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
import type { ModelCapability } from './types'

export const IMAGE_MODEL_IDS = [
  'gpt-image-2-4K',
  'banana-2',
  'gemini-3-pro-image-preview',
  'ecommerce-banana-2',
  'grok-imagine-image',
] as const

export const VIDEO_MODEL_IDS = [
  'grok-video-super-720p',
  'seedance-2.0',
] as const

const GOOGLE_NANO_BANANA_2_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
]

export const MEDIA_MODEL_CONFIGS: ModelCapability[] = [
  {
    id: 'gpt-image-2-4K',
    label: 'GPT Image 2 · 4K',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '适合高质量海报、商品图、人物场景和中文排版方向的图像生成。',
    supportsEdit: true,
    supportsOutputCompression: true,
    maxCount: 4,
    countParam: 'n',
    sizeParam: 'size',
    backgroundOptions: ['auto', 'opaque'],
    sizes: ['1:1', '2:3', '3:2', '16:9', '9:16'],
    resolutions: ['1K', '2K', '4K'],
    qualities: ['auto', 'low', 'medium', 'high'],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultSize: '1:1',
    defaultResolution: '1K',
    defaultQuality: 'high',
    notes: [
      '按 OpenAI Image API 提交：n、size、quality、background、output_format、output_compression。',
      '图像编辑需要上传参考图，可选遮罩图，系统会自动转成 multipart 请求。',
      '页面最多生成 4 张；官方 n 支持 1-10，页面保守限制以控制成本。',
      'gpt-image-2 当前不支持 transparent 背景；页面只开放 auto / opaque。',
    ],
  },
  {
    id: 'banana-2',
    label: 'Banana 2 · 4K',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '适合快速高分辨率创意图、场景草图和视觉方案探索。',
    supportsEdit: true,
    maxCount: 1,
    countParam: 'none',
    sizeParam: 'responseFormat',
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['1K', '2K'],
    qualities: ['auto'],
    outputFormats: ['url'],
    defaultSize: '16:9',
    defaultAspectRatio: '16:9',
    defaultResolution: '2K',
    defaultQuality: 'auto',
    notes: [
      '按 Gemini / Nano Banana 官方参数提交：generationConfig.responseFormat.image.aspectRatio 与 imageSize。',
      '官方没有公开 n 参数，页面固定 1 张，避免把 OpenAI 的 n/size 混传到 Gemini。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
    ],
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image · 4K',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '适合高阶视觉方案、复杂场景草图和高分辨率创意图。',
    supportsEdit: true,
    maxCount: 1,
    countParam: 'none',
    sizeParam: 'responseFormat',
    sizes: [
      '1:1',
      '1:4',
      '1:8',
      '2:3',
      '3:2',
      '3:4',
      '4:1',
      '4:3',
      '4:5',
      '5:4',
      '8:1',
      '9:16',
      '16:9',
      '21:9',
    ],
    aspectRatios: [
      '1:1',
      '1:4',
      '1:8',
      '2:3',
      '3:2',
      '3:4',
      '4:1',
      '4:3',
      '4:5',
      '5:4',
      '8:1',
      '9:16',
      '16:9',
      '21:9',
    ],
    resolutions: ['512', '1K', '2K', '4K'],
    qualities: ['auto'],
    outputFormats: ['url'],
    defaultSize: '16:9',
    defaultAspectRatio: '16:9',
    defaultResolution: '4K',
    defaultQuality: 'auto',
    notes: [
      '按 Gemini 3 Pro Image 官方参数提交：generationConfig.responseFormat.image.aspectRatio 与 imageSize。',
      '官方没有公开 n 参数，页面固定 1 张；Gemini 文档也提示模型不一定严格遵循要求的输出图片数量。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
    ],
  },
  {
    id: 'ecommerce-banana-2',
    label: '电商特价banana-2',
    kind: 'image',
    vendorLabel: 'Gemini',
    endpoint: '/v1/images/generations',
    description: '适合电商商品图和参考图修改；仅支持 1K 输出。',
    supportsEdit: true,
    maxCount: 1,
    countParam: 'none',
    sizeParam: 'responseFormat',
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['1K'],
    qualities: ['auto'],
    outputFormats: ['url'],
    defaultSize: '1:1',
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    defaultQuality: 'auto',
    notes: [
      '上游为 nano-banana-2，按 Google 官方 generationConfig.responseFormat.image.aspectRatio 与 imageSize 提交。',
      '支持图像修改：最多上传 10 张参考图，系统会自动转成兼容请求。',
      '计费按星人统一规则 0.085/张，不采用上游返回成本。',
    ],
  },
  {
    id: 'grok-imagine-image',
    label: 'Grok Image Pro',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '适合真实感、社媒配图、概念视觉和快速风格探索。',
    supportsEdit: true,
    maxCount: 10,
    countParam: 'n',
    sizeParam: 'aspect_ratio',
    sizes: ['960x960', '720x1280', '1280x720', '1168x784', '784x1168'],
    aspectRatios: [
      'auto',
      '1:1',
      '3:4',
      '4:3',
      '9:16',
      '16:9',
      '2:3',
      '3:2',
      '9:19.5',
      '19.5:9',
      '9:20',
      '20:9',
      '1:2',
      '2:1',
    ],
    resolutions: ['1k', '2k'],
    qualities: ['low', 'medium', 'high'],
    outputFormats: ['url', 'b64_json'],
    defaultSize: '960x960',
    defaultAspectRatio: '1:1',
    defaultResolution: '2k',
    defaultQuality: 'high',
    notes: [
      '按 xAI Imagine API 提交：n、aspect_ratio、resolution、response_format。',
      'xAI 官方 n 最多 10 张；页面按官方上限开放。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
    ],
  },
  {
    id: 'grok-video-super-720p',
    label: 'Grok Video · 720P',
    kind: 'video',
    vendorLabel: '星人视频',
    endpoint: '/v1/videos',
    description: '适合短镜头、动态海报、社媒视频和图生视频。',
    supportsImageToVideo: true,
    supportsFirstLastFrame: true,
    supportsPromptEnhancement: true,
    supportsWatermark: true,
    sizes: ['1280x720', '720x1280'],
    durations: [5, 10, 15],
    fps: [24, 30],
    defaultSize: '1280x720',
    defaultDuration: 5,
    defaultFps: 24,
    notes: [
      '视频是异步任务，提交后需要等待任务完成。',
      '上传首帧或首尾帧时，系统会自动把图片转成 data URL 放入请求。',
      '首尾帧请求会附带 metadata.frames，方便兼容支持首尾帧的上游。',
    ],
  },
  {
    id: 'seedance-2.0',
    label: 'Seedance 2.0',
    kind: 'video',
    vendorLabel: '星人视频',
    endpoint: '/v1/videos',
    description: '适合长一点的镜头、人物运动、产品展示和叙事视频。',
    supportsImageToVideo: true,
    supportsFirstLastFrame: true,
    supportsPromptEnhancement: true,
    supportsWatermark: true,
    sizes: ['1280x720', '720x1280', '1024x1024'],
    durations: [5, 10, 15],
    fps: [24, 30],
    defaultSize: '1280x720',
    defaultDuration: 15,
    defaultFps: 24,
    notes: [
      '后台计费按秒配置，页面会显示时长，避免把 6元/15秒误解成按次。',
      '支持文生视频、图生视频、首尾帧三种模式；这些模式互斥，页面会自动生成对应请求。',
    ],
  },
]

export const IMAGE_MODELS = MEDIA_MODEL_CONFIGS.filter(
  (model) => model.kind === 'image'
)

export const VIDEO_MODELS = MEDIA_MODEL_CONFIGS.filter(
  (model) => model.kind === 'video'
)

export function getMediaModelConfig(modelId: string) {
  return MEDIA_MODEL_CONFIGS.find((model) => model.id === modelId)
}
