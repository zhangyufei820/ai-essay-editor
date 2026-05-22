import type { Metadata } from "next"
import { VideoGenerationPage } from "@/components/video/VideoGenerationPage"

export const metadata: Metadata = {
  title: "AI视频生成 | 沈翔智学",
  description: "上传首帧图或输入分镜提示词，生成适合课程短片、知识卡片和作品展示的视频，完成后可在线播放和下载。",
}

export default function Page() {
  return <VideoGenerationPage />
}
