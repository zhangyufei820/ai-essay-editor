import type { Metadata } from "next"
import { HomePageV2 } from "@/components/home/v2"

export const dynamic = "force-static"
export const revalidate = 300

export const metadata: Metadata = {
  title: "沈翔智学｜AI作文批改 · 写作提分工具",
  description: "上传作文，AI逐段批改、指出问题、给出提分建议，帮助小学、初中、高中学生提升写作能力。",
}

export default function Home() {
  return <HomePageV2 />
}
