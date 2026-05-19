import { readFileSync } from 'fs'
import path from 'path'
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

  it('top bar avatar opens an account menu with profile, credits, and logout', () => {
    const source = readFileSync(path.join(process.cwd(), 'components/v2-chrome/WorkspaceTopBar.tsx'), 'utf8')

    expect(source).toContain('DropdownMenuV2Trigger')
    expect(source).toContain('aria-label="打开账户菜单"')
    expect(source).toContain('href="/settings"')
    expect(source).toContain('href="/credits"')
    expect(source).toContain('退出登录')
    expect(source).toContain('window.localStorage.removeItem("authingToken")')
  })
})
