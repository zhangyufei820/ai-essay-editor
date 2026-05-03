-- ============================================
-- Add billing metadata to credit transactions
-- ============================================
--
-- Purpose:
--   Store structured billing audit details for text/image/suno deductions.
--
-- Safety:
--   - Idempotent: safe to run multiple times.
--   - Non-destructive: does not rewrite or remove existing rows.
--   - Backward compatible: existing credit transaction queries keep working.

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS billing_metadata JSONB;

COMMENT ON COLUMN credit_transactions.billing_metadata IS
  'Structured billing audit metadata, including token usage, pricing version, usage source, provider metadata, and request identifiers.';
