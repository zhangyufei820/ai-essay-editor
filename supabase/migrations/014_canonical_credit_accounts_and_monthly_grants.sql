BEGIN;

-- Resolve only persisted identity bridges. Account initialization, legacy
-- transfer and its ledger entries all commit or roll back together.
CREATE OR REPLACE FUNCTION public.ensure_credit_account(p_user_id TEXT, p_initial_credits INTEGER DEFAULT 1000)
RETURNS TABLE(credit_user_id TEXT, credits INTEGER, is_pro BOOLEAN, initialized BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  source_id TEXT;
  target_id TEXT;
  resolved_id TEXT;
  created_id TEXT;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' OR length(p_user_id) > 200 THEN
    RAISE EXCEPTION 'invalid credit user';
  END IF;
  IF p_initial_credits IS NULL OR p_initial_credits NOT IN (0, 1000) THEN
    RAISE EXCEPTION 'invalid credit initialization amount';
  END IF;

  SELECT provider_user_id, supabase_user_id::TEXT INTO source_id, target_id
    FROM public.auth_user_bridges
    WHERE provider = 'authing'
      AND (provider_user_id = p_user_id OR supabase_user_id::TEXT = p_user_id);
  resolved_id := COALESCE(target_id, p_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('credit-account:' || resolved_id, 0));

  IF source_id IS NOT NULL THEN
    PERFORM 1 FROM public.merge_bridged_user_credits(source_id, target_id);
  END IF;

  INSERT INTO public.user_credits (user_id, credits, is_pro)
    VALUES (resolved_id, p_initial_credits, FALSE)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id INTO created_id;

  IF created_id IS NOT NULL AND p_initial_credits > 0 THEN
    INSERT INTO public.credit_transactions
      (user_id, amount, type, description, reference_id, balance_before, balance_after)
    VALUES (resolved_id, 1000, 'register', '新用户注册赠送',
      'credit-initialization:' || resolved_id, 0, 1000);
  END IF;

  RETURN QUERY SELECT c.user_id, c.credits, c.is_pro, created_id IS NOT NULL
    FROM public.user_credits c WHERE c.user_id = resolved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_credit_account(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_credit_account(TEXT, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.membership_credit_grants (
  order_id BIGINT NOT NULL REFERENCES public.orders(id),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 11),
  credit_user_id TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0 AND credits <= 1000000),
  status TEXT NOT NULL CHECK (status IN ('applied', 'reconciled')),
  transaction_id INTEGER REFERENCES public.credit_transactions(id),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, period)
);
ALTER TABLE public.membership_credit_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_credit_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.membership_credit_grants TO service_role;

CREATE OR REPLACE FUNCTION public.grant_membership_credits_once(
  p_order_id BIGINT, p_period INTEGER, p_credits INTEGER, p_description TEXT
)
RETURNS TABLE(applied BOOLEAN, credit_user_id TEXT, balance_before INTEGER, balance_after INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  paid_order public.orders%ROWTYPE;
  existing_grant public.membership_credit_grants%ROWTYPE;
  account_id TEXT;
  before_balance INTEGER;
  after_balance INTEGER;
  ledger_id INTEGER;
  recorded_amount INTEGER;
  grant_reference TEXT;
BEGIN
  IF p_period IS NULL OR p_period NOT BETWEEN 1 AND 11
    OR p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 1000000
    OR p_description IS NULL OR length(p_description) > 1000 THEN
    RAISE EXCEPTION 'invalid membership grant';
  END IF;
  SELECT * INTO paid_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(paid_order.status, '') <> 'paid' OR COALESCE(paid_order.amount, 0) <= 0
    OR COALESCE(paid_order.product_id, '') NOT IN ('basic', 'pro', 'premium') THEN
    RAISE EXCEPTION 'membership order is not eligible';
  END IF;
  IF paid_order.created_at IS NULL OR paid_order.created_at + make_interval(months => p_period) > now() THEN
    RAISE EXCEPTION 'membership grant is not due';
  END IF;

  SELECT * INTO existing_grant FROM public.membership_credit_grants
    WHERE order_id = p_order_id AND period = p_period;
  IF FOUND THEN
    IF existing_grant.credits <> p_credits THEN
      RAISE EXCEPTION 'membership grant amount mismatch';
    END IF;
    SELECT c.credits INTO before_balance FROM public.user_credits c
      WHERE c.user_id = existing_grant.credit_user_id;
    RETURN QUERY SELECT FALSE, existing_grant.credit_user_id, before_balance, before_balance;
    RETURN;
  END IF;

  SELECT a.credit_user_id INTO account_id FROM public.ensure_credit_account(paid_order.user_id, 0) a;
  SELECT c.credits INTO before_balance FROM public.user_credits c
    WHERE c.user_id = account_id FOR UPDATE;
  after_balance := before_balance + p_credits;
  IF after_balance > 10000000 THEN RAISE EXCEPTION 'membership credit balance limit exceeded'; END IF;
  grant_reference := 'membership_monthly:' || p_order_id || ':' || p_period;

  -- Existing historical ledger entries also count, regardless of their identity.
  SELECT id, amount INTO ledger_id, recorded_amount FROM public.credit_transactions
    WHERE reference_id = grant_reference LIMIT 1;
  IF FOUND THEN
    IF recorded_amount <> p_credits THEN
      RAISE EXCEPTION 'historical membership grant amount mismatch';
    END IF;
    INSERT INTO public.membership_credit_grants
      (order_id, period, credit_user_id, credits, status, transaction_id, metadata)
    VALUES (p_order_id, p_period, account_id, p_credits, 'reconciled', ledger_id,
      jsonb_build_object('source', 'existing_membership_ledger'));
    RETURN QUERY SELECT FALSE, account_id, before_balance, before_balance;
    RETURN;
  END IF;

  UPDATE public.user_credits SET credits = after_balance, is_pro = TRUE, updated_at = now()
    WHERE user_id = account_id;
  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, reference_id, balance_before, balance_after, order_id, billing_metadata)
  VALUES (account_id, p_credits, 'bonus', p_description, grant_reference,
    before_balance, after_balance, p_order_id,
    jsonb_build_object('source', 'membership_monthly', 'orderId', p_order_id, 'period', p_period))
  RETURNING id INTO ledger_id;
  INSERT INTO public.membership_credit_grants
    (order_id, period, credit_user_id, credits, status, transaction_id)
  VALUES (p_order_id, p_period, account_id, p_credits, 'applied', ledger_id);
  RETURN QUERY SELECT TRUE, account_id, before_balance, after_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_membership_credits_once(BIGINT, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_membership_credits_once(BIGINT, INTEGER, INTEGER, TEXT) TO service_role;

COMMIT;

-- Rollback: first restore the previous application/spending function, then drop
-- these two functions. Preserve membership_credit_grants and its audit records
-- so that a future rollout cannot grant historical periods twice.
