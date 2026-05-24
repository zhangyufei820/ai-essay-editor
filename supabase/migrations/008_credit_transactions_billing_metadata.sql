-- Store structured billing audit details for credit transaction rows.
-- Idempotent and non-destructive: existing rows are preserved.

alter table public.credit_transactions
  add column if not exists billing_metadata jsonb;

comment on column public.credit_transactions.billing_metadata is
  'Structured billing audit metadata, including token usage, pricing version, usage source, provider metadata, and request identifiers.';
