import { existsSync, readFileSync } from "fs"
import path from "path"

const root = process.cwd()

const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("AI reply UI quarantine", () => {
  it("keeps the assistant reply avatar as the only active custom reply-side SVG", () => {
    const source = read("components/chat/enhanced-chat-interface.tsx")

    expect(source).toContain('import { AssistantEyeAvatar } from "./AssistantEyeAvatar"')
    expect(source).toContain("<AssistantEyeAvatar")
    expect(source).not.toMatch(/import\s+\{?\s*EmpathicEyeLoader/)
    expect(source).not.toContain("<EmpathicEyeLoader")
    expect(source).not.toMatch(/import\s+\{?\s*WorkflowVisualizer/)
    expect(source).not.toContain("<WorkflowVisualizer")
    expect(source).not.toMatch(/import\s+\{?\s*ThoughtDrawer/)
    expect(source).not.toContain("<ThoughtDrawer")
  })

  it("stores old reply dynamics as non-compilable quarantined files", () => {
    const quarantineDir = path.join(root, "components/chat/_quarantine/ai-reply-dynamics")
    const quarantinedFiles = [
      "EmpathicEyeLoader.tsx.quarantined",
      "ThoughtDrawer.tsx.quarantined",
      "WorkflowVisualizer.tsx.quarantined",
      "WorkflowVisualizer.backup.tsx.quarantined",
    ]

    expect(existsSync(path.join(quarantineDir, "README.md"))).toBe(true)
    for (const file of quarantinedFiles) {
      expect(existsSync(path.join(quarantineDir, file))).toBe(true)
    }
  })

  it("does not leave active versions of the old reply dynamics in components/chat", () => {
    const activeFiles = [
      "components/chat/EmpathicEyeLoader.tsx",
      "components/chat/ThoughtDrawer.tsx",
      "components/chat/WorkflowVisualizer.tsx",
      "components/chat/WorkflowVisualizer.backup.tsx",
    ]

    for (const file of activeFiles) {
      expect(existsSync(path.join(root, file))).toBe(false)
    }
  })
})
