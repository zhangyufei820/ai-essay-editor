import { redirect } from "next/navigation"
import { CELLFORGE_EXTERNAL_URL } from "@/lib/tripo3d"

export const metadata = {
  title: "3D 细胞工作台｜沈翔智学",
  description: "打开沈翔智学自建 3D 细胞模型工作台。",
}

export default function Tripo3DPage() {
  redirect(CELLFORGE_EXTERNAL_URL)
}
