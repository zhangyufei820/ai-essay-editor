"use client"

import * as React from "react"

export type IconVariantId =
  | "halo-device"
  | "paper-radar"
  | "glass-orbit"
  | "seal-score"
  | "pixel-lab"
  | "editor-console"
  | "smart-stamp"
  | "quiet-premium"

export const ICON_STYLE_VARIANTS: Array<{
  id: IconVariantId
  name: string
  temperament: string
  note: string
}> = [
  {
    id: "halo-device",
    name: "A. 智能评分舱",
    temperament: "大厂产品感 / 轻 3D",
    note: "像一个专门批改作文的智能设备，功能感强，适合首页核心入口。",
  },
  {
    id: "paper-radar",
    name: "B. 文稿雷达",
    temperament: "AI 检测 / 专业可信",
    note: "把批改理解成扫描、定位和诊断，适合强调专业分析。",
  },
  {
    id: "glass-orbit",
    name: "C. 玻璃轨道",
    temperament: "未来感 / 轻盈",
    note: "批注围绕文稿流动，偏新潮，适合 AI 智能体广场。",
  },
  {
    id: "seal-score",
    name: "D. 分数印章",
    temperament: "教育认证 / 稳重",
    note: "像老师盖章但更智能，适合作文批改和报告导出。",
  },
  {
    id: "pixel-lab",
    name: "E. 晶格实验室",
    temperament: "科技实验 / 年轻",
    note: "文稿被拆成智能像素块，比较新奇，适合创意型入口。",
  },
  {
    id: "editor-console",
    name: "F. 批注控制台",
    temperament: "工具型 / 专业 SaaS",
    note: "像高级编辑器里的批注面板，适合工作区和侧边栏。",
  },
  {
    id: "smart-stamp",
    name: "G. 智慧朱印",
    temperament: "东方教育 / 品牌化",
    note: "把中文作文和批阅文化融合进现代智能图标，辨识度最高。",
  },
  {
    id: "quiet-premium",
    name: "H. 高级极简",
    temperament: "克制 / 高端",
    note: "少元素、强形状，适合会员页和高级功能入口。",
  },
]

export function EssayCorrectionVariantIcon({
  variant,
  size = 104,
  className,
}: {
  variant: IconVariantId
  size?: number
  className?: string
}) {
  const id = React.useId().replace(/:/g, "")

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      role="img"
      aria-label={`作文批改图标方案 ${variant}`}
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-brand`} x1="20" y1="18" x2="96" y2="98" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14532D" />
          <stop offset="0.45" stopColor="#10B981" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id={`${id}-blue`} x1="18" y1="16" x2="102" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="0.5" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="22" y1="18" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF7CC" />
          <stop offset="0.48" stopColor="#FBBF24" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x1="24" y1="16" x2="84" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#ECFDF5" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(60 60) rotate(90) scale(54)">
          <stop stopColor="#67E8F9" stopOpacity="0.4" />
          <stop offset="1" stopColor="#10B981" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#14532D" floodOpacity="0.16" />
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0284C7" floodOpacity="0.16" />
        </filter>
      </defs>
      {renderVariant(variant, id)}
    </svg>
  )
}

function renderVariant(variant: IconVariantId, id: string) {
  const brand = `url(#${id}-brand)`
  const blue = `url(#${id}-blue)`
  const gold = `url(#${id}-gold)`
  const paper = `url(#${id}-paper)`
  const glow = `url(#${id}-glow)`
  const shadow = `url(#${id}-shadow)`

  switch (variant) {
    case "halo-device":
      return (
        <g filter={shadow}>
          <ellipse cx="60" cy="95" rx="31" ry="7" fill="#0F766E" opacity="0.12" />
          <path d="M34 34 60 20l26 14v30L60 79 34 64V34Z" fill="#F8FFFC" stroke={brand} strokeWidth="3" />
          <path d="M43 42h34v22H43V42Z" fill="#FFFFFF" stroke={blue} strokeWidth="2.8" />
          <path d="M50 51h13M50 59h20" stroke="#B7CBEA" strokeWidth="3" strokeLinecap="round" />
          <path d="M60 20v17M34 34l26 15 26-15" stroke="#FFFFFF" strokeWidth="2" opacity="0.7" />
          <circle cx="82" cy="73" r="14" fill={blue} />
          <path d="m75.8 73.5 4.3 4.3 8.4-9.4" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31 42h-8M28 31l-6-5M89 42h8M92 31l6-5" stroke="#38BDF8" strokeWidth="4" strokeLinecap="round" />
        </g>
      )
    case "paper-radar":
      return (
        <g filter={shadow}>
          <circle cx="60" cy="58" r="43" fill={glow} />
          <path d="M35 24h36l14 14v57H35V24Z" fill={paper} stroke={brand} strokeWidth="3" />
          <path d="M71 25v14h14" stroke={brand} strokeWidth="3" strokeLinejoin="round" />
          <path d="M45 46h25M45 57h18M45 68h28" stroke="#B7CBEA" strokeWidth="3.6" strokeLinecap="round" />
          <circle cx="59" cy="61" r="26" stroke={blue} strokeWidth="3" strokeDasharray="7 7" />
          <path d="M59 61 78 46" stroke={blue} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="78" cy="46" r="5" fill="#22D3EE" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M29 72c7 11 17 17 30 17" stroke="#10B981" strokeWidth="4" strokeLinecap="round" />
        </g>
      )
    case "glass-orbit":
      return (
        <g filter={shadow}>
          <path d="M28 31c0-7 5-12 12-12h40c7 0 12 5 12 12v58H28V31Z" fill="#FFFFFF" fillOpacity="0.76" stroke={blue} strokeWidth="3" />
          <path d="M43 42h31M43 54h21M43 66h28" stroke="#AFC4E7" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M32 81c16 16 43 15 57-2" stroke={brand} strokeWidth="4" strokeLinecap="round" />
          <path d="M86 75c.8 6 2.8 8.2 8.5 9.8-5.7 1.5-7.7 3.7-8.5 9.7-1-6-3-8.2-8.8-9.7 5.8-1.6 7.8-3.8 8.8-9.8Z" fill={blue} />
          <circle cx="34" cy="80" r="7" fill="#2DD4BF" stroke="#FFFFFF" strokeWidth="3" />
          <path d="M78 20c1.2 4.8 3 6.5 7.5 7.5-4.5 1.2-6.3 3-7.5 7.8-1.2-4.8-3-6.6-7.8-7.8 4.8-1 6.6-2.7 7.8-7.5Z" fill="#38BDF8" />
        </g>
      )
    case "seal-score":
      return (
        <g filter={shadow}>
          <path d="M36 23h35l13 13v49H36V23Z" fill={paper} stroke="#BEE7D5" strokeWidth="3" />
          <path d="M71 24v13h13" stroke="#BEE7D5" strokeWidth="3" strokeLinejoin="round" />
          <path d="M45 46h23M45 57h16M45 68h27" stroke="#CBD5E1" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="67" cy="72" r="21" fill={gold} stroke="#FFFFFF" strokeWidth="4" />
          <path d="M58 73.5 64 79l13-15" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31 78 48 95M32 94l16-16" stroke="#10B981" strokeWidth="4" strokeLinecap="round" />
          <rect x="28" y="73" width="23" height="23" rx="7" fill="#ECFDF5" stroke={brand} strokeWidth="3" />
        </g>
      )
    case "pixel-lab":
      return (
        <g filter={shadow}>
          <rect x="25" y="23" width="70" height="70" rx="18" fill="#F8FFFC" stroke={blue} strokeWidth="3" />
          <rect x="38" y="36" width="13" height="13" rx="4" fill="#2DD4BF" />
          <rect x="55" y="36" width="13" height="13" rx="4" fill="#38BDF8" />
          <rect x="72" y="36" width="9" height="13" rx="4" fill="#A78BFA" />
          <rect x="38" y="55" width="26" height="7" rx="3.5" fill="#B7CBEA" />
          <rect x="38" y="68" width="19" height="7" rx="3.5" fill="#B7CBEA" />
          <path d="M65 74 74 83 91 63" stroke={brand} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 45h8M90 24v8M82 24h8M29 89h8" stroke="#22D3EE" strokeWidth="4" strokeLinecap="round" />
        </g>
      )
    case "editor-console":
      return (
        <g filter={shadow}>
          <rect x="24" y="25" width="72" height="60" rx="14" fill="#0B2318" />
          <rect x="31" y="34" width="39" height="42" rx="7" fill="#FFFFFF" />
          <path d="M39 46h20M39 56h16M39 66h21" stroke="#B7CBEA" strokeWidth="3" strokeLinecap="round" />
          <rect x="75" y="36" width="12" height="33" rx="6" fill={blue} />
          <path d="M80.5 42v15" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
          <circle cx="81" cy="74" r="10" fill="#ECFDF5" stroke="#2DD4BF" strokeWidth="3" />
          <path d="m76.5 74 3.2 3.2 6.2-7" stroke="#10B981" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31 34h39" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case "smart-stamp":
      return (
        <g filter={shadow}>
          <path d="M60 19 88 35v32L60 83 32 67V35l28-16Z" fill="#FFFDF7" stroke={brand} strokeWidth="3" />
          <path d="M42 42h36M42 78h36M42 42v36M78 42v36" stroke="#FB7185" strokeWidth="3" strokeLinecap="round" />
          <path d="M50 51h20M50 60h13" stroke={brand} strokeWidth="4" strokeLinecap="round" />
          <path d="m47 71 6 6 18-22" stroke="#FB7185" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 19v13M32 35l28 16 28-16" stroke="#10B981" strokeWidth="2.4" opacity="0.58" />
          <circle cx="86" cy="29" r="5" fill="#FBBF24" />
        </g>
      )
    case "quiet-premium":
      return (
        <g filter={shadow}>
          <rect x="28" y="22" width="64" height="72" rx="20" fill="#FFFFFF" stroke="#D8EFE5" strokeWidth="3" />
          <path d="M43 43h34M43 55h22M43 67h27" stroke="#B7CBEA" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="75" cy="75" r="13" fill={brand} />
          <path d="m69 75.5 4.2 4.1 8-9.2" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    default:
      return null
  }
}
