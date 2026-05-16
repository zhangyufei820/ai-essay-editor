import fs from "fs"
import path from "path"

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

describe("invite membership sharing guard", () => {
  it("checks membership with verified auth headers instead of guessing alternate identifiers", () => {
    const source = read("app/invite/page.tsx")

    expect(source).toContain("getVerifiedAuthHeaders")
    expect(source).toContain("headers: await getVerifiedAuthHeaders(parsedUser)")
    expect(source).toContain("fetch('/api/user/membership'")
    expect(source).not.toContain("possibleUserIds")
    expect(source).not.toContain("parsedUser.phone")
    expect(source).not.toContain("parsedUser.email")
  })
})
