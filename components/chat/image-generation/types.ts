export type ImageGenerationModel = 'gpt-image-2' | 'banana-2-pro'

export type ImageModeKey = 'text-to-image' | 'image-edit' | 'image'

export interface ImageModeOption {
  key: ImageModeKey
  label: string
}

export interface ImageSizeOption {
  label: string
  value: string
  width: number
  height: number
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
