declare module "react-syntax-highlighter" {
  import type { ComponentType, ReactNode } from "react"

  type SyntaxHighlighterProps = {
    children?: ReactNode
    language?: string
    PreTag?: string | ComponentType<any>
    customStyle?: Record<string, unknown>
    codeTagProps?: Record<string, unknown>
    style?: unknown
    showLineNumbers?: boolean
    wrapLines?: boolean
    wrapLongLines?: boolean
  }

  type SyntaxHighlighterComponent = ComponentType<SyntaxHighlighterProps> & {
    registerLanguage: (name: string, definition: unknown) => void
  }

  export const Prism: SyntaxHighlighterComponent
  export const PrismLight: SyntaxHighlighterComponent
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
  const languageDefinition: unknown
  export default languageDefinition
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneDark: unknown
}
