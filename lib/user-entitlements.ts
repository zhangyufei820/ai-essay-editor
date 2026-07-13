import { isSubscribedUser, resolveMembershipStatus } from "@/lib/products"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

const MEMBERSHIP_PRODUCT_IDS = ["basic", "pro", "premium", "enterprise", "campus"]
const ADMIN_USERS_PAGE_SIZE = 1000
const MAX_ADMIN_USER_PAGES = 100

export type EntitlementIdentity = {
  email?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
}

export type RelatedUserResolution = {
  userIds: string[]
  emails: string[]
  phones: string[]
}

export type UserEntitlementSummary = {
  userId: string
  entitlementUserId: string
  relatedUserIds: string[]
  credits: number
  isPro: boolean
  membershipStatus: string | null
  latestMembershipOrder: {
    id: string | number
    user_id: string
    product_id: string | null
    product_name: string | null
    amount: number | null
    created_at: string | null
  } | null
}

type SupabaseAdminClient = any

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized && normalized.includes("@") ? normalized : null
}

function normalizePhone(value?: string | null): string | null {
  const normalized = String(value || "").replace(/\D/g, "")
  return normalized.length >= 6 ? normalized : null
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function collectIdentityContacts(identity?: EntitlementIdentity | null) {
  const emails = new Set<string>()
  const phones = new Set<string>()
  const metadata = identity?.metadata || {}

  const candidateEmails = [
    identity?.email,
    readString(metadata.email),
    readString(metadata.mail),
    readString(metadata.phone),
    readString(metadata.mobile),
  ]
  const candidatePhones = [
    identity?.phone,
    readString(metadata.phone),
    readString(metadata.mobile),
    readString(metadata.phone_number),
  ]

  for (const value of candidateEmails) {
    const email = normalizeEmail(value)
    if (email) emails.add(email)
  }
  for (const value of candidatePhones) {
    const phone = normalizePhone(value)
    if (phone) phones.add(phone)
  }

  return { emails, phones }
}

export async function resolveRelatedUserIds(
  userId: string,
  identity?: EntitlementIdentity | null,
  supabase: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<RelatedUserResolution> {
  const userIds = new Set<string>([userId])
  const { emails, phones } = collectIdentityContacts(identity)

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from("user_profiles")
    .select("email, phone")
    .eq("user_id", userId)
    .maybeSingle()

  if (!currentProfileError) {
    const profileEmail = normalizeEmail(currentProfile?.email)
    const profilePhone = normalizePhone(currentProfile?.phone)
    if (profileEmail) emails.add(profileEmail)
    if (profilePhone) phones.add(profilePhone)
  }

  for (const email of emails) {
    const { data } = await supabase
      .from("user_profiles")
      .select("user_id")
      .ilike("email", email)
      .limit(20)

    data?.forEach((profile: { user_id?: string | null }) => {
      if (profile.user_id) userIds.add(profile.user_id)
    })
  }

  for (const phone of phones) {
    const { data } = await supabase
      .from("user_profiles")
      .select("user_id")
      .like("phone", `%${phone}%`)
      .limit(20)

    data?.forEach((profile: { user_id?: string | null }) => {
      if (profile.user_id) userIds.add(profile.user_id)
    })
  }

  if (emails.size || phones.size) {
    for (let page = 1; page <= MAX_ADMIN_USER_PAGES; page += 1) {
      const { data: authData, error } = await supabase.auth.admin.listUsers({ page, perPage: ADMIN_USERS_PAGE_SIZE })
      if (error) throw error
      for (const user of authData?.users || []) {
        const authEmail = normalizeEmail(user.email)
        const authPhone = normalizePhone(user.phone)
        const metaEmail = normalizeEmail(readString(user.user_metadata?.email))
        const metaPhone = normalizePhone(readString(user.user_metadata?.phone) || readString(user.user_metadata?.mobile))

        if (
          (authEmail && emails.has(authEmail)) ||
          (metaEmail && emails.has(metaEmail)) ||
          (authPhone && phones.has(authPhone)) ||
          (metaPhone && phones.has(metaPhone))
        ) {
          userIds.add(user.id)
        }
      }
      if ((authData?.users || []).length < ADMIN_USERS_PAGE_SIZE) break
    }
  }

  return {
    userIds: Array.from(userIds),
    emails: Array.from(emails),
    phones: Array.from(phones),
  }
}

export async function getUserEntitlementSummary(
  userId: string,
  identity?: EntitlementIdentity | null,
): Promise<UserEntitlementSummary | null> {
  const supabase = getSupabaseAdmin()
  const related = await resolveRelatedUserIds(userId, identity, supabase)

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, product_id, product_name, amount, created_at")
    .in("user_id", related.userIds)
    .eq("status", "paid")
    .gt("amount", 0)
    .in("product_id", MEMBERSHIP_PRODUCT_IDS)
    .order("created_at", { ascending: false })
    .limit(1)

  if (orderError) throw orderError

  const { data: creditRows, error: creditError } = await supabase
    .from("user_credits")
    .select("user_id, credits, is_pro")
    .in("user_id", related.userIds)

  if (creditError) throw creditError

  const latestMembershipOrder = orders?.[0] || null
  const orderMembershipStatus = isSubscribedUser(latestMembershipOrder?.product_id || null)
    ? latestMembershipOrder.product_id
    : null
  const orderCreditRow = latestMembershipOrder
    ? creditRows?.find((row) => row.user_id === latestMembershipOrder.user_id)
    : null
  const currentCreditRow = creditRows?.find((row) => row.user_id === userId)
  const proCreditRow = creditRows?.find((row) => resolveMembershipStatus({ is_pro: row?.is_pro }))
  const selectedCreditRow = orderCreditRow || proCreditRow || currentCreditRow || creditRows?.[0] || null
  const membershipStatus = orderMembershipStatus || resolveMembershipStatus({ is_pro: proCreditRow?.is_pro }) || null

  if (!selectedCreditRow && !latestMembershipOrder) return null

  return {
    userId,
    entitlementUserId: selectedCreditRow?.user_id || latestMembershipOrder?.user_id || userId,
    relatedUserIds: related.userIds,
    credits: Number(selectedCreditRow?.credits || 0),
    isPro: Boolean(membershipStatus || selectedCreditRow?.is_pro),
    membershipStatus,
    latestMembershipOrder: latestMembershipOrder
      ? {
          id: latestMembershipOrder.id,
          user_id: latestMembershipOrder.user_id,
          product_id: latestMembershipOrder.product_id,
          product_name: latestMembershipOrder.product_name,
          amount: latestMembershipOrder.amount,
          created_at: latestMembershipOrder.created_at,
        }
      : null,
  }
}
