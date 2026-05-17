import type { Metadata } from "next"
import { DiagnosisPageV2 } from "@/components/worksheet-diagnosis/v2/DiagnosisPageV2"

export const metadata: Metadata = {
  title: "拍卷诊断错题 | 沈翔智学",
  description: "上传试卷图片，AI 归因错题并生成训练建议海报。",
}

export default function WorksheetDiagnosisPage() {
  return <DiagnosisPageV2 />
}
