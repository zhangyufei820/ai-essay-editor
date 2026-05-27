import fs from "node:fs"

function parseEnvFile(path: string) {
  if (!fs.existsSync(path)) return {}

  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=")
        if (separator === -1) return [line, ""]
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

export function readE2eCredentials() {
  const fileEnv = parseEnvFile("/Users/aixingren/.shenxiang-secrets/shenxiang-e2e.env")
  return {
    phone: process.env.SHENXIANG_E2E_TEST_PHONE || fileEnv.SHENXIANG_E2E_TEST_PHONE || "19132896773",
    password: process.env.SHENXIANG_E2E_TEST_PASSWORD || fileEnv.SHENXIANG_E2E_TEST_PASSWORD || "",
  }
}
