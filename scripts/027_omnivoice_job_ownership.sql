BEGIN;

CREATE TABLE IF NOT EXISTS public.omnivoice_job_owners (
  job_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  audio_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  CHECK (job_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CHECK (LENGTH(user_id) BETWEEN 1 AND 200),
  CHECK (audio_filename IS NULL OR audio_filename ~* '^[a-z0-9][a-z0-9._-]{0,160}\.(wav|mp3|flac|opus)$')
);

CREATE UNIQUE INDEX IF NOT EXISTS omnivoice_job_owners_audio_filename_idx
  ON public.omnivoice_job_owners (audio_filename)
  WHERE audio_filename IS NOT NULL;
CREATE INDEX IF NOT EXISTS omnivoice_job_owners_user_expires_idx
  ON public.omnivoice_job_owners (user_id, expires_at);

ALTER TABLE public.omnivoice_job_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.omnivoice_job_owners FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnivoice_job_owners TO service_role;

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS public.omnivoice_job_owners;
