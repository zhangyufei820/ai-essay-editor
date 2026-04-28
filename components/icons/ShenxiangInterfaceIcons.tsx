"use client"

import * as React from "react"

export type ShenxiangInterfaceIconName =
  | "help"
  | "share"
  | "user-avatar"
  | "settings"
  | "credits"
  | "invite"
  | "menu"
  | "close"
  | "logout"
  | "upgrade"
  | "openclaw"
  | "education"
  | "top-models"
  | "ai-writing"
  | "creative"
  | "history"
  | "upload"
  | "download"
  | "copy"
  | "camera"
  | "mail"
  | "phone"
  | "success"
  | "warning"
  | "loading"
  | "back"

export type ShenxiangInterfaceIconProps = {
  name: ShenxiangInterfaceIconName
  size?: number
  className?: string
  title?: string
}

const iconLabels: Record<ShenxiangInterfaceIconName, string> = {
  help: "帮助",
  share: "分享",
  "user-avatar": "用户头像",
  settings: "设置",
  credits: "积分",
  invite: "邀请",
  menu: "菜单",
  close: "关闭",
  logout: "退出登录",
  upgrade: "升级",
  openclaw: "OpenClaw",
  education: "教育专区",
  "top-models": "顶级模型",
  "ai-writing": "AI 写作",
  creative: "多媒体专区",
  history: "历史记录",
  upload: "上传",
  download: "下载",
  copy: "复制",
  camera: "相机",
  mail: "邮箱",
  phone: "电话",
  success: "成功",
  warning: "警告",
  loading: "加载中",
  back: "返回",
}

const accentMap: Partial<Record<ShenxiangInterfaceIconName, "gold" | "cyan" | "rose" | "violet">> = {
  credits: "gold",
  invite: "gold",
  warning: "rose",
  creative: "violet",
  "top-models": "violet",
  share: "cyan",
  camera: "cyan",
}

export function ShenxiangInterfaceIcon({ name, size = 24, className, title }: ShenxiangInterfaceIconProps) {
  const reactId = React.useId().replace(/:/g, "")
  const accent = accentMap[name] || "cyan"
  const accentColor =
    accent === "gold" ? "#F59E0B" : accent === "rose" ? "#FB7185" : accent === "violet" ? "#8B5CF6" : "#22D3EE"
  const label = title || iconLabels[name]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={label}
      className={className}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={`sx-ui-${reactId}-brand`} x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14532D" />
          <stop offset="0.55" stopColor="#10B981" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id={`sx-ui-${reactId}-surface`} x1="9" y1="7" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#ECFDF5" />
        </linearGradient>
        <filter id={`sx-ui-${reactId}-shadow`} x="-35%" y="-25%" width="170%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#14532D" floodOpacity="0.14" />
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#0284C7" floodOpacity="0.1" />
        </filter>
      </defs>
      <g filter={`url(#sx-ui-${reactId}-shadow)`}>
        <rect x="8" y="7" width="32" height="34" rx="11" fill={`url(#sx-ui-${reactId}-surface)`} />
        <rect x="8" y="7" width="32" height="34" rx="11" stroke="#D8EFE5" strokeWidth="1.7" />
      </g>
      {renderInterfaceGlyph(name, `url(#sx-ui-${reactId}-brand)`, accentColor)}
    </svg>
  )
}

function renderInterfaceGlyph(name: ShenxiangInterfaceIconName, brand: string, accent: string) {
  const stroke = { stroke: brand, strokeWidth: 2.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const softStroke = { stroke: "#B7CBEA", strokeWidth: 2.2, strokeLinecap: "round" as const }

  switch (name) {
    case "help":
      return (
        <g>
          <path d="M19 21.2c.4-3 2.5-5 5.5-5 3.2 0 5.5 2 5.5 4.8 0 2.4-1.5 3.6-3.5 4.8-1.7 1-2.3 1.9-2.3 3.6" {...stroke} />
          <circle cx="24.2" cy="34" r="1.7" fill={accent} />
        </g>
      )
    case "share":
      return (
        <g>
          <circle cx="18" cy="25" r="3.6" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <circle cx="30.5" cy="18" r="3.6" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <circle cx="31" cy="32" r="3.6" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <path d="m21.2 23 6.2-3.4M21.4 27.1l6.3 3.3" {...stroke} />
        </g>
      )
    case "user-avatar":
      return (
        <g>
          <circle cx="24" cy="21" r="5.2" fill={brand} />
          <path d="M15.8 34c1.2-5 4.3-7.4 8.2-7.4s7 2.4 8.2 7.4" fill="#FFFFFF" stroke={brand} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M16 14c2.5-2.3 5.1-3.4 8-3.4s5.5 1.1 8 3.4" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </g>
      )
    case "settings":
      return (
        <g>
          <circle cx="24" cy="24" r="5.1" fill="#FFFFFF" stroke={brand} strokeWidth="2.6" />
          <path d="M24 14.5v3M24 30.5v3M14.5 24h3M30.5 24h3M17.3 17.3l2.1 2.1M28.6 28.6l2.1 2.1M30.7 17.3l-2.1 2.1M19.4 28.6l-2.1 2.1" {...stroke} />
        </g>
      )
    case "credits":
      return (
        <g>
          <circle cx="24" cy="25" r="9.2" fill={accent} opacity="0.95" />
          <path d="m24 17.8 2 3.8 4.2.7-3 3.1.6 4.3-3.8-1.9-3.8 1.9.6-4.3-3-3.1 4.2-.7 2-3.8Z" fill="#FFFFFF" />
          <circle cx="32.4" cy="32.5" r="3.6" fill="#22D3EE" stroke="#FFFFFF" strokeWidth="1.6" />
        </g>
      )
    case "invite":
      return (
        <g>
          <path d="M16 22h16v12H16V22Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.5" />
          <path d="M14.5 22h19M24 22v12M18 17.5c0-2.1 2.4-3.1 4-1.7l2 1.7 2-1.7c1.6-1.4 4-.4 4 1.7 0 1.7-1.4 3-3 3h-6c-1.7 0-3-1.3-3-3Z" {...stroke} />
        </g>
      )
    case "menu":
      return <path d="M17 19h14M17 24h14M17 29h14" {...stroke} />
    case "close":
      return <path d="M19 19 29 29M29 19 19 29" {...stroke} />
    case "logout":
      return (
        <g>
          <path d="M23 16h-6v16h6" {...stroke} />
          <path d="M25 24h9M30.5 19.5 35 24l-4.5 4.5" {...stroke} />
        </g>
      )
    case "upgrade":
      return (
        <g>
          <path d="M24 15 33 20v7c0 5.7-3.5 9.6-9 12-5.5-2.4-9-6.3-9-12v-7l9-5Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.5" />
          <path d="M20 27 24 21l4 6M24 21v12" {...stroke} />
        </g>
      )
    case "openclaw":
      return (
        <g>
          <path d="M17 30c1.5-7.5 5.2-12 10.2-12 3.9 0 6.4 2.2 6.4 5.3 0 5.9-8.4 4.2-8.4 9.2" {...stroke} />
          <path d="M18 30c3 2.2 6.4 3.2 10.4 3.2" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )
    case "education":
      return (
        <g>
          <path d="M14 20 24 15l10 5-10 5-10-5Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.5" />
          <path d="M18 23.2v6c3.8 2.4 8.2 2.4 12 0v-6" {...stroke} />
          <path d="M34 20v8" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )
    case "top-models":
      return (
        <g>
          <rect x="16" y="17" width="16" height="16" rx="5" fill="#FFFFFF" stroke={brand} strokeWidth="2.5" />
          <path d="M20 25h8M24 21v8" {...stroke} />
          <path d="M34 15v5M31.5 17.5h5" stroke={accent} strokeWidth="2.1" strokeLinecap="round" />
        </g>
      )
    case "ai-writing":
      return (
        <g>
          <path d="M17 16h12l4 4v15H17V16Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <path d="M29 16.5V21h4" {...stroke} />
          <path d="M21 25h7M21 30h5" {...softStroke} />
          <path d="M30 29 35 24" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )
    case "creative":
      return (
        <g>
          <rect x="16" y="17" width="17" height="15" rx="4" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <path d="m18 31 5-5 3.5 3.4 3.5-5.1 4 6.7" fill={accent} opacity="0.9" />
          <circle cx="21" cy="22" r="2" fill="#22D3EE" />
        </g>
      )
    case "history":
      return (
        <g>
          <path d="M33 24c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c3.1 0 5.9 1.6 7.5 4" {...stroke} />
          <path d="M31.5 15v4.8h-4.8M24 19.5v5l3.6 2.4" {...stroke} />
        </g>
      )
    case "upload":
      return <path d="M16 32h16M24 32V17M18.5 22.5 24 17l5.5 5.5" {...stroke} />
    case "download":
      return <path d="M16 32h16M24 17v15M18.5 26.5 24 32l5.5-5.5" {...stroke} />
    case "copy":
      return (
        <g>
          <rect x="18" y="18" width="12" height="14" rx="3" fill="#FFFFFF" stroke={brand} strokeWidth="2.3" />
          <path d="M22 15h8c2 0 3 1 3 3v9" {...stroke} />
        </g>
      )
    case "camera":
      return (
        <g>
          <path d="M16 20h5l1.6-2.5h4.8L29 20h3v12H16V20Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <circle cx="24" cy="26.4" r="4.2" fill="#FFFFFF" stroke={accent} strokeWidth="2.3" />
        </g>
      )
    case "mail":
      return (
        <g>
          <rect x="15" y="18" width="18" height="14" rx="4" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" />
          <path d="m17 21 7 5.2 7-5.2" {...stroke} />
        </g>
      )
    case "phone":
      return (
        <path d="M19 16c.5 8 4.7 12.2 13 13l1.4-4.2-4.5-2.1-2 2c-2.1-1-3.8-2.7-4.8-4.8l2-2-2-4.5L19 16Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.4" strokeLinejoin="round" />
      )
    case "success":
      return <path d="m17 25 5 5 10-12" {...stroke} />
    case "warning":
      return (
        <g>
          <path d="M22.5 17.5c.7-1.3 2.3-1.3 3 0l8 14c.7 1.2-.2 2.7-1.5 2.7H16c-1.3 0-2.2-1.5-1.5-2.7l8-14Z" fill="#FFFFFF" stroke={brand} strokeWidth="2.3" />
          <path d="M24 22v5M24 31h.1" stroke={accent} strokeWidth="2.8" strokeLinecap="round" />
        </g>
      )
    case "loading":
      return (
        <g>
          <circle cx="24" cy="24" r="8.5" stroke={brand} strokeWidth="2.4" strokeDasharray="7 5" />
          <circle cx="24" cy="24" r="2.8" fill={accent} />
        </g>
      )
    case "back":
      return <path d="M29 17 20 24l9 7M21 24h13" {...stroke} />
    default:
      return null
  }
}
