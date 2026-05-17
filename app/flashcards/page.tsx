import type { Metadata } from "next"
import { FlashcardsPageV2 } from "@/components/flashcards/v2/FlashcardsPageV2"

export const metadata: Metadata = {
  title: "闪卡复习 | 沈翔智学",
  description: "间隔重复法帮你把知识点推到长期记忆。",
}

export default function FlashcardsPage() {
  return <FlashcardsPageV2 />
}
