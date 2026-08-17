import fs from "node:fs"
import path from "node:path"

describe("standalone Docker public assets", () => {
  it("copies public assets into the standalone server root", () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8")

    expect(dockerfile).toContain(
      "COPY --from=builder /app/public ./.next/standalone/public",
    )
    expect(dockerfile).not.toContain(
      "ln -s /app/public /app/.next/standalone/public",
    )
  })
})
