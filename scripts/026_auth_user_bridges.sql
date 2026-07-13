BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_user_bridges (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  supabase_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_user_id),
  UNIQUE (provider, supabase_user_id),
  CHECK (provider ~ '^[a-z0-9_-]{1,40}$'),
  CHECK (LENGTH(provider_user_id) BETWEEN 1 AND 200)
);

INSERT INTO public.auth_user_bridges (provider, provider_user_id, supabase_user_id)
SELECT
  'authing',
  raw_user_meta_data->>'authing_user_id',
  id
FROM auth.users
WHERE NULLIF(BTRIM(raw_user_meta_data->>'authing_user_id'), '') IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;

ALTER TABLE public.auth_user_bridges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_user_bridges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_user_bridges TO service_role;

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS public.auth_user_bridges;
