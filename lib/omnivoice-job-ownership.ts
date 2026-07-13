import { getSupabaseAdmin } from "@/lib/supabase-admin"

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SAFE_OMNIVOICE_AUDIO_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}\.(?:wav|mp3|flac|opus)$/i

export function isOmniVoiceJobId(value: string) {
  return JOB_ID_PATTERN.test(value)
}

export async function createOmniVoiceJobOwner(jobId: string, userId: string) {
  if (!isOmniVoiceJobId(jobId) || !userId.trim()) return false

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from("omnivoice_job_owners")
    .insert({ job_id: jobId, user_id: userId })

  if (!error) return true

  const { data } = await supabase
    .from("omnivoice_job_owners")
    .select("job_id")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  return Boolean(data?.job_id)
}

export async function isOmniVoiceJobOwner(jobId: string, userId: string) {
  if (!isOmniVoiceJobId(jobId) || !userId.trim()) return false

  const { data, error } = await getSupabaseAdmin()
    .from("omnivoice_job_owners")
    .select("job_id")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.job_id)
}

export async function linkOmniVoiceJobMedia(jobId: string, userId: string, filename: string) {
  if (!isOmniVoiceJobId(jobId) || !userId.trim() || !SAFE_OMNIVOICE_AUDIO_FILENAME.test(filename)) return false

  const { data, error } = await getSupabaseAdmin()
    .from("omnivoice_job_owners")
    .update({ audio_filename: filename, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .select("job_id")
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.job_id)
}

export async function isOmniVoiceMediaOwner(filename: string, userId: string) {
  if (!SAFE_OMNIVOICE_AUDIO_FILENAME.test(filename) || !userId.trim()) return false

  const { data, error } = await getSupabaseAdmin()
    .from("omnivoice_job_owners")
    .select("job_id")
    .eq("audio_filename", filename)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.job_id)
}
