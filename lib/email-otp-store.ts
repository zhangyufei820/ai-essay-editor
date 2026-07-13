import { createHmac } from "crypto"
import { createClient } from "@supabase/supabase-js"

export type EmailOtpVerificationResult = "valid" | "invalid" | "expired" | "too_many_attempts" | "missing"

type EmailOtpRpcClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

const VERIFICATION_RESULTS = new Set<EmailOtpVerificationResult>([
  "valid",
  "invalid",
  "expired",
  "too_many_attempts",
  "missing",
])

function digest(secret: string, namespace: string, value: string) {
  return createHmac("sha256", secret).update(`${namespace}:${value}`).digest("hex")
}

function challengeDigests(secret: string, email: string, code?: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const emailHash = digest(secret, "email", normalizedEmail)
  return {
    emailHash,
    codeDigest: code === undefined ? undefined : digest(secret, "code", `${emailHash}:${code}`),
  }
}

function storeUnavailable(): never {
  throw new Error("EMAIL_OTP_STORE_UNAVAILABLE")
}

export function createEmailOtpStore(client: EmailOtpRpcClient, signingSecret: string) {
  if (!signingSecret) storeUnavailable()

  return {
    async set(email: string, code: string, expiresInMs = 5 * 60 * 1000) {
      const { emailHash, codeDigest } = challengeDigests(signingSecret, email, code)
      const { data, error } = await client.rpc("upsert_email_otp_challenge", {
        p_email_hash: emailHash,
        p_code_digest: codeDigest,
        p_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
      })
      if (error || typeof data !== "boolean") storeUnavailable()
      return data
    },

    async verify(email: string, code: string): Promise<EmailOtpVerificationResult> {
      const { emailHash, codeDigest } = challengeDigests(signingSecret, email, code)
      const { data, error } = await client.rpc("verify_email_otp_challenge", {
        p_email_hash: emailHash,
        p_code_digest: codeDigest,
      })
      if (error || typeof data !== "string" || !VERIFICATION_RESULTS.has(data as EmailOtpVerificationResult)) {
        storeUnavailable()
      }
      return data as EmailOtpVerificationResult
    },

    async delete(email: string) {
      const { emailHash } = challengeDigests(signingSecret, email)
      const { error } = await client.rpc("delete_email_otp_challenge", {
        p_email_hash: emailHash,
      })
      if (error) storeUnavailable()
    },
  }
}

let singleton: ReturnType<typeof createEmailOtpStore> | undefined

function getEmailOtpStore() {
  if (singleton) return singleton

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  const signingSecret = process.env.EMAIL_OTP_HMAC_SECRET || process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || ""
  if (!supabaseUrl || !serviceRoleKey || !signingSecret) storeUnavailable()

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as EmailOtpRpcClient
  singleton = createEmailOtpStore(client, signingSecret)
  return singleton
}

export const emailOTPStore = {
  set(email: string, code: string, expiresInMs?: number) {
    return getEmailOtpStore().set(email, code, expiresInMs)
  },
  verify(email: string, code: string) {
    return getEmailOtpStore().verify(email, code)
  },
  delete(email: string) {
    return getEmailOtpStore().delete(email)
  },
}
