import { shouldSidebarOpenForRoute, usesAppChrome } from '@/lib/app-chrome-routes'

describe('app chrome routes', () => {
  it('wraps legacy app routes with the sidebar chrome but leaves public and v2-shell routes alone', () => {
    expect(usesAppChrome('/')).toBe(false)
    expect(usesAppChrome('/chat/standard')).toBe(false)
    expect(usesAppChrome('/credits')).toBe(true)
    expect(usesAppChrome('/folder')).toBe(true)
    expect(usesAppChrome('/teacher/agents')).toBe(true)
    expect(usesAppChrome('/tools')).toBe(true)
    expect(usesAppChrome('/about')).toBe(false)
  })

  it('does not force the sidebar open on the public homepage', () => {
    expect(shouldSidebarOpenForRoute('/', true)).toBe(false)
    expect(shouldSidebarOpenForRoute('/', false)).toBe(false)
  })

  it('keeps chat out of the legacy sidebar while desktop app routes keep the sidebar visible', () => {
    expect(shouldSidebarOpenForRoute('/chat/standard', true)).toBe(false)
    expect(shouldSidebarOpenForRoute('/chat/standard', false)).toBe(false)
    expect(shouldSidebarOpenForRoute('/credits', false)).toBe(true)
  })
})
