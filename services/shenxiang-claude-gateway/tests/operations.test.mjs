import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("smoke test does not place the API key in process arguments", () => {
  const script = fs.readFileSync(path.join(serviceRoot, "scripts/smoke_test.sh"), "utf8")

  assert.doesNotMatch(script, /TOKEN="\$\{1:-\}"/)
  assert.doesNotMatch(script, /Authorization: Bearer \$\{TOKEN\}/)
  assert.match(script, /-H "@\$\{AUTH_HEADER_FILE\}"/)
})

test("nginx entry points align with the application request limit", () => {
  for (const filename of ["claude-path.conf", "claude.aiphui.top.conf"]) {
    const config = fs.readFileSync(path.join(serviceRoot, "nginx", filename), "utf8")
    assert.match(config, /client_max_body_size 32m;/)
  }
})
