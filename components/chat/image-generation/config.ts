import type { ImageGenerationModel, ImageModelConfig } from './types'

export const GPT_IMAGE_2_CHAT_ROUTE = '/chat/gpt-image-2'
export const BANANA_CHAT_ROUTE = '/chat/banana-2-pro'

const MODEL_CONFIGS: Record<ImageGenerationModel, ImageModelConfig> = {
  'gpt-image-2': {
    model: 'gpt-image-2',
    title: 'GPT Image 2',
    modelKey: 'gpt-image-2',
    entryRoute: '/chat/creative-image-gpt2',
    chatRoute: GPT_IMAGE_2_CHAT_ROUTE,
    defaultPromptPlaceholder: '描述你想生成或编辑的画面...',
    ctaLabel: '开始生成',
    modes: [
      { key: 'text-to-image', label: '文生图' },
      { key: 'image-edit', label: '图像编辑' },
    ],
    sizeOptions: [
      { label: '1:1', value: '1:1', width: 1024, height: 1024 },
      { label: '9:16', value: '9:16', width: 1024, height: 1536 },
      { label: '4:3', value: '4:3', width: 1536, height: 1024 },
    ],
    defaultSizeValue: '1:1',
    defaultModeKey: 'text-to-image',
  },
  'banana-2-pro': {
    model: 'banana-2-pro',
    title: 'Banana2 Pro 4K',
    modelKey: 'banana-2-pro',
    entryRoute: '/chat/creative-image-banana',
    chatRoute: BANANA_CHAT_ROUTE,
    defaultPromptPlaceholder: '描述你想生成的图片...',
    ctaLabel: '开始生成',
    modes: [{ key: 'image', label: '图像生成' }],
    sizeOptions: [
      { label: '16:9', value: '16:9', width: 1920, height: 1080 },
      { label: '9:16', value: '9:16', width: 1080, height: 1920 },
      { label: '1:1', value: '1:1', width: 1024, height: 1024 },
      { label: '3:4', value: '3:4', width: 768, height: 1024 },
      { label: '4:3', value: '4:3', width: 1024, height: 768 },
    ],
    defaultSizeValue: '9:16',
    defaultModeKey: 'image',
  },
}

export function getImageModelConfig(model: ImageGenerationModel): ImageModelConfig {
  const config = MODEL_CONFIGS[model]

  return {
    ...config,
    modes: config.modes.map((mode) => ({ ...mode })),
    sizeOptions: config.sizeOptions.map((size) => ({ ...size })),
  }
}
