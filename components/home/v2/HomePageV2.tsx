/**
 * 🖌 v2 首页整页装配
 *
 * 这是新首页的"完整版面"，按 AIDA 漏斗排列：
 *   Hero (Attention) → Stats (Trust) → Capabilities (Interest)
 *   → Process (Desire) → Testimonials (Validation) → CTA (Action)
 *
 * 通过 MarketingShell 提供顶栏 + 页脚。
 */

import * as React from "react"
import { MarketingShell } from "@/components/v2-chrome"
import { HeroV2 } from "./HeroV2"
import { StatsSealsV2 } from "./StatsSealsV2"
import { CapabilitiesV2 } from "./CapabilitiesV2"
import { ProcessV2 } from "./ProcessV2"
import { TestimonialsV2 } from "./TestimonialsV2"
import { FinalCTAV2 } from "./FinalCTAV2"

export function HomePageV2() {
  return (
    <MarketingShell>
      <HeroV2 />
      <StatsSealsV2 />
      <CapabilitiesV2 />
      <ProcessV2 />
      <TestimonialsV2 />
      <FinalCTAV2 />
    </MarketingShell>
  )
}
