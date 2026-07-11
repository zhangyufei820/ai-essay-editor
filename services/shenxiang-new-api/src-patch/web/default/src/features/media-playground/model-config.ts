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
  'image 2电商商品图快速通道(1.5K)',
  'ecommerce-banana-2',
  'grok-imagine-image',
] as const

export const VIDEO_MODEL_IDS = [
  'seedance-2.0-dj-fast',
  'seedance-nsfw',
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
    supportsInputFidelity: true,
    supportsOutputCompression: true,
    sizes: ['1:1', '2:3', '3:2', '16:9', '9:16'],
    resolutions: ['1K', '2K', '4K'],
    qualities: ['auto', 'low', 'medium', 'high'],
    outputFormats: ['png', 'jpeg', 'webp'],
    sizeParam: 'size',
    defaultSize: '1:1',
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    defaultQuality: 'high',
    notes: [
      '支持 OpenAI 图片生成常见参数：size、quality、background、output_format、output_compression、input_fidelity。',
      '图像编辑需要上传参考图，可选遮罩图，系统会自动转成 multipart 请求。',
      '4K 是公开展示模型名，系统会自动选择已配置的稳定图像通道。',
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
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['1K', '2K'],
    qualities: ['auto'],
    outputFormats: ['url'],
    sizeParam: 'responseFormat',
    defaultSize: '16:9',
    defaultAspectRatio: '16:9',
    defaultResolution: '2K',
    defaultQuality: 'auto',
    notes: [
      '独立图像模型，不参与 GPT Image 2 fallback；系统会按当前用户分组自动匹配可用通道。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
      '4K 规格支持 4096x2048 等高分辨率输出。',
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
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['512', '1K', '2K', '4K'],
    qualities: ['auto'],
    outputFormats: ['url'],
    sizeParam: 'responseFormat',
    defaultSize: '16:9',
    defaultAspectRatio: '16:9',
    defaultResolution: '4K',
    defaultQuality: 'auto',
    notes: [
      '独立图像模型，不参与 GPT Image 2 或 Banana 2 fallback；系统会按当前用户分组自动匹配可用通道。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
      '4K 规格支持 4096x2048 等高分辨率输出。',
    ],
  },
  {
    id: 'image 2电商商品图快速通道(1.5K)',
    label: 'Image 2 电商商品图 · 1.5K',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '电商商品图快速通道，适合低成本商品主图和营销素材。',
    supportsEdit: true,
    supportsInputFidelity: true,
    supportsOutputCompression: true,
    sizes: ['1:1', '2:3', '3:2', '16:9', '9:16'],
    resolutions: ['auto'],
    qualities: ['auto', 'low', 'medium', 'high'],
    outputFormats: ['png', 'jpeg', 'webp'],
    sizeParam: 'size',
    backgroundOptions: ['auto', 'opaque'],
    maxCount: 4,
    defaultSize: '1:1',
    defaultAspectRatio: '1:1',
    defaultResolution: 'auto',
    defaultQuality: 'high',
    notes: [
      '电商商品图快速通道，实测约 1.5K 输出，适合批量生成商品素材。',
      '支持 OpenAI 图片生成常见参数：size、quality、background、output_format、output_compression、input_fidelity。',
      '图像编辑需要上传参考图，可选遮罩图，系统会自动转成 multipart 请求。',
    ],
  },
  {
    id: 'ecommerce-banana-2',
    label: '电商特价 Banana 2',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '电商特价 Banana 2，适合低成本 1K 商品图和创意草图。',
    supportsEdit: true,
    sizes: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    aspectRatios: GOOGLE_NANO_BANANA_2_ASPECT_RATIOS,
    resolutions: ['1K'],
    qualities: ['auto'],
    outputFormats: ['url'],
    sizeParam: 'responseFormat',
    maxCount: 1,
    defaultSize: '1:1',
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    defaultQuality: 'auto',
    notes: [
      '电商特价 Banana 2，仅支持 1K 输出，可编辑图像。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
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
    outputFormats: ['url'],
    sizeParam: 'aspect_ratio',
    defaultSize: '960x960',
    defaultAspectRatio: '1:1',
    defaultResolution: '2k',
    defaultQuality: 'high',
    notes: [
      '按模型支持的尺寸、宽高比、质量和 1k/2k 分辨率提交，避免浏览器选项和实际生成比例错位。',
      '支持图像修改：切换到图像修改后上传参考图，系统会自动转成 multipart 请求。',
    ],
  },
  {
    id: 'seedance-2.0-dj-fast',
    label: 'Seedance 2.0 DJ Fast',
    kind: 'video',
    vendorLabel: '豆包视频',
    endpoint: '/v1/videos',
    description: '适合快速草稿和社交短片，只接收图片参考，不支持过人脸。',
    supportsImageToVideo: true,
    sizes: ['1280x720', '720x1280'],
    durations: [5, 10, 15],
    fps: [24, 30],
    defaultSize: '1280x720',
    defaultDuration: 10,
    defaultFps: 24,
    notes: [
      '按秒计费，适合快速验证镜头效果。',
      '只接收图片参考，不支持视频或音频参考。',
      '支持 5/10/15 秒，默认 10 秒。',
    ],
  },
  {
    id: 'seedance-nsfw',
    label: 'Seedance 私测视频',
    kind: 'video',
    vendorLabel: '星人视频',
    endpoint: '/v1/videos',
    description: '仅供管理员验证私测视频模型连通性，不进入公开模型池。',
    private: true,
    supportsImageToVideo: true,
    supportsPromptEnhancement: true,
    supportsWatermark: true,
    sizes: ['1280x720', '720x1280', '1024x1024'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    fps: [24, 30],
    defaultSize: '1280x720',
    defaultDuration: 4,
    defaultFps: 24,
    notes: [
      '这是管理员私测模型，只有具备对应模型权限的账号会看到。',
      '官方 Seedance 2.0 时长支持 4-15 秒整数，默认 4 秒用于最低成本连通性测试。',
      '请求会走独立私测服务，不影响公开视频模型。',
      '支持文生视频和首帧图生视频，提交后按异步任务轮询结果。',
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
