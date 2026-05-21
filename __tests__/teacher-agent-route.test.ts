import { resolveChatAgentParam, TEACHER_AGENT_MODEL } from "@/lib/teacher-agent-route"

describe("teacher agent chat routing", () => {
  it("keeps built-in agents on their built-in chat models", () => {
    expect(resolveChatAgentParam("standard")).toEqual({
      model: "standard",
      teacherAgentShareCode: null,
      workflowSkillId: null,
    })
    expect(resolveChatAgentParam("all-in-one-agent")).toEqual({
      model: "all-in-one-agent",
      teacherAgentShareCode: null,
      workflowSkillId: null,
    })
    expect(resolveChatAgentParam("super-all-in-one-agent")).toEqual({
      model: "super-all-in-one-agent",
      teacherAgentShareCode: null,
      workflowSkillId: null,
    })
  })

  it("routes plaza workflow skill cards through the shared chat app", () => {
    expect(resolveChatAgentParam("khazix-writer")).toEqual({
      model: "general-chat",
      teacherAgentShareCode: null,
      workflowSkillId: "khazix-writer",
    })
  })

  it("routes teacher-created share codes to the teacher agent chat mode", () => {
    expect(resolveChatAgentParam("a1b2c3d4")).toEqual({
      model: TEACHER_AGENT_MODEL,
      teacherAgentShareCode: "a1b2c3d4",
      workflowSkillId: null,
    })
  })

  it("ignores malformed agent params", () => {
    expect(resolveChatAgentParam("../../secret")).toEqual({
      model: null,
      teacherAgentShareCode: null,
      workflowSkillId: null,
    })
    expect(resolveChatAgentParam("teacher-agent")).toEqual({
      model: null,
      teacherAgentShareCode: null,
      workflowSkillId: null,
    })
  })
})
