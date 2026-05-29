import { PLAZA_AGENTS } from "@/components/agents/agent-plaza-data"
import { AGENT_REGISTRY } from "@/components/chat/v2/agent-registry"
import { navigationModelItems } from "@/lib/navigation-models"

const RETIRED_WRITING_AGENT_IDS = [
  "reading-report",
  "study-abroad",
  "resume-optimize",
  "speech-defense",
  "school-wechat",
] as const

describe("retired writing entrypoints", () => {
  it("removes retired writing pages from agent plaza and chat selector sources", () => {
    for (const id of RETIRED_WRITING_AGENT_IDS) {
      expect(PLAZA_AGENTS.some((agent) => agent.id === id)).toBe(false)
      expect(AGENT_REGISTRY[id]).toBeUndefined()
      expect(navigationModelItems.some((item) => item.key === id)).toBe(false)
    }
  })
})
