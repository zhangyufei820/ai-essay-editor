import { readFileSync } from "fs"
import path from "path"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("codex skill gateway intent routing", () => {
  it("recognizes common Chinese skill-list phrasings from the website", () => {
    const source = read("services/codex-skill-gateway/app/main.py")

    expect(source).toContain("列举你安装的技能")
    expect(source).toContain("你安装的技能")
    expect(source).toContain("可用技能列表")
    expect(source).toContain("当前已启用的 Codex 技能如下")
  })

  it("keeps public agent runs away from server and destructive operations", () => {
    const runner = read("services/codex-skill-gateway/app/codex_runner.py")
    const security = read("services/codex-skill-gateway/app/security.py")
    const compose = read("services/codex-skill-gateway/docker-compose.yml")

    expect(runner).not.toContain("--dangerously-bypass-approvals-and-sandbox")
    expect(runner).toContain("FORBIDDEN_RUNTIME_ACTION")
    expect(runner).toContain("_forbidden_runtime_scan_payload")
    expect(runner).toContain('request.get("user_query", "")')
    expect(security).toContain("require_admin_bearer")
    expect(security).toContain("contains_forbidden_runtime_action")
    expect(security).toContain("assert_safe_skill_file_path")
    expect(compose).toContain("./user-skills:/workspace/user-skills")
    expect(compose).not.toContain("docker_default:")
    expect(compose).not.toContain("docker_ssrf_proxy_network")
  })

  it("separates admin-only routes from public custom skill submissions", () => {
    const source = read("services/codex-skill-gateway/app/main.py")
    const envExample = read("services/codex-skill-gateway/.env.example")

    expect(source).toContain('@app.post("/skills/custom", dependencies=[Depends(require_bearer)])')
    expect(source).toContain('@app.post("/admin/skills/custom", dependencies=[Depends(require_admin_bearer)])')
    expect(source).toContain('@app.post("/admin/run", dependencies=[Depends(require_admin_bearer)])')
    expect(source).toContain('"pending_review"')
    expect(source).toContain("allow_admin_intent=True")
    expect(envExample).toContain("ADMIN_API_KEY=replace-with-separate-admin-token")
  })

  it("does not stream provider or raw backend errors to users", () => {
    const source = read("services/codex-skill-gateway/app/main.py")
    const security = read("services/codex-skill-gateway/app/security.py")

    expect(source).toContain("任务执行失败：智能服务暂时不可用，请稍后重试。")
    expect(source).toContain("图像服务暂时不可用，请稍后重试。")
    expect(`${source}\n${security}`).not.toMatch(/模型供应商返回|Provider chat request failed|Image provider request failed|Image provider is not configured|Gateway API key is not configured|safe_body/)
  })
})
