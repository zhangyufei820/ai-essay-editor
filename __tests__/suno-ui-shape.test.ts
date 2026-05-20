import { readFileSync } from "fs"
import path from "path"

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

describe("Suno UI shape", () => {
  it("contains the required operation tabs and key fields", () => {
    const source = read("components/suno/SunoPage.tsx")

    for (const text of ["创作歌曲", "续写 / Cover", "上传音频二创", "歌词 / 拼接", "查询结果", "高级调试"]) {
      expect(source).toContain(text)
    }
    for (const field of ["gpt_description_prompt", "continue_clip_id", "audio_file", "raw_body_json", "s3_fields_json"]) {
      expect(source).toContain(field)
    }
  })

  it("shows task_id and one-click query behavior", () => {
    const source = read("components/suno/SunoPage.tsx")

    expect(source).toContain("复制 task_id")
    expect(source).toContain("一键查询")
    expect(source).toContain('setOperation(form, "fetch_task")')
  })
})
