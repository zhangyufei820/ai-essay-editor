/**
 * 🖌 v2 图标 · 第 2 组：智能体图标（12 个）
 * 不含 ChatGPT / Gemini / Suno / Claude / Grok 官方 logo
 */

import type { InkIconProps } from "./types"

function wrap(props: InkIconProps, children: React.ReactNode) {
  const { size = 24, className, ...rest } = props
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

/** 作文批改 — 纸页 + 朱红批注线 */
export function IconEssay(props: InkIconProps) {
  return wrap(props, <>
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M15 3v4h4" />
    <path d="M8 10h7" stroke="var(--seal-500,#B23A2C)" strokeWidth={1.2} />
    <path d="M8 13h5" stroke="var(--seal-500,#B23A2C)" strokeWidth={1.2} />
    <path d="M8 16h3" stroke="var(--seal-500,#B23A2C)" strokeWidth={1.2} opacity={0.6} />
  </>)
}

/** 写作类通用 — 钢笔笔尖 + 书写轨迹 */
export function IconWriting(props: InkIconProps) {
  return wrap(props, <>
    <path d="M16 3l5 5-11 11H5v-5L16 3z" />
    <path d="M14 5l5 5" />
    <path d="M5 19h14" opacity={0.4} />
  </>)
}

/** 全学段数学 — 尺规组合 */
export function IconMath(props: InkIconProps) {
  return wrap(props, <>
    <path d="M3 21L12 3l9 18H3z" />
    <path d="M7.5 15h9" />
    <circle cx="18" cy="8" r="4" strokeDasharray="2 2" />
  </>)
}

/** 全学段英语 — A + a 叠加 */
export function IconEnglish(props: InkIconProps) {
  return wrap(props, <>
    <path d="M5 18L9 6h2l4 12" strokeWidth={2} />
    <path d="M7 14h6" />
    <circle cx="18" cy="15" r="3" />
    <path d="M21 12v6" />
  </>)
}

/** 词境记忆卡 — 卡片 + 首字母 */
export function IconVocab(props: InkIconProps) {
  return wrap(props, <>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 9h6M12 9v7" strokeWidth={2} />
    <path d="M9 16h6" strokeWidth={1} opacity={0.4} />
  </>)
}

/** 题目解析 — 问号 + 灯泡 */
export function IconProblem(props: InkIconProps) {
  return wrap(props, <>
    <circle cx="12" cy="11" r="7" />
    <path d="M10 9c0-1.5 1-2.5 2-2.5s2 1 2 2.5c0 1-1 1.5-2 2v1" strokeWidth={1.8} />
    <circle cx="12" cy="14.5" r="0.5" fill="currentColor" />
    <path d="M10 20h4M11 20v2M13 20v2" />
  </>)
}

/** OpenClaw — 幻灯片框 + 播放 */
export function IconOpenClaw(props: InkIconProps) {
  return wrap(props, <>
    <rect x="3" y="4" width="18" height="14" rx="1" />
    <path d="M10 9v6l5-3-5-3z" fill="currentColor" stroke="none" />
    <path d="M8 21h8" />
    <path d="M12 18v3" />
  </>)
}

/** Suno 音乐 — 音符 + 声波 */
export function IconMusic(props: InkIconProps) {
  return wrap(props, <>
    <path d="M9 18V6l9-3v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="15" cy="15" r="3" />
    <path d="M19 8c1 0 2 .5 2 2s-1 2-2 2" strokeWidth={1} />
    <path d="M20 6c1.5 0 3 1 3 3s-1.5 3-3 3" strokeWidth={1} opacity={0.5} />
  </>)
}

/** 教学类通用 — 讲台 + 黑板 */
export function IconTeaching(props: InkIconProps) {
  return wrap(props, <>
    <rect x="3" y="3" width="18" height="12" rx="1" />
    <path d="M8 7h8M8 10h5" />
    <path d="M6 19h12M9 15v4M15 15v4" />
  </>)
}

/** 网站助手 — 对话入口 + 指引星标 */
export function IconWebsiteAssistant(props: InkIconProps) {
  return wrap(props, <>
    <path d="M5 6.5h10a4 4 0 0 1 0 8H9l-4 3.5v-3.5a4 4 0 0 1 0-8z" />
    <path d="M9 10.5h4M9 12.8h2.5" opacity={0.65} />
    <path d="M18.5 4.5v3M17 6h3" stroke="var(--seal-500,#B23A2C)" strokeWidth={1.3} />
    <path d="M19 16.5l2 2-2 2" />
    <path d="M14.5 18.5H21" />
  </>)
}

/** 数学图片与动画生成器 — 函数曲线 + 图片框 + 播放 */
export function IconAllInOne(props: InkIconProps) {
  return wrap(props, <>
    <rect x="3.5" y="4" width="17" height="13" rx="2" />
    <path d="M6.5 14c1.5-4 3.5-4 5 0s3.5 4 5 0" />
    <path d="M7 7.5h3.2M8.6 6v3" stroke="var(--seal-500,#B23A2C)" strokeWidth={1.2} />
    <path d="M15.5 7.5v4l3-2-3-2z" fill="currentColor" stroke="none" opacity={0.9} />
    <path d="M8 20h8M12 17v3" opacity={0.6} />
  </>)
}

/** 超级全能智能体 — 中枢节点 + 多能力轨道 */
export function IconSuperAgent(props: InkIconProps) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.5v5.3M12 15.2v5.3M3.5 12h5.3M15.2 12h5.3" />
    <path d="M6.2 6.2l3.7 3.7M14.1 14.1l3.7 3.7M17.8 6.2l-3.7 3.7M9.9 14.1l-3.7 3.7" opacity={0.65} />
    <circle cx="12" cy="3.5" r="1.4" fill="var(--seal-500,#B23A2C)" stroke="none" />
    <rect x="18.8" y="10.8" width="2.8" height="2.8" rx=".6" fill="currentColor" stroke="none" />
    <path d="M10.8 20.5h2.4l-1.2-2-1.2 2z" fill="currentColor" stroke="none" />
    <path d="M3.5 10.8l1.4 2.4 1.4-2.4H3.5z" fill="currentColor" stroke="none" opacity={0.85} />
  </>)
}

/** 备课 Pro — 教案本 + 书签 */
export function IconBeike(props: InkIconProps) {
  return wrap(props, <>
    <rect x="4" y="3" width="14" height="18" rx="1" />
    <path d="M4 7h14" />
    <path d="M15 3v6l-1.5-1L12 9V3" fill="var(--seal-500,#B23A2C)" stroke="none" opacity={0.7} />
    <path d="M7 11h6M7 14h4" />
  </>)
}

/** 班主任助手 — 人形 + 爱心 */
export function IconBanzhuren(props: InkIconProps) {
  return wrap(props, <>
    <circle cx="10" cy="7" r="3.5" />
    <path d="M4 19c0-3 2.5-5 6-5s6 2 6 5" />
    <path d="M18 10c.5-.5 1.5-.5 2 0s.5 1.5 0 2.5L18 15l-2-2.5c-.5-1-.5-2 0-2.5s1.5-.5 2 0z" fill="var(--seal-500,#B23A2C)" stroke="none" />
  </>)
}
