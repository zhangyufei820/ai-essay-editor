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
    expect(source).toContain("临时视频链接约 30 分钟有效")
    expect(source).toContain("尾帧会保留但当前上游文档不保证生效")
    expect(source).toContain("分享到广场后，再把视频持久化到 COS")
  })

  it("auto-polls status and renders video playback plus download", () => {
    const source = read("components/video/VideoGenerationPage.tsx")

    expect(source).toContain("nextPollDelay")
    expect(source).toContain("setTimeout(() => pollTask")
    expect(source).toContain("<video")
    expect(source).toContain("下载视频")
    expect(source).toContain("你不用手动查询，系统会自动刷新结果。")
    expect(source).toContain("任务队列")
  })
})
