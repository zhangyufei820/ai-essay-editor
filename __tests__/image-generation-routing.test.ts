import { buildImageChatRoute } from '@/components/chat/image-generation/navigation'

describe('buildImageChatRoute', () => {
  it('builds GPT Image 2 fullscreen chat route with prompt and size', () => {
    expect(
      buildImageChatRoute('/chat/gpt-image-2', {
        prompt: '海边日落',
        mode: 'image-edit',
        size: '1-1-hd',
        fileCount: 2,
      })
    ).toBe('/chat/gpt-image-2?prompt=%E6%B5%B7%E8%BE%B9%E6%97%A5%E8%90%BD&mode=image-edit&size=1-1-hd&files=2')
  })

  it('omits empty values from the query string', () => {
    expect(
      buildImageChatRoute('/chat/banana-2-pro', {
        prompt: '',
        mode: 'image',
        size: '9-16-hd',
        fileCount: 0,
      })
    ).toBe('/chat/banana-2-pro?mode=image&size=9-16-hd')
  })
})
