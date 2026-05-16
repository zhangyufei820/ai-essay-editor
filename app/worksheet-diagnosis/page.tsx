import type { Metadata } from "next"
import { WorksheetDiagnosisApp } from "@/components/worksheet-diagnosis-app"

export const metadata: Metadata = {
  title: "错题诊断海报 | 沈翔智学",
  description: "上传试卷或作业图片，AI 自动识别错题、归因学习问题，并生成适合家长沟通的训练建议。",
  openGraph: {
    title: "沈翔智学 - 错题诊断海报",
    description: "拍卷子生成家长看得懂的学习反馈。",
    url: "https://shenxiang.school/worksheet-diagnosis",
  },
  alternates: {
    canonical: "https://shenxiang.school/worksheet-diagnosis",
  },
}

export default function WorksheetDiagnosisPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-white to-muted/20 px-4 py-6 md:py-10">
      <WorksheetDiagnosisApp />
    </main>
  )
}
