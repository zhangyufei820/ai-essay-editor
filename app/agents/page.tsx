import type { Metadata } from "next"
import { AgentPlazaPage } from "@/components/agents/AgentPlazaPage"

export const metadata: Metadata = {
  title: "智能体广场 | 沈翔智学",
  description: "浏览沈翔智学全部 AI 智能体，按作文批改、学科辅导、教学备课、创作工具等场景快速开始。",
}

export default function AgentsPage() {
  return <AgentPlazaPage />
}
