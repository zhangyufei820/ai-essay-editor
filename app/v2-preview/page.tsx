/**
 * 🖌 v2 设计系统预览路径
 *
 * 路径：/v2-preview
 * 用途：让 reviewer 在不影响 / 老首页的前提下，直接看到 v2 整页效果。
 * 一旦 PR8 收尾、整体上线，本路由可以并入 / 主页或删除。
 */

import type { Metadata } from "next"
import { HomePageV2 } from "@/components/home/v2"

export const metadata: Metadata = {
  title: "v2 设计预览 — 沈翔智学",
  description: "墨砚设计系统 · 整页预览（不影响线上 / 主页）",
  robots: { index: false, follow: false },
}

export const dynamic = "force-static"
export const revalidate = 300

export default function V2PreviewPage() {
  return <HomePageV2 />
}
