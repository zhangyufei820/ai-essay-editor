"use client"

/**
 * 异步样式表加载组件
 * 避免 render-blocking，加快 FCP
 */
export function AsyncStylesheet({
  href,
  media = "print",
}: {
  href: string
  media?: string
}) {
  return (
    <>
      <link
        rel="stylesheet"
        href={href}
        media={media}
        onLoad={(e) => { (e.target as HTMLLinkElement).media = "all" }}
      />
      <noscript>
        <link rel="stylesheet" href={href} />
      </noscript>
    </>
  )
}
