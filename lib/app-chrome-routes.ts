const APP_ROUTE_PREFIXES = [
  "/admin",
  "/credits",
  "/dashboard",
  "/flashcards",
  "/folder",
  "/history",
  "/invite",
  "/lab",
  "/my/shares",
  "/settings",
  "/teacher",
  "/tools",
  "/worksheet-diagnosis",
] as const

export function usesAppChrome(pathname: string | null | undefined) {
  if (!pathname) return false

  return APP_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function shouldSidebarOpenForRoute(pathname: string | null | undefined, isMobile: boolean) {
  if (pathname === "/") return false
  if (isMobile) return false

  return usesAppChrome(pathname)
}
