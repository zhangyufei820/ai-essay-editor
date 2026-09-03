import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const scriptPath = path.join(root, "scripts/dify-repair-openclaw-endpoint.mjs")

describe("Dify OpenClaw endpoint repair script", () => {
  it("is audit-only by default and requires an explicit apply flag", () => {
    const source = fs.readFileSync(scriptPath, "utf8")
    const help = execFileSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" })

    expect(source).toContain("apply: false")
    expect(source).toContain('arg === "--apply"')
    expect(help).toContain("Audits the Dify OpenClaw model endpoint by default")
    expect(help).toContain("--apply")
  })

  it("moves the legacy host-gateway endpoint to shared-network DNS", () => {
    const source = fs.readFileSync(scriptPath, "utf8")

    expect(source).toContain('DEFAULT_EXPECTED_CURRENT_URL = "http://172.17.0.1:18789/v1"')
    expect(source).toContain('DEFAULT_TARGET_URL = "http://1Panel-openclaw-z5b8:18789/v1"')
    expect(source).toContain("current_endpoint not in {expected_endpoint, target_endpoint}")
    expect(source).toContain("ProviderCredentialsCache")
    expect(source).toContain('target_probe": "ok"')
  })

  it("never embeds an OpenClaw credential value", () => {
    const source = fs.readFileSync(scriptPath, "utf8")

    expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/)
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/)
    expect(source).toContain('"Authorization": "Bearer " + api_key')
  })
})
