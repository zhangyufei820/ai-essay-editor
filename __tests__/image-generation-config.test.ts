import {
  getImageModelConfig,
  GPT_IMAGE_2_CHAT_ROUTE,
  BANANA_CHAT_ROUTE,
} from '@/components/chat/image-generation/config'

describe('image generation config', () => {
  it('returns GPT Image 2 config with text-image and image-edit modes', () => {
    const config = getImageModelConfig('gpt-image-2')

    expect(config.entryRoute).toBe('/chat/creative-image-gpt2')
    expect(config.chatRoute).toBe(GPT_IMAGE_2_CHAT_ROUTE)
    expect(config.modes.map((mode) => mode.key)).toEqual(['text-to-image', 'image-edit'])
    expect(config.sizeOptions.map((size) => size.value)).toEqual(['1:1', '9:16', '4:3'])
    expect(config.modes.some((mode) => mode.key === config.defaultModeKey)).toBe(true)
    expect(config.sizeOptions.some((size) => size.value === config.defaultSizeValue)).toBe(true)
  })

  it('returns Banana config with image mode and fixed size choices', () => {
    const config = getImageModelConfig('banana-2-pro')

    expect(config.entryRoute).toBe('/chat/creative-image-banana')
    expect(config.chatRoute).toBe(BANANA_CHAT_ROUTE)
    expect(config.modes.map((mode) => mode.key)).toEqual(['image'])
    expect(config.sizeOptions.map((size) => size.value)).toEqual(['16:9', '9:16', '1:1', '3:4', '4:3'])
    expect(config.modes.some((mode) => mode.key === config.defaultModeKey)).toBe(true)
    expect(config.sizeOptions.some((size) => size.value === config.defaultSizeValue)).toBe(true)
  })

  it('returns cloned config objects so callers cannot mutate shared state', () => {
    const config = getImageModelConfig('gpt-image-2')
    config.modes[0].label = '改坏它'
    config.sizeOptions[0].value = 'broken'

    const nextConfig = getImageModelConfig('gpt-image-2')

    expect(nextConfig.modes[0].label).toBe('文生图')
    expect(nextConfig.sizeOptions[0].value).toBe('1:1')
  })
})
