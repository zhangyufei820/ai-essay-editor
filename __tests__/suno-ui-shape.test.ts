import { readFileSync } from "fs"
import path from "path"

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

describe("Suno UI shape", () => {
  it("keeps the user-facing music flow simple and Chinese", () => {
    const source = read("components/suno/SunoPage.tsx")

    for (const text of ["suno音乐创作", "歌词或创作提示", "歌曲名", "歌曲风格", "不想要的风格", "模型版本", "生成类型", "人声倾向", "完成通知地址", "只生成伴奏", "生成歌曲"]) {
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
    expect(helpSource).toContain("suno音乐创作使用帮助")
    expect(helpSource).toContain("展开完整使用帮助文档")
    expect(helpSource).toContain("第一次怎么用")
    expect(helpSource).toContain("生成后怎么看结果")
  })

  it("sends verified auth headers when calling the server proxy", () => {
    const source = read("components/suno/SunoPage.tsx")

    expect(source).toContain('import { getVerifiedAuthHeaders } from "@/lib/client-auth"')
    expect(source).toContain("...(await getVerifiedAuthHeaders())")
  })

  it("does not show raw object errors to users", () => {
    const source = read("components/suno/SunoPage.tsx")

    expect(source).toContain("function extractErrorMessage")
    expect(source).toContain("function toFriendlyErrorMessage")
    expect(source).toContain("音乐生成服务暂时繁忙，请稍后再试。")
    expect(source).toContain("没有找到这次歌曲任务，请重新提交生成。")
    expect(source).toContain("生成失败，请稍后再试或联系客服。")
    expect(source).not.toContain('setError(toText(next.error)')
  })

  it("passes the visible Chinese form fields to Dify workflow inputs", () => {
    const source = read("components/suno/SunoPage.tsx")

    expect(source).toContain("operation: form.operation")
    expect(source).toContain("gpt_description_prompt: isInspiration ? form.prompt :")
    expect(source).toContain("negative_tags: form.negativeTags")
    expect(source).toContain("mv: form.mv")
    expect(source).toContain("generation_type: form.generationType")
    expect(source).toContain("vocal_gender: form.vocalGender")
    expect(source).toContain("notify_hook: form.notifyHook")
    expect(source).toContain('form.operation === "generate_instrumental"')
  })
})
