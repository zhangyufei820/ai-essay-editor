import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("super all-in-one PPT skills", () => {
  it("shows PPT skills in the main-site Codex skill picker", () => {
    const skills = read("lib/codex-skills.ts")

    expect(skills).toContain('"PPT 与演示"')
    expect(skills).toContain('id: "ppt-master-cn"')
    expect(skills).toContain('name: "PPT 生成大师"')
    expect(skills).toContain('id: "image-to-editable-ppt-cn"')
    expect(skills).toContain('name: "图片转可编辑 PPT"')
  })
})
