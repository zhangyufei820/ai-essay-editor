import { GET as getProviders } from "@/app/api/providers/route"
import { CORE_AGENT_IDS, PLAZA_AGENTS } from "@/components/agents/agent-plaza-data"
import { AGENT_REGISTRY } from "@/components/chat/v2/agent-registry"
import { navigationModelItems } from "@/lib/navigation-models"

describe("retired website assistant", () => {
  it("keeps the deleted Dify app out of every active model catalog", async () => {
    expect(CORE_AGENT_IDS).not.toContain("general-chat")
    expect(PLAZA_AGENTS.some((agent) => agent.id === "general-chat")).toBe(false)
    expect(navigationModelItems.some((item) => item.key === "general-chat")).toBe(false)
    expect(AGENT_REGISTRY["general-chat"]).toBeUndefined()

    const response = await getProviders()
    const { providers } = await response.json()
    expect(providers.flatMap((provider: { capabilities: { id: string }[] }) => provider.capabilities)
      .some((capability: { id: string }) => capability.id === "general-chat")).toBe(false)
  })
})
