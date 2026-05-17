"use client"

export const SIDEBAR_COLLAPSE_EVENT = "sidebar-collapse"
export const SIDEBAR_EXPAND_EVENT = "sidebar-expand"
export const CREDITS_REFRESH_EVENT = "credits-refresh"
export const SESSION_LIST_REFRESH_EVENT = "session-list-refresh"

export function collapseSidebar() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SIDEBAR_COLLAPSE_EVENT))
}

export function expandSidebar() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SIDEBAR_EXPAND_EVENT))
}

export function navigateHomeWithSidebar(router: { push: (href: string) => void }) {
  router.push("/")
  if (typeof window === "undefined") return
  window.setTimeout(expandSidebar, 0)
}

export function refreshCredits() {
  if (typeof window === "undefined") return
  console.log("📤 [积分刷新] 触发全局积分刷新事件")
  window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT))
}

export function refreshSessionList() {
  if (typeof window === "undefined") return
  console.log("📤 [会话列表刷新] 触发全局会话列表刷新事件")
  window.dispatchEvent(new CustomEvent(SESSION_LIST_REFRESH_EVENT))
}
