import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

describe("Authing login mount boundary", () => {
  it("keeps the third-party Guard mount empty and outside React-owned status UI", () => {
    const shell = read("components/auth/v2/LoginPageV2.tsx")
    const login = read("app/login/page.tsx")

    expect(shell).toContain('<div id="authing-guard-container" />')
    expect(shell).not.toContain('<div id="authing-guard-container">')
    expect(login).toContain("new MutationObserver")
    expect(login).toContain("let disposed = false")
    expect(login).toContain("if (disposed) return")
    expect(login).toContain("guard.start(guardMount).catch")
    expect(login).toContain("if (disposed || guardMount.childElementCount > 0) return")
    expect(login).toContain("setLoadError(null)")
    expect(login).toContain("observer.disconnect()")
    expect(login).toContain("guard?.unmount?.()")
    expect(login).toContain("if (guardRef.current === guard) guardRef.current = null")
    expect(login).toContain("link.remove()")
    expect(login).not.toContain("searchParams, isLoaded, referralCode")
  })
})
