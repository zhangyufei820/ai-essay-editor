"use client"

import { ButtonV2 as Button } from "@/components/ui/v2"
import { useState } from "react"

export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return <Button onClick={handleCopy}>{copied ? "已复制" : label}</Button>
}
