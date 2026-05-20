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
})
