declare module "react-syntax-highlighter" {
  import type { ComponentType, ReactNode } from "react"

  export const Prism: ComponentType<{
    children?: ReactNode
    language?: string
    PreTag?: string | ComponentType<any>
    customStyle?: Record<string, unknown>
    style?: unknown
    showLineNumbers?: boolean
    wrapLines?: boolean
  }>
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneDark: unknown
}
