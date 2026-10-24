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

  it('routes Gemini image aliases to the Gemini image chat', () => {
    expect(normalizeChatSessionModel('creative-image-gemini')).toBe('gemini-image')
    expect(normalizeChatSessionModel('google-gemini-image')).toBe('gemini-image')
  })

  it('routes retired Banana aliases to the current GPT Image workspace', () => {
    expect(normalizeChatSessionModel('creative-image-banana')).toBe('gpt-image-2')
    expect(normalizeChatSessionModel('banana')).toBe('gpt-image-2')
    expect(buildChatSessionRoute('abc', 'banana')).toBe('/chat/gpt-image-2?sessionId=abc')
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

  it('routes new and retired website assistant sessions to deep chat', () => {
    expect(normalizeChatSessionModel(undefined)).toBe('gpt-5')
    expect(normalizeChatSessionModel('general-chat')).toBe('gpt-5')
    expect(resolveChatSessionRouteModel({ id: 'new-chat' })).toBe('gpt-5')
    expect(buildChatSessionRoute('new-chat')).toBe('/chat?sessionId=new-chat&agent=gpt-5')
    expect(buildChatSessionRoute('old-chat', 'general-chat')).toBe('/chat?sessionId=old-chat&agent=gpt-5')
  })
})
