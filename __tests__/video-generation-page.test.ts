import { readFileSync } from "fs"
import path from "path"

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

describe("video generation page", () => {
  it("ships a real RelayDance video workbench instead of a static placeholder", () => {
    const page = read("app/video/page.tsx")
    const source = read("components/video/VideoGenerationPage.tsx")
    const chromeRoutes = read("lib/app-chrome-routes.ts")
    const appChrome = read("components/app-chrome.tsx")

    expect(page).toContain("VideoGenerationPage")
    expect(chromeRoutes).toContain('"/video"')
    expect(appChrome).toContain("AI视频生成")
    expect(appChrome).toContain('href: "/video"')

    expect(source).toContain('fetch("/api/media/video/relaydance"')
    expect(source).toContain("/api/media/tasks/")
    expect(source).toContain('fetch("/api/dify-upload"')
    expect(source).toContain("getVerifiedAuthHeaders")
    expect(source).toContain("doubao-seedance-2-0-fast-260128")
    expect(source).toContain("doubao-seedance-2-0-720p")
    expect(source).toContain("doubao-seedance-2-0-1080p")
    expect(source).toContain("16:9")
    expect(source).toContain("9:16")
    expect(source).toContain("完成后可在线播放和下载")
    expect(source).toContain("让视频从这张画面开始")
    expect(source).toContain("生成完成后可以直接播放和下载")
    expect(source).toContain("发布到广场时，系统会保存成更适合长期展示的版本")
  })

  it("auto-polls status and renders video playback plus download", () => {
    const source = read("components/video/VideoGenerationPage.tsx")

    expect(source).toContain("nextPollDelay")
    expect(source).toContain("setTimeout(() => pollTask")
    expect(source).toContain("<video")
    expect(source).toContain("下载视频")
    expect(source).toContain("FilmGenerationLoader")
    expect(source).toContain("镜头生成中")
    expect(source).toContain("合成 MP4")
    expect(source).toContain("可下载")
    expect(source).toContain("sx-video-film-scan")
    expect(source).toContain("任务队列")
  })
})
