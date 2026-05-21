import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("codex skill gateway intent routing", () => {
  it("recognizes common Chinese skill-list phrasings from the website", () => {
    const source = read("services/codex-skill-gateway/app/main.py")

    expect(source).toContain("列举你安装的技能")
    expect(source).toContain("你安装的技能")
    expect(source).toContain("可用技能列表")
    expect(source).toContain("当前已启用的 Codex 技能如下")
  })
})
