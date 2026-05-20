import type { Metadata } from "next"
import { SunoPage } from "@/components/suno/SunoPage"

export const metadata: Metadata = {
  title: "智能音乐生成 | 沈翔智学",
  description: "输入歌词或创作提示，自动生成歌曲，完成后可直接试听和下载。",
}

export default function Page() {
  return <SunoPage />
}
