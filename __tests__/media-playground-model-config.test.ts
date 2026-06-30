import {
  MEDIA_MODEL_CONFIGS,
  VIDEO_MODEL_IDS,
  VIDEO_MODELS,
  getMediaModelConfig,
} from '@/services/shenxiang-new-api/src-patch/web/default/src/features/media-playground/model-config'

describe('default media playground model config', () => {
  it('includes the official Seedance dual models in the video model list', () => {
    expect(VIDEO_MODEL_IDS).toEqual(
      expect.arrayContaining(['seedance-2.0-dj-fast', 'seedance-2.0-ld-17'])
    )
    expect(VIDEO_MODELS.map((model) => model.id)).toEqual(
      expect.arrayContaining(['seedance-2.0-dj-fast', 'seedance-2.0-ld-17'])
    )
  })

  it('describes the Seedance dual models with the expected capabilities', () => {
    const djFast = getMediaModelConfig('seedance-2.0-dj-fast')
    const ld17 = getMediaModelConfig('seedance-2.0-ld-17')

    expect(djFast).toMatchObject({
      kind: 'video',
      vendorLabel: '豆包视频',
      defaultDuration: 10,
      sizes: ['1280x720', '720x1280'],
      durations: [5, 10, 15],
    })
    expect(djFast?.supportsFirstLastFrame).not.toBe(true)
    expect(djFast?.supportsWatermark).not.toBe(true)

    expect(ld17).toMatchObject({
      kind: 'video',
      vendorLabel: '豆包视频',
      defaultDuration: 8,
      sizes: ['1280x720', '720x1280', '1024x1024'],
      durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    })
    expect(ld17?.supportsFirstLastFrame).toBe(true)
    expect(ld17?.supportsPromptEnhancement).toBe(true)
    expect(ld17?.supportsWatermark).toBe(true)
  })

  it('keeps the media model configs clonable by lookup without accidental mutation', () => {
    expect(MEDIA_MODEL_CONFIGS).toContainEqual(
      expect.objectContaining({ id: 'seedance-2.0-dj-fast' })
    )
    expect(MEDIA_MODEL_CONFIGS).toContainEqual(
      expect.objectContaining({ id: 'seedance-2.0-ld-17' })
    )
    expect(getMediaModelConfig('seedance-2.0-dj-fast')?.label).toBe('Seedance 2.0 DJ Fast')
  })
})
