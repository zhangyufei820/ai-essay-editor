import fs from "fs"
import path from "path"

const root = path.join(__dirname, "..")
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8")

describe("ClientBoot pointer events recovery", () => {
  it("clears stale body pointer lock only when no dialog is open", () => {
    const source = read("components/client-boot.tsx")

    expect(source).toContain("DialogPointerEventsRecovery")
    expect(source).toContain('document.body.style.pointerEvents === "none"')
    expect(source).toContain('document.body.style.pointerEvents = ""')
    expect(source).toContain('[data-slot="dialog-v2-content"][data-state="open"]')
    expect(source).toContain('[role="dialog"][data-state="open"]')
  })
})
