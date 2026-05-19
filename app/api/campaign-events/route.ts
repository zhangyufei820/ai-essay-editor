import { NextResponse, type NextRequest } from "next/server"
import {
  CAMPAIGN_EVENT_METADATA_MAX_BYTES,
  getCampaignEventMetadataSize,
  isAllowedCampaignEventName,
  recordCampaignEvent,
  sanitizeCampaignPagePath,
} from "@/lib/campaign-events"
import { getVerifiedUser } from "@/lib/auth/verified-user"
import { logger } from "@/lib/logger"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CampaignEventBody = {
  eventName?: unknown
  anonymousId?: unknown
  pagePath?: unknown
  metadata?: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function normalizeAnonymousId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 8 || trimmed.length > 128) return null
  return trimmed
}

export async function POST(request: NextRequest) {
  const originRejected = rejectUntrustedOrigin(request)
  if (originRejected) return originRejected

  try {
    const body = (await request.json().catch(() => null)) as CampaignEventBody | null
    if (!body || !isAllowedCampaignEventName(body.eventName)) {
      return NextResponse.json({ ok: false, error: "invalid_event_name" }, { status: 400 })
    }

    const metadata = isPlainObject(body.metadata) ? body.metadata : {}
    if (getCampaignEventMetadataSize(metadata) > CAMPAIGN_EVENT_METADATA_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "metadata_too_large" }, { status: 413 })
    }

    const user = await getVerifiedUser(request).catch(() => null)
    const anonymousId = normalizeAnonymousId(body.anonymousId)
    if (!user?.id && !anonymousId) {
      return NextResponse.json({ ok: false, error: "anonymous_id_required" }, { status: 400 })
    }

    const recorded = await recordCampaignEvent({
      eventName: body.eventName,
      userId: user?.id || null,
      anonymousId,
      pagePath: sanitizeCampaignPagePath(body.pagePath),
      metadata,
    })

    if (!recorded.success) {
      logger.warn("[api/campaign-events] best-effort record failed", {
        eventName: body.eventName,
        error: recorded.error,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.warn("[api/campaign-events] unexpected tracking failure", error)
    return NextResponse.json({ ok: true })
  }
}
