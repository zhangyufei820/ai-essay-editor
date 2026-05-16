import {
  getImageModelConfig,
  GPT_IMAGE_2_CHAT_ROUTE,
  GEMINI_IMAGE_CHAT_ROUTE,
} from '@/components/chat/image-generation/config'

describe('image generation config', () => {
  it('returns GPT Image 2 config with text-image and image-edit modes', () => {
    const config = getImageModelConfig('gpt-image-2')

    expect(config.entryRoute).toBe('/chat/creative-image-gpt2')
    expect(config.chatRoute).toBe(GPT_IMAGE_2_CHAT_ROUTE)
    expect(config.modes.map((mode) => mode.key)).toEqual(['text-to-image', 'image-edit'])
    expect(config.defaultSizeValue).toBe('1-1-standard')
    expect(config.sizeOptions).toHaveLength(28)
    expect(config.sizeOptions.find((size) => size.value === '16-9-4k-experimental')).toMatchObject({
      ratio: '16:9',
      tier: '4k-experimental',
      apiValue: '3840x2160',
    })
    expect(config.modes.some((mode) => mode.key === config.defaultModeKey)).toBe(true)
    expect(config.sizeOptions.some((size) => size.value === config.defaultSizeValue)).toBe(true)
  })

  it('returns Gemini image config with generation and edit modes', () => {
    const config = getImageModelConfig('gemini-image')

    expect(config.entryRoute).toBe('/chat/creative-image-gemini')
    expect(config.chatRoute).toBe(GEMINI_IMAGE_CHAT_ROUTE)
    expect(config.modes.map((mode) => mode.key)).toEqual(['text-to-image', 'image-edit'])
    expect(config.defaultSizeValue).toBe('1-1-hd')
    expect(config.sizeOptions).toHaveLength(28)
    expect(config.sizeOptions.find((size) => size.value === '1-1-hd')).toMatchObject({
      ratio: '1:1',
      tier: 'hd',
      apiValue: '1536x1536',
    })
    expect(config.modes.some((mode) => mode.key === config.defaultModeKey)).toBe(true)
    expect(config.sizeOptions.some((size) => size.value === config.defaultSizeValue)).toBe(true)
  })

  it('returns cloned config objects so callers cannot mutate shared state', () => {
    const config = getImageModelConfig('gpt-image-2')
    config.modes[0].label = '改坏它'
    config.sizeOptions[0].value = 'broken'

    const nextConfig = getImageModelConfig('gpt-image-2')

    expect(nextConfig.modes[0].label).toBe('文生图')
    expect(nextConfig.sizeOptions[0].value).toBe('1-1-standard')
  })
})
