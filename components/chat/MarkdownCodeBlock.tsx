"use client"

import { memo, useState } from "react"
import dynamic from "next/dynamic"
import { Check } from "lucide-react"
import { IconCopy } from "@/components/icons/v2"
import { cn } from "@/lib/utils"

const HighlightedCode = dynamic(
  () => import("@/components/chat/HighlightedCode").then((module) => module.HighlightedCode),
  {
    ssr: false,
    loading: () => (
      <pre className="m-0 overflow-x-auto bg-[var(--ink-900)] p-4 font-mono text-[0.84rem] leading-relaxed text-[var(--paper-100)]">
        <code>代码高亮加载中…</code>
      </pre>
    ),
  },
)

type MarkdownCodeBlockProps = {
  code: string
  language?: string
  className?: string
}

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "bash",
  cjs: "javascript",
  cmd: "bash",
  console: "bash",
  html: "markup",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  vue: "markup",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
}

function normalizeLanguage(language?: string) {
  const raw = language?.replace(/^language-/, "").trim().toLowerCase() || ""
  return LANGUAGE_ALIASES[raw] || raw
}

export function inferCodeLanguage(code: string, explicitLanguage?: string) {
  const language = normalizeLanguage(explicitLanguage)
  if (language) return language

  const trimmed = code.trim()
  if (!trimmed) return "text"

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed)
      return "json"
    } catch {
      // Fall through to cheaper text heuristics below.
    }
  }

  if (/^\s*(const|let|var|function|import|export|type|interface)\s/m.test(trimmed)) return "typescript"
  if (/<[A-Za-z][\s\S]*>/.test(trimmed)) return "markup"
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(trimmed)) return "sql"
  if (/^\s*(curl|npm|pnpm|yarn|ssh|docker|git)\s/m.test(trimmed)) return "bash"
  if (/^\s*(def|class|from|import)\s+\w+/m.test(trimmed)) return "python"

  return "text"
}

export function extractLanguageFromClassName(className?: string) {
  return className?.match(/language-([\w-]+)/)?.[1] || ""
}

export const MarkdownCodeBlock = memo(function MarkdownCodeBlock({
  code,
  language,
  className,
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const codeString = code.replace(/\n$/, "")
  const detectedLanguage = inferCodeLanguage(codeString, language)
  const languageLabel = detectedLanguage === "text" ? "" : detectedLanguage

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeString)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={cn(
        "group relative my-3 overflow-hidden rounded-[var(--radius-sharp)] border border-[rgba(245,241,230,0.12)] bg-[var(--ink-900)] shadow-[0_18px_40px_rgba(14,27,17,0.18)]",
        className,
      )}
      data-language={languageLabel || undefined}
    >
      <div className="flex min-h-9 items-center justify-between border-b border-[rgba(245,241,230,0.1)] bg-[rgba(245,241,230,0.04)] px-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[rgba(245,241,230,0.62)]">
          {languageLabel || "code"}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] px-2 text-[11px] font-semibold text-[rgba(245,241,230,0.74)] transition hover:bg-[rgba(245,241,230,0.1)] hover:text-white focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)]"
          title={copied ? "已复制" : "复制代码"}
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <IconCopy className="size-3.5" aria-hidden="true" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <HighlightedCode code={codeString} language={detectedLanguage} />
    </div>
  )
})
