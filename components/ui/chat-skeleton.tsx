/**
 * 💀 Chat Skeleton Screen
 *
 * Grey flickering blocks simulating dialogue box outlines
 * shown during session switches / initial loads.
 */

"use client"

import { cn } from "@/lib/utils"

// Single message bubble skeleton
function MessageBubbleSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar skeleton */}
      <div
        className={cn(
          "w-12 h-12 rounded-2xl shrink-0 animate-pulse bg-slate-200"
        )}
      />
      {/* Content skeleton */}
      <div className="flex flex-col gap-2 flex-1 max-w-[75%]">
        <div
          className="h-4 rounded-full animate-pulse bg-slate-200 w-24"
        />
        <div
          className={cn(
            "rounded-2xl p-3 space-y-2 animate-pulse bg-slate-100",
            isUser ? "ml-auto" : ""
          )}
        >
          <div className="h-3 rounded-full bg-slate-200" />
          <div className="h-3 rounded-full bg-slate-200 w-5/6" />
          <div className="h-3 rounded-full bg-slate-200 w-4/6" />
        </div>
      </div>
    </div>
  )
}

// Assembled chat stream skeleton
export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-3 sm:px-4 md:px-6 lg:px-10 py-6">
      {/* AI message */}
      <MessageBubbleSkeleton />
      {/* User message */}
      <MessageBubbleSkeleton isUser />
      {/* AI message longer */}
      <MessageBubbleSkeleton />
      {/* Another AI message */}
      <MessageBubbleSkeleton />
    </div>
  )
}

// Full-page loading state with centered skeleton
export function ChatLoadingState() {
  return (
    <div className="flex h-[80dvh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <ChatSkeleton />
      </div>
    </div>
  )
}
