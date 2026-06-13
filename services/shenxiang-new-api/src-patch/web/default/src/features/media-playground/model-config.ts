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
  'grok-image-pro',
] as const

export const VIDEO_MODEL_IDS = [
  'grok-video-super-720p',
  'seedance-2.0',
] as const

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
    sizes: [
      'auto',
      '1024x1024',
      '1024x1536',
      '1536x1024',
      '2048x2048',
      '2048x4096',
      '4096x2048',
    ],
    qualities: ['auto', 'low', 'medium', 'high'],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultSize: '1024x1024',
    defaultQuality: 'high',
    notes: [
      '支持 OpenAI 图片生成常见参数：size、quality、background、output_format、output_compression、input_fidelity。',
      '图像编辑需要上传参考图，可选遮罩图，系统会自动转成 multipart 请求。',
      '4K 是你的公开模型名，上游真实模型名由后台渠道映射处理。',
    ],
  },
  {
    id: 'banana-2',
    label: 'Banana 2 · 4K',
    kind: 'image',
    vendorLabel: 'Moonapix',
    endpoint: '/v1/images/generations',
    description: '适合快速高分辨率创意图、场景草图和视觉方案探索。',
    supportsEdit: false,
    sizes: ['1024x1024', '2048x2048', '2048x4096', '4096x2048'],
    qualities: ['auto'],
    outputFormats: ['url'],
    defaultSize: '4096x2048',
    defaultQuality: 'auto',
    notes: [
      '独立模型，不参与 GPT Image 2 fallback；后台渠道映射到 Moonapix 的 gemini-3.1-flash-image-preview。',
      '4K 规格已用 4096x2048 做上游冒烟测试。',
    ],
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image · 4K',
    kind: 'image',
    vendorLabel: 'Moonapix',
    endpoint: '/v1/images/generations',
    description: '适合高阶视觉方案、复杂场景草图和高分辨率创意图。',
    supportsEdit: false,
    sizes: ['1024x1024', '2048x2048', '2048x4096', '4096x2048'],
    qualities: ['auto'],
    outputFormats: ['url'],
    defaultSize: '4096x2048',
    defaultQuality: 'auto',
    notes: [
      '独立模型，不参与 GPT Image 2 或 Banana 2 fallback；后台渠道直连 Moonapix 的 gemini-3-pro-image-preview。',
      '4K 规格已用 4096x2048 做上游冒烟测试。',
    ],
  },
  {
    id: 'grok-image-pro',
    label: 'Grok Image Pro',
    kind: 'image',
    vendorLabel: '星人图像',
    endpoint: '/v1/images/generations',
    description: '适合真实感、社媒配图、概念视觉和快速风格探索。',
    supportsEdit: false,
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    qualities: ['standard', 'hd'],
    outputFormats: ['url'],
    defaultSize: '1024x1024',
    defaultQuality: 'standard',
    notes: [
      '按 OpenAI-compatible 图片生成格式提交，模型参数保持简洁更稳定。',
      '当前操练场不为该模型展示图像编辑入口。',
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
