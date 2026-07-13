BEGIN;

CREATE TABLE IF NOT EXISTS public.email_otp_challenges (
  email_hash TEXT PRIMARY KEY CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  code_digest TEXT NOT NULL CHECK (code_digest ~ '^[a-f0-9]{64}$'),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.email_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_otp_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_otp_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_email_otp_challenge(
  p_email_hash TEXT,
  p_code_digest TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  existing_created_at TIMESTAMPTZ;
BEGIN
  IF p_email_hash !~ '^[a-f0-9]{64}$'
     OR p_code_digest !~ '^[a-f0-9]{64}$'
     OR p_expires_at <= NOW()
     OR p_expires_at > NOW() + INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'invalid email OTP challenge';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_hash, 0));

  SELECT created_at
    INTO existing_created_at
    FROM public.email_otp_challenges
   WHERE email_hash = p_email_hash
   FOR UPDATE;

  IF FOUND AND existing_created_at > NOW() - INTERVAL '60 seconds' THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.email_otp_challenges (
    email_hash,
    code_digest,
    attempts,
    expires_at,
    created_at
  ) VALUES (
    p_email_hash,
    p_code_digest,
    0,
    p_expires_at,
    NOW()
  )
  ON CONFLICT (email_hash) DO UPDATE SET
    code_digest = EXCLUDED.code_digest,
    attempts = 0,
    expires_at = EXCLUDED.expires_at,
    created_at = NOW();

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_email_otp_challenge(
  p_email_hash TEXT,
  p_code_digest TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  challenge public.email_otp_challenges%ROWTYPE;
  next_attempts INTEGER;
BEGIN
  IF p_email_hash !~ '^[a-f0-9]{64}$' OR p_code_digest !~ '^[a-f0-9]{64}$' THEN
    RETURN 'missing';
  END IF;

  SELECT *
    INTO challenge
    FROM public.email_otp_challenges
   WHERE email_hash = p_email_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF challenge.expires_at <= NOW() THEN
    DELETE FROM public.email_otp_challenges WHERE email_hash = p_email_hash;
    RETURN 'expired';
  END IF;

  IF challenge.attempts >= 5 THEN
    DELETE FROM public.email_otp_challenges WHERE email_hash = p_email_hash;
    RETURN 'too_many_attempts';
  END IF;

  IF challenge.code_digest = p_code_digest THEN
    DELETE FROM public.email_otp_challenges WHERE email_hash = p_email_hash;
    RETURN 'valid';
  END IF;

  UPDATE public.email_otp_challenges
     SET attempts = attempts + 1
   WHERE email_hash = p_email_hash
   RETURNING attempts INTO next_attempts;

  IF next_attempts >= 5 THEN
    DELETE FROM public.email_otp_challenges WHERE email_hash = p_email_hash;
    RETURN 'too_many_attempts';
  END IF;

  RETURN 'invalid';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email_otp_challenge(p_email_hash TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.email_otp_challenges
   WHERE email_hash = p_email_hash
     AND p_email_hash ~ '^[a-f0-9]{64}$';
$$;

CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT id
    FROM auth.users
   WHERE email = LOWER(BTRIM(lookup_email))
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.upsert_email_otp_challenge(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_email_otp_challenge(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email_otp_challenge(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_email_otp_challenge(TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_email_otp_challenge(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email_otp_challenge(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(TEXT) TO service_role;

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.find_auth_user_id_by_email(TEXT);
-- DROP FUNCTION IF EXISTS public.delete_email_otp_challenge(TEXT);
-- DROP FUNCTION IF EXISTS public.verify_email_otp_challenge(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.upsert_email_otp_challenge(TEXT, TEXT, TIMESTAMPTZ);
-- DROP TABLE IF EXISTS public.email_otp_challenges;
