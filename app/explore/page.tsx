import type { Metadata } from "next"
import { ExplorePageV2 } from "@/components/explore/v2/ExplorePageV2"

export const metadata: Metadata = {
  title: "创作广场 | 沈翔智学",
  description: "发现大家用 AI 创作的作文批改、闪卡、图像和智能体对话。",
}

export default function ExplorePage() {
  return <ExplorePageV2 />
}
