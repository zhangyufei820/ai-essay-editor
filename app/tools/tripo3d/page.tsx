import { redirect } from "next/navigation"
import { TRIPO3D_EXTERNAL_URL } from "@/lib/tripo3d"

export const metadata = {
  title: "Tripo3D｜沈翔智学",
  description: "打开 Tripo3D 模型生成工作台。",
}

export default function Tripo3DPage() {
  redirect(TRIPO3D_EXTERNAL_URL)
}
