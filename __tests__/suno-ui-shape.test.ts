import { readFileSync } from "fs"
import path from "path"

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

describe("Suno UI shape", () => {
  it("keeps the user-facing music flow simple and Chinese", () => {
    const source = read("components/suno/SunoPage.tsx")

    for (const text of ["智能音乐生成", "歌词或提示词", "歌曲名", "歌曲风格", "只生成伴奏", "生成歌曲"]) {
      expect(source).toContain(text)
    }

    for (const hiddenWorkbenchText of ["高级调试", "Raw", "Timing", "Feed", "复制 task_id", "一键查询"]) {
      expect(source).not.toContain(hiddenWorkbenchText)
    }
  })

  it("auto-polls and renders playback, download, and waiting animation", () => {
    const source = read("components/suno/SunoPage.tsx")

    expect(source).toContain('operation: "fetch_task"')
    expect(source).toContain("setTimeout(() => pollTask")
    expect(source).toContain("WaveAnimation")
    expect(source).toContain("<audio")
    expect(source).toContain("试听")
    expect(source).toContain("下载歌曲")
    expect(source).toContain("你不用手动查询，系统会自动刷新结果。")
  })

  it("shows beginner help in a prominent expandable guide", () => {
    const pageSource = read("components/suno/SunoPage.tsx")
    const helpSource = read("components/suno/SunoHelp.tsx")

    expect(pageSource).toContain("<SunoHelp />")
    expect(helpSource).toContain("新手必看")
    expect(helpSource).toContain("智能音乐生成使用帮助")
    expect(helpSource).toContain("展开完整使用帮助文档")
    expect(helpSource).toContain("第一次怎么用")
    expect(helpSource).toContain("生成后怎么看结果")
  })

  it("sends verified auth headers when calling the server proxy", () => {
    const source = read("components/suno/SunoPage.tsx")

    expect(source).toContain('import { getVerifiedAuthHeaders } from "@/lib/client-auth"')
    expect(source).toContain("...(await getVerifiedAuthHeaders())")
  })
})
