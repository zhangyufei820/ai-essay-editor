import { readFileSync } from "fs"
import path from "path"

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

describe("Suno Dify client configuration", () => {
  it("uses only the dedicated Suno workflow key, not the default Dify chat key", () => {
    const source = read("lib/suno-dify-client.ts")

    expect(source).toContain("const apiKey = process.env.SUNO_DIFY_API_KEY ||")
    expect(source).not.toContain("process.env.SUNO_DIFY_API_KEY || process.env.DIFY_API_KEY")
    expect(source).toContain('"SUNO_DIFY_API_KEY"')
  })
})
