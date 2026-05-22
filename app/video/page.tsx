import type { Metadata } from "next"
import { VideoGenerationPage } from "@/components/video/VideoGenerationPage"

export const metadata: Metadata = {
  title: "AI视频生成 | 沈翔智学",
  description: "上传首帧图或输入分镜提示词，通过视频生成网关提交 Seedance 视频任务，完成后可在线播放和下载。",
}

export default function Page() {
  return <VideoGenerationPage />
}
