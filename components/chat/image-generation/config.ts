import type {
  ImageGenerationModel,
  ImageModelConfig,
  ImageResolutionTier,
  ImageSizeOption,
} from './types'

export const GPT_IMAGE_2_CHAT_ROUTE = '/chat/gpt-image-2'
export const BANANA_CHAT_ROUTE = '/chat/banana-2-pro'

const SIZE_TIER_LABELS: Record<ImageResolutionTier, string> = {
  standard: '标准',
  hd: '高清',
  '2k': '2K',
  '4k-experimental': '4K 实验',
}

function createSizeOption(
  ratio: string,
  tier: ImageResolutionTier,
  width: number,
  height: number
): ImageSizeOption {
  return {
    label: ratio,
    value: `${ratio.replace(':', '-')}-${tier}`,
    ratio,
    tier,
    tierLabel: SIZE_TIER_LABELS[tier],
    width,
    height,
    apiValue: `${width}x${height}`,
  }
}

const GPT_IMAGE_2_SIZE_OPTIONS = [
  createSizeOption('1:1', 'standard', 1024, 1024),
  createSizeOption('1:1', 'hd', 1536, 1536),
  createSizeOption('1:1', '2k', 2048, 2048),
  createSizeOption('1:1', '4k-experimental', 3072, 3072),
  createSizeOption('4:3', 'standard', 1024, 768),
  createSizeOption('4:3', 'hd', 1440, 1080),
  createSizeOption('4:3', '2k', 2048, 1536),
  createSizeOption('4:3', '4k-experimental', 2880, 2160),
  createSizeOption('3:2', 'standard', 1152, 768),
  createSizeOption('3:2', 'hd', 1620, 1080),
  createSizeOption('3:2', '2k', 2304, 1536),
  createSizeOption('3:2', '4k-experimental', 3240, 2160),
  createSizeOption('16:9', 'standard', 1024, 576),
  createSizeOption('16:9', 'hd', 1920, 1080),
  createSizeOption('16:9', '2k', 2560, 1440),
  createSizeOption('16:9', '4k-experimental', 3840, 2160),
  createSizeOption('9:16', 'standard', 576, 1024),
  createSizeOption('9:16', 'hd', 1080, 1920),
  createSizeOption('9:16', '2k', 1440, 2560),
  createSizeOption('9:16', '4k-experimental', 2160, 3840),
  createSizeOption('2:3', 'standard', 768, 1152),
  createSizeOption('2:3', 'hd', 1080, 1620),
  createSizeOption('2:3', '2k', 1536, 2304),
  createSizeOption('2:3', '4k-experimental', 2160, 3240),
  createSizeOption('3:4', 'standard', 768, 1024),
  createSizeOption('3:4', 'hd', 1080, 1440),
  createSizeOption('3:4', '2k', 1536, 2048),
  createSizeOption('3:4', '4k-experimental', 2160, 2880),
]

const BANANA_SIZE_OPTIONS = [
  createSizeOption('1:1', 'standard', 1024, 1024),
  createSizeOption('1:1', 'hd', 1536, 1536),
  createSizeOption('1:1', '2k', 2048, 2048),
  createSizeOption('1:1', '4k-experimental', 3072, 3072),
  createSizeOption('4:3', 'standard', 1024, 768),
  createSizeOption('4:3', 'hd', 1440, 1080),
  createSizeOption('4:3', '2k', 2048, 1536),
  createSizeOption('4:3', '4k-experimental', 2880, 2160),
  createSizeOption('3:2', 'standard', 1152, 768),
  createSizeOption('3:2', 'hd', 1620, 1080),
  createSizeOption('3:2', '2k', 2304, 1536),
  createSizeOption('3:2', '4k-experimental', 3240, 2160),
  createSizeOption('16:9', 'standard', 1024, 576),
  createSizeOption('16:9', 'hd', 1920, 1080),
  createSizeOption('16:9', '2k', 2560, 1440),
  createSizeOption('16:9', '4k-experimental', 3840, 2160),
  createSizeOption('9:16', 'standard', 576, 1024),
  createSizeOption('9:16', 'hd', 1080, 1920),
  createSizeOption('9:16', '2k', 1440, 2560),
  createSizeOption('9:16', '4k-experimental', 2160, 3840),
  createSizeOption('2:3', 'standard', 768, 1152),
  createSizeOption('2:3', 'hd', 1080, 1620),
  createSizeOption('2:3', '2k', 1536, 2304),
  createSizeOption('2:3', '4k-experimental', 2160, 3240),
  createSizeOption('3:4', 'standard', 768, 1024),
  createSizeOption('3:4', 'hd', 1080, 1440),
  createSizeOption('3:4', '2k', 1536, 2048),
  createSizeOption('3:4', '4k-experimental', 2160, 2880),
]

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
    sizeOptions: GPT_IMAGE_2_SIZE_OPTIONS,
    defaultSizeValue: '1-1-standard',
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
    sizeOptions: BANANA_SIZE_OPTIONS,
    defaultSizeValue: '9-16-hd',
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
