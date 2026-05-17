import { shouldSidebarOpenForRoute, usesAppChrome } from '@/lib/app-chrome-routes'

describe('app chrome routes', () => {
  it('wraps workspace routes with the sidebar chrome but leaves public routes alone', () => {
    expect(usesAppChrome('/')).toBe(false)
    expect(usesAppChrome('/chat/standard')).toBe(true)
    expect(usesAppChrome('/credits')).toBe(true)
    expect(usesAppChrome('/explore')).toBe(true)
    expect(usesAppChrome('/folder')).toBe(true)
    expect(usesAppChrome('/my/shares')).toBe(true)
    expect(usesAppChrome('/teacher/agents')).toBe(true)
    expect(usesAppChrome('/tools')).toBe(true)
    expect(usesAppChrome('/about')).toBe(false)
  })

  it('does not force the sidebar open on the public homepage', () => {
    expect(shouldSidebarOpenForRoute('/', true)).toBe(false)
    expect(shouldSidebarOpenForRoute('/', false)).toBe(false)
  })

  it('keeps the sidebar closed on mobile and visible for desktop workspace routes', () => {
    expect(shouldSidebarOpenForRoute('/chat/standard', true)).toBe(false)
    expect(shouldSidebarOpenForRoute('/chat/standard', false)).toBe(true)
    expect(shouldSidebarOpenForRoute('/credits', false)).toBe(true)
  })
})
