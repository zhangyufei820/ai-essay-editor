-- =============================================
-- Database governance phase 1
-- Low-risk hardening candidates for Supabase PostgreSQL.
--
-- IMPORTANT:
-- - Review docs/DATABASE-GOVERNANCE-AUDIT.md before running.
-- - This script intentionally avoids tightening broad user-facing RLS policies.
-- - It focuses on server-only admin tables and missing FK indexes.
-- - Run against production only after checking admin login, credits admin flows,
--   and recent database backup status.
-- =============================================

BEGIN;

-- Server-only tables should not be directly accessible by anon/authenticated
-- clients. Service role bypasses RLS in Supabase, but these explicit policies
-- document intent and protect non-bypass roles.
ALTER TABLE public.admin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_tokens'
      AND policyname = 'admin_tokens_service_role_only'
  ) THEN
    CREATE POLICY admin_tokens_service_role_only
      ON public.admin_tokens
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_actions'
      AND policyname = 'admin_actions_service_role_only'
  ) THEN
    CREATE POLICY admin_actions_service_role_only
      ON public.admin_actions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_adjustments'
      AND policyname = 'credit_adjustments_service_role_only'
  ) THEN
    CREATE POLICY credit_adjustments_service_role_only
      ON public.credit_adjustments
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Missing FK/support indexes. These are additive and reversible.
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
  ON public.chat_messages(session_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_order_id
  ON public.credit_transactions(order_id);

CREATE INDEX IF NOT EXISTS idx_flashcards_source_file_id
  ON public.flashcards(source_file_id);

CREATE INDEX IF NOT EXISTS idx_teacher_agents_teacher
  ON public.teacher_agents(teacher_id);

COMMIT;

-- Verification
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('admin_tokens', 'admin_actions', 'credit_adjustments')
ORDER BY tablename;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('admin_tokens', 'admin_actions', 'credit_adjustments')
ORDER BY tablename, policyname;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_chat_messages_session_id',
    'idx_credit_transactions_order_id',
    'idx_flashcards_source_file_id',
    'idx_teacher_agents_teacher'
  )
ORDER BY tablename, indexname;
