export type ImageGenerationModel = 'gpt-image-2' | 'banana-2-pro'

export type ImageModeKey = 'text-to-image' | 'image-edit' | 'image'
export type ImageResolutionTier = 'standard' | 'hd' | '2k' | '4k-experimental'

export interface ImageModeOption {
  key: ImageModeKey
  label: string
}

export interface ImageSizeOption {
  label: string
  value: string
  ratio: string
  tier: ImageResolutionTier
  tierLabel: string
  width: number
  height: number
  apiValue: string
}

export interface ImageModelConfig {
  model: ImageGenerationModel
  title: string
  modelKey: 'gpt-image-2' | 'banana-2-pro'
  entryRoute: string
  chatRoute: string
  defaultPromptPlaceholder: string
  ctaLabel: string
  modes: ImageModeOption[]
  sizeOptions: ImageSizeOption[]
  defaultSizeValue: string
  defaultModeKey: ImageModeKey
}
