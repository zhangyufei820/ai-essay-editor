/**
 * 🖌 v2 用户消息气泡
 *
 * 视觉：白纸条贴在墨绿背景上 — 不是"灰泡贴右"，是一条"撕下来的便签"
 */

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface UserMessageV2Props {
  content: string
  attachments?: Array<{ type: "image" | "file"; url: string; name?: string }>
  createdAt?: string
  className?: string
}

export function UserMessageV2({
  content,
  attachments,
  createdAt,
  className,
}: UserMessageV2Props) {
  return (
    <div className={cn("flex w-full justify-end", className)}>
      <div
        data-slot="v2-user-msg"
        className={cn(
          "max-w-[85%] sm:max-w-[70%]",
          "rounded-[var(--radius-soft)] bg-[var(--ink-700)] text-white",
          "px-4 py-3 shadow-[var(--shadow-paper)]",
          "font-[var(--font-sans-v2)]"
        )}
      >
        {/* 附件预览 */}
        {attachments && attachments.length > 0 ? (
          <div className="mb-2 grid grid-cols-2 gap-2">
            {attachments.map((att, idx) =>
              att.type === "image" ? (
                <div
                  key={idx}
                  className="relative aspect-square overflow-hidden rounded-[var(--radius-soft)] bg-black/20"
                >
                  <Image
                    src={att.url}
                    alt={att.name ?? `附件 ${idx + 1}`}
                    fill
                    sizes="200px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <span
                  key={idx}
                  className="rounded-[var(--radius-soft)] bg-white/10 px-2 py-1 text-[12px]"
                >
                  📎 {att.name ?? "文件"}
                </span>
              )
            )}
          </div>
        ) : null}

        <p className="whitespace-pre-wrap text-[15px] leading-[1.7]">{content}</p>

        {createdAt ? (
          <div className="mt-2 text-[11px] text-white/60 text-right font-[var(--font-mono-v2)]">
            {new Date(createdAt).toLocaleString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
