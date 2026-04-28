import { shouldSidebarOpenForRoute, usesAppChrome } from '@/lib/app-chrome-routes'

describe('app chrome routes', () => {
  it('wraps the homepage and app routes with the sidebar chrome', () => {
    expect(usesAppChrome('/')).toBe(true)
    expect(usesAppChrome('/chat/standard')).toBe(true)
    expect(usesAppChrome('/credits')).toBe(true)
    expect(usesAppChrome('/about')).toBe(false)
  })

  it('reopens the sidebar on the homepage after chat focus mode collapsed it', () => {
    expect(shouldSidebarOpenForRoute('/', true)).toBe(true)
    expect(shouldSidebarOpenForRoute('/', false)).toBe(true)
  })

  it('keeps mobile chat routes collapsed while desktop app routes keep the sidebar visible', () => {
    expect(shouldSidebarOpenForRoute('/chat/standard', true)).toBe(false)
    expect(shouldSidebarOpenForRoute('/chat/standard', false)).toBe(true)
  })
})
