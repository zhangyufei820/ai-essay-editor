import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("New API Codex workspace artifacts", () => {
  it("renders generated files inline instead of exposing download controls", () => {
    const app = read("services/shenxiang-codex-workspace/web/assets/app.js")
    const styles = read("services/shenxiang-codex-workspace/web/assets/styles.css")
    const index = read("services/shenxiang-codex-workspace/web/index.html")

    expect(app).toContain("renderArtifacts")
    expect(app).toContain("artifact-gallery")
    expect(app).toContain("<iframe")
    expect(app).not.toContain(" download ")
    expect(app).not.toContain('download target="_blank"')
    expect(app).not.toContain("生成后请立即下载")
    expect(styles).toContain(".artifact-gallery")
    expect(styles).toContain(".artifact-preview iframe")
    expect(index).toContain("20260618-artifacts-inline")
  })
})
