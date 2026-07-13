"use client"

import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter"
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash"
import css from "react-syntax-highlighter/dist/esm/languages/prism/css"
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript"
import json from "react-syntax-highlighter/dist/esm/languages/prism/json"
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx"
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown"
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup"
import python from "react-syntax-highlighter/dist/esm/languages/prism/python"
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql"
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx"
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript"
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

for (const [name, definition] of Object.entries({
  bash,
  css,
  javascript,
  json,
  jsx,
  markdown,
  markup,
  python,
  sql,
  tsx,
  typescript,
  yaml,
})) {
  SyntaxHighlighter.registerLanguage(name, definition)
}

type HighlightedCodeProps = {
  code: string
  language: string
}

export function HighlightedCode({ code, language }: HighlightedCodeProps) {
  return (
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      PreTag="div"
      customStyle={{
        margin: 0,
        padding: "1rem",
        backgroundColor: "var(--ink-900)",
        color: "var(--paper-100)",
        fontSize: "0.84rem",
        lineHeight: 1.68,
        borderRadius: 0,
      }}
      codeTagProps={{
        style: {
          fontFamily: "var(--font-mono-v2), SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
          color: "inherit",
        },
      }}
      showLineNumbers={false}
      wrapLongLines
    >
      {code}
    </SyntaxHighlighter>
  )
}
