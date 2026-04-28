"use client"

import * as React from "react"

export type ShenxiangIconName =
  | "essay-correction"
  | "ai-writing"
  | "image-generation"
  | "music-generation"
  | "credits"
  | "membership"
  | "history"
  | "upload-file"
  | "voice-input"
  | "role-family"
  | "teaching-pro"
  | "math-agent"
  | "english-agent"
  | "lesson-planning"
  | "class-advisor"
  | "paper-writing"
  | "reading-report"
  | "experiment-report"
  | "study-abroad"
  | "resume-optimize"
  | "speech-defense"
  | "school-wechat"
  | "share"
  | "download"
  | "success"
  | "warning"
  | "processing"

export type ShenxiangFeatureIconProps = {
  name: ShenxiangIconName
  size?: number
  className?: string
  title?: string
}

const iconMeta: Record<ShenxiangIconName, { label: string; tone: "core" | "aqua" | "gold" | "violet" | "coral" }> = {
  "essay-correction": { label: "作文批改", tone: "core" },
  "ai-writing": { label: "AI 写作", tone: "aqua" },
  "image-generation": { label: "图片生成", tone: "violet" },
  "music-generation": { label: "音乐生成", tone: "aqua" },
  credits: { label: "积分", tone: "gold" },
  membership: { label: "会员", tone: "gold" },
  history: { label: "历史记录", tone: "aqua" },
  "upload-file": { label: "上传文件", tone: "core" },
  "voice-input": { label: "语音输入", tone: "aqua" },
  "role-family": { label: "教师/家长/学生", tone: "core" },
  "teaching-pro": { label: "教学评 Pro", tone: "core" },
  "math-agent": { label: "数学智能体", tone: "violet" },
  "english-agent": { label: "英语智能体", tone: "aqua" },
  "lesson-planning": { label: "备课助手", tone: "core" },
  "class-advisor": { label: "班主任助手", tone: "coral" },
  "paper-writing": { label: "论文写作", tone: "core" },
  "reading-report": { label: "读书报告", tone: "aqua" },
  "experiment-report": { label: "实验报告", tone: "violet" },
  "study-abroad": { label: "留学文书", tone: "gold" },
  "resume-optimize": { label: "简历优化", tone: "core" },
  "speech-defense": { label: "演讲答辩", tone: "coral" },
  "school-wechat": { label: "公众号写作", tone: "aqua" },
  share: { label: "分享", tone: "core" },
  download: { label: "下载", tone: "aqua" },
  success: { label: "成功", tone: "core" },
  warning: { label: "警告", tone: "coral" },
  processing: { label: "处理中", tone: "violet" },
}

const toneStops = {
  core: ["#0F766E", "#10B981", "#60A5FA"],
  aqua: ["#0891B2", "#22D3EE", "#2DD4BF"],
  gold: ["#D97706", "#FBBF24", "#34D399"],
  violet: ["#2563EB", "#8B5CF6", "#22D3EE"],
  coral: ["#0F766E", "#FB7185", "#F59E0B"],
} as const

export function ShenxiangFeatureIcon({ name, size = 64, className, title }: ShenxiangFeatureIconProps) {
  const reactId = React.useId().replace(/:/g, "")
  const meta = iconMeta[name]
  const stops = toneStops[meta.tone]
  const ids = {
    main: `sx-${name}-${reactId}-main`,
    soft: `sx-${name}-${reactId}-soft`,
    gold: `sx-${name}-${reactId}-gold`,
    clip: `sx-${name}-${reactId}-clip`,
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      role="img"
      aria-label={title || meta.label}
      className={className}
    >
      <title>{title || meta.label}</title>
      <defs>
        <linearGradient id={ids.main} x1="18" y1="12" x2="80" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops[0]} />
          <stop offset="0.52" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
        <linearGradient id={ids.soft} x1="20" y1="14" x2="76" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.62" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#ECFDF5" />
        </linearGradient>
        <linearGradient id={ids.gold} x1="20" y1="16" x2="76" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF7CC" />
          <stop offset="0.48" stopColor="#FBBF24" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
        <filter id={`${ids.main}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#14532D" floodOpacity="0.13" />
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0284C7" floodOpacity="0.12" />
        </filter>
      </defs>
      <IconShell ids={ids} tone={meta.tone} />
      {renderGlyph(name, ids)}
    </svg>
  )
}

export function getShenxiangIconLabel(name: ShenxiangIconName) {
  return iconMeta[name].label
}

function IconShell({ ids, tone }: { ids: Record<"main" | "soft" | "gold" | "clip", string>; tone: string }) {
  return (
    <g filter={`url(#${ids.main}-shadow)`}>
      <rect x="17" y="14" width="62" height="68" rx="20" fill={`url(#${ids.soft})`} />
      <rect x="17" y="14" width="62" height="68" rx="20" stroke="#D8EFE5" strokeWidth="2.8" />
    </g>
  )
}

function renderGlyph(name: ShenxiangIconName, ids: Record<"main" | "soft" | "gold" | "clip", string>) {
  const main = `url(#${ids.main})`
  const soft = `url(#${ids.soft})`
  const gold = `url(#${ids.gold})`
  const commonStroke = { stroke: main, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

  switch (name) {
    case "essay-correction":
      return (
        <g>
          <path d="M32 30h26l10 10v24H32V30Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M58 31v10h10" stroke={main} strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M39 45h18M39 55h11M39 64h17" stroke="#B6D3F7" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M56 61c7-7 9.5-9.7 12.4-6.8 2.8 2.9.2 5.4-6.9 12.4l-8.6 2.2 3.1-7.8Z" fill={main} />
          <circle cx="31" cy="67" r="9.5" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="m26.8 67.1 3.1 3.2 6-6.7" stroke="#10B981" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    case "ai-writing":
      return (
        <g>
          <path d="M31 31h29l8 8v28H31V31Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M60 32v8h8" stroke={main} strokeWidth="3.5" strokeLinejoin="round" />
          <rect x="37" y="40" width="22" height="16" rx="5" fill={main} />
          <path d="M43 51.5 47 44l4 7.5M44.2 49.2h5.5M55 44v7.6" stroke="#fff" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M39 63h20M39 70h13" stroke="#B6D3F7" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M74 30v8M70 34h8M76.5 47v6M73.5 50h6" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case "image-generation":
      return (
        <g>
          <rect x="27" y="33" width="42" height="31" rx="7" fill="#fff" stroke={main} strokeWidth="3.8" />
          <path d="M32 61 43 49l9 9 8-11 9 14" fill={main} opacity="0.82" />
          <circle cx="38.5" cy="42.5" r="4.8" fill="#22D3EE" />
          <circle cx="69" cy="64" r="10" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M69 58.5c1.2 4.2 2.4 5.4 6.2 6.4-3.8.9-5 2.1-6.2 6.1-1.1-4-2.4-5.2-6.1-6.1 3.7-1 5-2.2 6.1-6.4Z" fill={main} />
        </g>
      )
    case "music-generation":
      return (
        <g>
          <path d="M39 61V33l26-6v27" {...commonStroke} />
          <ellipse cx="34" cy="64" rx="9" ry="7" fill={main} />
          <ellipse cx="61" cy="57" rx="9" ry="7" fill={main} />
          <path d="M39 39 65 33" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          <path d="M24 50v11M18 55v5M73 43v14M80 50v7" stroke="#22D3EE" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      )
    case "credits":
      return (
        <g>
          <circle cx="47" cy="49" r="21" fill={gold} stroke="#F59E0B" strokeWidth="3.4" />
          <path d="m47 35.5 4.4 8.1 9.1 1.6-6.4 6.6 1.3 9.2-8.4-4-8.3 4 1.3-9.2-6.5-6.6 9.2-1.6L47 35.5Z" fill="#FFF7CC" stroke="#fff" strokeWidth="1.8" />
          <circle cx="68" cy="65" r="9" fill="#22D3EE" stroke="#fff" strokeWidth="3" />
          <path d="M68 60v10M63 65h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case "membership":
      return (
        <g>
          <path d="M48 25 70 35v15c0 14-9.5 24-22 29-12.5-5-22-15-22-29V35l22-10Z" fill={main} opacity="0.92" />
          <path d="M38 52 43 40l6 9 7-12 5 15H38Z" fill="#fff" opacity="0.95" />
          <path d="M38 61h22" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M30 39c5-2.4 11.3-4.3 18-7 6.7 2.7 13 4.6 18 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
        </g>
      )
    case "history":
      return (
        <g>
          <path d="M68 47c0 12-9.7 21.8-21.7 21.8S24.5 59 24.5 47 34.3 25.3 46.3 25.3c7.6 0 14.3 3.9 18.2 9.9" stroke={main} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M65 26.5v9.8h-9.8" stroke={main} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M47 37v12l9 6" stroke="#2563EB" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M28 47h4M61 47h4M47 28v4M47 62v4" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case "upload-file":
      return (
        <g>
          <path d="M33 29h27l9 9v31H33V29Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M60 30v9h9" stroke={main} strokeWidth="3.5" strokeLinejoin="round" />
          <circle cx="48" cy="55" r="13" fill={main} />
          <path d="M48 63V47M41.5 53.5 48 47l6.5 6.5" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    case "voice-input":
      return (
        <g>
          <rect x="39" y="25" width="18" height="34" rx="9" fill={main} />
          <path d="M31 48c0 10 7.5 18 17 18s17-8 17-18M48 66v10M38 76h20" {...commonStroke} />
          <path d="M24 44v12M72 44v12M18 49v6M78 49v6" stroke="#22D3EE" strokeWidth="3.2" strokeLinecap="round" />
        </g>
      )
    case "role-family":
      return (
        <g>
          <circle cx="48" cy="32" r="9" fill={main} />
          <path d="M34 61c1.8-10 8-15 14-15s12.2 5 14 15" fill={soft} stroke={main} strokeWidth="3.3" />
          <circle cx="28" cy="43" r="7" fill="#22D3EE" />
          <circle cx="68" cy="43" r="7" fill="#60A5FA" />
          <path d="M17 66c1.3-8 6-12 11-12s9.7 4 11 12M57 66c1.3-8 6-12 11-12s9.7 4 11 12" stroke={main} strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="28" cy="70" r="8" fill="#fff" stroke="#22D3EE" strokeWidth="3" />
          <circle cx="48" cy="72" r="8" fill="#fff" stroke="#10B981" strokeWidth="3" />
          <circle cx="68" cy="70" r="8" fill="#fff" stroke="#60A5FA" strokeWidth="3" />
        </g>
      )
    case "teaching-pro":
      return (
        <g>
          <path d="M28 35c8-9 32-9 40 0v29c-9-6-31-6-40 0V35Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M48 36v29M35 43h7M54 43h7M35 52h8M54 52h8" stroke="#B6D3F7" strokeWidth="3" strokeLinecap="round" />
          <path d="M48 22c1.8 6 3.8 8 9.5 9.5-5.7 1.5-7.7 3.5-9.5 9.5-1.8-6-3.8-8-9.5-9.5 5.7-1.5 7.7-3.5 9.5-9.5Z" fill={main} />
        </g>
      )
    case "math-agent":
      return (
        <g>
          <path d="M30 35h36v30H30V35Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M39 47h18M48 38v18M38 61h9M55 59l6 6M61 59l-6 6" stroke={main} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M66 25c2 5.5 3.7 7.2 9 9-5.3 1.8-7 3.5-9 9-2-5.5-3.7-7.2-9-9 5.3-1.8 7-3.5 9-9Z" fill="#22D3EE" />
        </g>
      )
    case "english-agent":
      return (
        <g>
          <path d="M29 32h38v30H47L35 72V62h-6V32Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M38 52V41h10M38 46h8M38 52h11M55 41v11M55 41h5.5c2.5 0 4.5 2 4.5 4.5S63 50 60.5 50H55" stroke={main} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M68 26v7M64.5 29.5h7" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case "lesson-planning":
      return (
        <g>
          <rect x="29" y="30" width="38" height="36" rx="6" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M38 39h18M38 48h12M38 57h18" stroke="#B6D3F7" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M61 54 71 44l5 5-10 10-7 2 2-7Z" fill={main} />
          <path d="M29 40h-6M29 56h-6" stroke="#22D3EE" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      )
    case "class-advisor":
      return (
        <g>
          <path d="M48 25 69 35v13c0 13-8.5 22-21 27-12.5-5-21-14-21-27V35l21-10Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <circle cx="48" cy="46" r="7" fill={main} />
          <path d="M35 62c2.2-7 7-10.5 13-10.5S58.8 55 61 62" fill={soft} stroke={main} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M39 33c3 3 6 4.5 9 4.5S54 36 57 33" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case "paper-writing":
      return (
        <g>
          <path d="M31 28h27l9 9v32H31V28Z" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M58 29v9h9" stroke={main} strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M39 43h17M39 51h20M39 59h13" stroke="#B6D3F7" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M36 69c9-1 17-3.5 24-9" stroke={main} strokeWidth="3.6" strokeLinecap="round" />
          <circle cx="64" cy="59" r="4.5" fill="#22D3EE" />
        </g>
      )
    case "reading-report":
      return (
        <g>
          <path d="M27 34c7-5 16-5 21 0v33c-5-5-14-5-21 0V34ZM48 34c5-5 14-5 21 0v33c-7-5-16-5-21 0V34Z" fill="#fff" stroke={main} strokeWidth="3.4" strokeLinejoin="round" />
          <path d="M35 43h7M35 52h7M55 43h7M55 52h7" stroke="#B6D3F7" strokeWidth="3" strokeLinecap="round" />
          <path d="M48 24c1.6 5 3.3 6.7 8 8-4.7 1.3-6.4 3-8 8-1.6-5-3.3-6.7-8-8 4.7-1.3 6.4-3 8-8Z" fill="#22D3EE" />
        </g>
      )
    case "experiment-report":
      return (
        <g>
          <path d="M40 28h16M44 28v15L31 66c-2 3.5.5 8 4.5 8h25c4 0 6.5-4.5 4.5-8L52 43V28" stroke={main} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="#fff" />
          <path d="M37 62h22l4 8H33l4-8Z" fill={main} opacity="0.85" />
          <circle cx="43" cy="58" r="3" fill="#22D3EE" />
          <circle cx="54" cy="67" r="2.6" fill="#fff" opacity="0.9" />
        </g>
      )
    case "study-abroad":
      return (
        <g>
          <circle cx="48" cy="49" r="21" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M27 49h42M48 28c7 7 10 14 10 21s-3 14-10 21M48 28c-7 7-10 14-10 21s3 14 10 21" stroke={main} strokeWidth="3" strokeLinecap="round" />
          <path d="M63 25 73 21l-4 10 6 5-8 2-4 9-4-10-9-3 9-3 4-6Z" fill={gold} />
        </g>
      )
    case "resume-optimize":
      return (
        <g>
          <rect x="31" y="29" width="35" height="40" rx="7" fill="#fff" stroke={main} strokeWidth="3.5" />
          <circle cx="48.5" cy="42" r="6" fill={main} />
          <path d="M38 57c2-6 6-9 10.5-9S57 51 59 57" fill={soft} stroke={main} strokeWidth="3" />
          <path d="M39 64h19" stroke="#B6D3F7" strokeWidth="3" strokeLinecap="round" />
          <path d="M67 28c1.4 4.5 2.9 6 7 7-4.1 1-5.6 2.5-7 7-1.4-4.5-2.9-6-7-7 4.1-1 5.6-2.5 7-7Z" fill="#22D3EE" />
        </g>
      )
    case "speech-defense":
      return (
        <g>
          <path d="M30 40h36v25H50l-10 8v-8H30V40Z" fill="#fff" stroke={main} strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M39 50h18M39 58h11" stroke="#B6D3F7" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M49 23c1.8 7 4 9.2 10.8 11-6.8 1.8-9 4-10.8 11-1.8-7-4-9.2-10.8-11 6.8-1.8 9-4 10.8-11Z" fill={main} />
        </g>
      )
    case "school-wechat":
      return (
        <g>
          <rect x="29" y="30" width="38" height="36" rx="8" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M37 42h22M37 51h16M37 60h21" stroke="#B6D3F7" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M67 23v16M59 31h16" stroke={main} strokeWidth="3.8" strokeLinecap="round" />
          <circle cx="67" cy="31" r="10" fill={soft} stroke={main} strokeWidth="2.5" />
        </g>
      )
    case "share":
      return (
        <g>
          <circle cx="33" cy="48" r="8" fill="#fff" stroke={main} strokeWidth="3.5" />
          <circle cx="62" cy="32" r="8" fill="#fff" stroke={main} strokeWidth="3.5" />
          <circle cx="63" cy="65" r="8" fill="#fff" stroke={main} strokeWidth="3.5" />
          <path d="M40 44 55 36M40 52l16 9" stroke={main} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M62 25c1 3.2 2 4.2 5 5-3 1-4 1.8-5 5-1-3.2-2-4-5-5 3-1 4-1.8 5-5Z" fill="#22D3EE" />
        </g>
      )
    case "download":
      return (
        <g>
          <path d="M32 67h33" stroke={main} strokeWidth="4" strokeLinecap="round" />
          <path d="M48.5 28v28M38 47.5 48.5 58 59 47.5" stroke={main} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M31 35c4-6 10-9 17.5-9S62 29 66 35" stroke="#22D3EE" strokeWidth="3.2" strokeLinecap="round" opacity="0.9" />
        </g>
      )
    case "success":
      return (
        <g>
          <circle cx="48" cy="49" r="22" fill="#fff" stroke={main} strokeWidth="3.8" />
          <path d="m36 50 8 8 17-19" stroke={main} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M66 27c1.4 4 2.8 5.4 7 7-4.2 1.2-5.6 2.6-7 7-1.4-4.4-2.8-5.8-7-7 4.2-1.6 5.6-3 7-7Z" fill="#22D3EE" />
        </g>
      )
    case "warning":
      return (
        <g>
          <path d="M45 29c1.4-2.5 5-2.5 6.4 0l21 36.5c1.4 2.5-.4 5.5-3.2 5.5h-42c-2.8 0-4.6-3-3.2-5.5L45 29Z" fill={soft} stroke={main} strokeWidth="3.5" />
          <path d="M48 42v13M48 64h.1" stroke="#F97316" strokeWidth="5" strokeLinecap="round" />
        </g>
      )
    case "processing":
      return (
        <g>
          <circle cx="48" cy="49" r="20" fill="#fff" stroke={main} strokeWidth="3.4" strokeDasharray="11 7" />
          <path d="M48 31v8M48 59v8M30 49h8M58 49h8" stroke="#22D3EE" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="48" cy="49" r="8" fill={main} />
          <path d="M64 26c1.2 4 2.5 5.3 6.5 6.5-4 1.2-5.3 2.5-6.5 6.5-1.2-4-2.5-5.3-6.5-6.5 4-1.2 5.3-2.5 6.5-6.5Z" fill="#8B5CF6" />
        </g>
      )
    default:
      return null
  }
}
