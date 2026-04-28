const APP_ROUTE_PREFIXES = [
  "/admin",
  "/chat",
  "/credits",
  "/history",
  "/settings",
] as const

export function usesAppChrome(pathname: string | null | undefined) {
  if (!pathname) return false

  return pathname === "/" || APP_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function shouldSidebarOpenForRoute(pathname: string | null | undefined, isMobile: boolean) {
  if (pathname === "/") return true
  if (isMobile) return false

  return usesAppChrome(pathname)
}
