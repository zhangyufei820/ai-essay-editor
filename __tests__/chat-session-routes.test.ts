import {
  buildChatSessionRoute,
  buildChatSessionRouteFromSession,
  normalizeChatSessionModel,
  resolveChatSessionRouteModel,
} from '@/lib/chat-session-routes'

describe('chat session routes', () => {
  it('routes GPT Image workspace aliases to the dedicated image chat', () => {
    expect(normalizeChatSessionModel('gpt-image-2')).toBe('gpt-image-2')
    expect(normalizeChatSessionModel('gpt-image-1.5')).toBe('gpt-image-2')
    expect(normalizeChatSessionModel('gpt-image-1')).toBe('gpt-image-2')
    expect(normalizeChatSessionModel('gpt-image-1-mini')).toBe('gpt-image-2')
    expect(normalizeChatSessionModel('creative-image-gpt2')).toBe('gpt-image-2')
    expect(buildChatSessionRoute('session 1', 'gpt-image-1')).toBe('/chat/gpt-image-2?sessionId=session%201')
  })

  it('routes Banana aliases to the Banana chat', () => {
    expect(normalizeChatSessionModel('creative-image-banana')).toBe('banana-2-pro')
    expect(normalizeChatSessionModel('banana')).toBe('banana-2-pro')
    expect(buildChatSessionRoute('abc', 'banana')).toBe('/chat/banana-2-pro?sessionId=abc')
  })

  it('infers old GPT Image records from non-model metadata', () => {
    const session = {
      id: 'old-gpt-image',
      title: '图像生成',
      processing_mode: 'image_edit',
      ai_provider: '',
      ai_model: '',
      preview: '',
    }

    expect(resolveChatSessionRouteModel(session)).toBe('gpt-image-2')
    expect(buildChatSessionRouteFromSession(session)).toBe('/chat/gpt-image-2?sessionId=old-gpt-image')
  })

  it('keeps normal chat sessions on the generic chat page', () => {
    expect(buildChatSessionRoute('normal', 'teaching-pro')).toBe('/chat?sessionId=normal&agent=teaching-pro')
  })
})
