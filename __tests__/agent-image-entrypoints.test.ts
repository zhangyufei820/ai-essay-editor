import { PLAZA_AGENTS } from "@/components/agents/agent-plaza-data"
import { AGENT_REGISTRY } from "@/components/chat/v2/agent-registry"

describe("image entrypoints", () => {
  it("keeps retired Banana out of the chat selector and agent plaza", () => {
    expect(PLAZA_AGENTS.some((agent) => agent.id === "banana-2-pro")).toBe(false)
    expect(AGENT_REGISTRY["banana-2-pro"]).toBeUndefined()
  })

  it("keeps GPT Image 2 clickable from the selector", () => {
    expect(PLAZA_AGENTS.find((agent) => agent.id === "gpt-image-2")).toMatchObject({
      href: "/chat/gpt-image-2",
      routeId: "/chat/gpt-image-2",
    })
    expect(AGENT_REGISTRY["gpt-image-2"]?.memberOnly).toBeUndefined()
  })
})
