import fs from "fs"
import path from "path"

const root = path.join(__dirname, "..")
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8")

describe("free trial monitor source contracts", () => {
  it("cron monitor route requires CRON_SECRET", () => {
    const source = read("app/api/cron/free-trial-monitor/route.ts")
    expect(source).toContain("CRON_SECRET")
    expect(source).toMatch(/status:\s*403/)
    expect(source).toContain("runFreeTrialMonitor")
  })

  it("admin monitor route requires admin verification", () => {
    const source = read("app/api/admin/free-trial-monitor/route.ts")
    expect(source).toContain("verifyAdminRequest")
    expect(source).toMatch(/status:\s*403/)
    expect(source).toContain("setRuntimeConfig")
  })

  it("monitor core only performs runtime flag stop-loss actions", () => {
    const source = read("lib/free-trial-monitor.ts")
    expect(source).toContain("disableFreeTrialConsumption")
    expect(source).toContain("disableFreeTrialCampaign")
    expect(source).toContain("checkRuntimeFlagsEndpoint")
    expect(source).toContain("runtime_flags_endpoint_unavailable")
    expect(source).not.toMatch(/from\("user_credits"\)\s*\.update/)
    expect(source).not.toMatch(/from\("orders"\)\s*\.update/)
    expect(source).not.toMatch(/from\("free_trial_grants"\)\s*\.delete/)
  })

  it("monitor script documents forbidden destructive operations by omission", () => {
    const source = read("scripts/monitor-free-trial.mjs")
    expect(source).toContain("free_trial_runtime_config")
    expect(source).toContain("monitor_incidents")
    expect(source).toContain("checkRuntimeFlagsEndpoint")
    expect(source).toContain("checkLocalMonitorFiles")
    expect(source).toContain("monitor_deployment_files_missing")
    expect(source).not.toMatch(/from\("user_credits"\)\s*\.update/)
    expect(source).not.toMatch(/from\("orders"\)\s*\.update/)
    expect(source).not.toMatch(/delete\(\)/)
  })
})
