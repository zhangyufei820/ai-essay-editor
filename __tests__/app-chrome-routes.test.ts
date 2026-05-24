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
    expect(usesAppChrome('/suno')).toBe(true)
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
    expect(source).toContain('clearStoredAuthTokens()')

    const authSource = readFileSync(path.join(process.cwd(), 'lib/client-auth.ts'), 'utf8')
    expect(authSource).toContain('"authingToken"')
    expect(authSource).toContain('window.localStorage.removeItem(key)')
  })

  it('settings profile exposes avatar upload and save controls in v2 profile card', () => {
    const settings = readFileSync(path.join(process.cwd(), 'app/settings/page.tsx'), 'utf8')
    const profile = readFileSync(path.join(process.cwd(), 'components/settings/v2/ProfilePageV2.tsx'), 'utf8')

    expect(settings).toContain('onChange={handleUploadAvatar}')
    expect(settings).toContain('createAvatarDataUrl')
    expect(settings).not.toContain(".from('avatars')")
    expect(settings).toContain('onAvatarClick={() => fileInputRef.current?.click()}')
    expect(settings).toContain('onDisplayNameChange={setDisplayName}')
    expect(settings).toContain('onSaveProfile={handleSave}')
    expect(settings).toContain('looksLikeAnonymousNumericName')
    expect(settings).toContain('avatarUrl: avatarUrl')
    expect(settings).toContain('photo: avatarUrl')
    expect(settings).toContain('dispatchClientUserProfileUpdated()')
    expect(profile).toContain('aria-label={avatarUploading ? "头像上传中" : "更换头像"}')
    expect(profile).toContain('保存资料')
  })

  it('syncs profile avatar to workspace and marketing headers', () => {
    const appChrome = readFileSync(path.join(process.cwd(), 'components/app-chrome.tsx'), 'utf8')
    const marketingHeader = readFileSync(path.join(process.cwd(), 'components/v2-chrome/MarketingHeader.tsx'), 'utf8')
    const profileUtil = readFileSync(path.join(process.cwd(), 'lib/client-user-profile.ts'), 'utf8')

    expect(profileUtil).toContain('USER_PROFILE_UPDATED_EVENT')
    expect(profileUtil).toContain('record.avatar_url')
    expect(profileUtil).toContain('record.photo')
    expect(profileUtil).toContain('metadata.avatar_url')
    expect(appChrome).toContain('readClientUserProfile')
    expect(appChrome).toContain('window.addEventListener(USER_PROFILE_UPDATED_EVENT, refresh)')
    expect(marketingHeader).toContain('readClientUserProfile')
    expect(marketingHeader).toContain('window.addEventListener(USER_PROFILE_UPDATED_EVENT, readStoredUser)')
    expect(marketingHeader).toContain('<AvatarV2')
    expect(marketingHeader).toContain('<AvatarV2Image src={activeUser.avatar}')
  })

  it('uses ChatGPT 5.5 display copy for the gpt-5 model', () => {
    const navigationModels = readFileSync(path.join(process.cwd(), 'lib/navigation-models.ts'), 'utf8')
    const modelPanel = readFileSync(path.join(process.cwd(), 'components/chat/ModelPanel.tsx'), 'utf8')
    const enhancedChat = readFileSync(path.join(process.cwd(), 'components/chat/enhanced-chat-interface.tsx'), 'utf8')

    expect(navigationModels).toContain('name: "ChatGPT 5.5"')
    expect(modelPanel).toContain('name: "ChatGPT 5.5"')
    expect(enhancedChat).toContain('name: "ChatGPT 5.5"')
  })
})
