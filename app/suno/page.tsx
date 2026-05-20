import type { Metadata } from "next"
import { SunoPage } from "@/components/suno/SunoPage"

export const metadata: Metadata = {
  title: "Suno 音乐生成 | 沈翔智学",
  description: "通过 Dify 工作流调用服务器 Suno 网关生成音乐、续写、上传二创、歌词和任务查询。",
}

export default function Page() {
  return <SunoPage />
}
