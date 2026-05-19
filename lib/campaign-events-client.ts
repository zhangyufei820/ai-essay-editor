"use client"

import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import type { CampaignEventName } from "@/lib/campaign-events"

const ANONYMOUS_ID_KEY = "free-trial-campaign-anonymous-id"

function getAnonymousId(): string {
  if (typeof window === "undefined") return "server"

  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY)
  if (existing) return existing

  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(ANONYMOUS_ID_KEY, generated)
  return generated
}

function getCurrentPagePath(): string | null {
  if (typeof window === "undefined") return null
  return window.location.pathname
}

export async function trackCampaignEvent(
  eventName: CampaignEventName,
  metadata?: Record<string, unknown>,
  pagePath?: string,
): Promise<void> {
  if (typeof window === "undefined") return

  try {
    const headers = await getVerifiedAuthHeaders()
    await fetch("/api/campaign-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        eventName,
        anonymousId: getAnonymousId(),
        pagePath: pagePath || getCurrentPagePath(),
        metadata: metadata || {},
      }),
      keepalive: true,
    })
  } catch (error) {
    console.warn("[campaign-events-client] track failed", { eventName, error })
  }
}
