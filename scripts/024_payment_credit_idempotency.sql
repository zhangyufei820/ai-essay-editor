BEGIN;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS balance_before INTEGER,
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

DO $migration$
DECLARE
  reference_type TEXT;
BEGIN
  SELECT data_type
    INTO reference_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND column_name = 'reference_id';

  IF reference_type IS NULL THEN
    ALTER TABLE public.credit_transactions ADD COLUMN reference_id TEXT;
  ELSIF reference_type <> 'text' THEN
    ALTER TABLE public.credit_transactions
      ALTER COLUMN reference_id TYPE TEXT USING reference_id::TEXT;
  END IF;
END;
$migration$;

CREATE TABLE IF NOT EXISTS public.payment_credit_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  order_no TEXT,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'applied')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  PRIMARY KEY (provider, event_id),
  UNIQUE (provider, reference_id)
);

ALTER TABLE public.payment_credit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_credit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_credit_events TO service_role;

CREATE OR REPLACE FUNCTION public.grant_payment_credits_once(
  p_provider TEXT,
  p_event_id TEXT,
  p_reference_id TEXT,
  p_order_no TEXT,
  p_user_id TEXT,
  p_product_id TEXT,
  p_credits INTEGER,
  p_is_pro BOOLEAN,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(applied BOOLEAN, balance_before INTEGER, balance_after INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_event BOOLEAN := FALSE;
  current_balance INTEGER := 0;
  next_balance INTEGER := 0;
  order_status TEXT;
  order_user_id TEXT;
  existing_event public.payment_credit_events%ROWTYPE;
BEGIN
  IF p_provider NOT IN ('stripe', 'xunhupay') THEN
    RAISE EXCEPTION 'unsupported payment provider';
  END IF;
  IF p_event_id IS NULL OR BTRIM(p_event_id) = '' OR p_reference_id IS NULL OR BTRIM(p_reference_id) = '' THEN
    RAISE EXCEPTION 'payment event identity is required';
  END IF;
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'credits must be positive';
  END IF;
  IF p_user_id IS NULL OR BTRIM(p_user_id) = '' THEN
    RAISE EXCEPTION 'payment user is required';
  END IF;
  IF p_product_id IS NULL OR BTRIM(p_product_id) = '' THEN
    RAISE EXCEPTION 'payment product is required';
  END IF;

  IF p_provider = 'xunhupay' THEN
    SELECT status, user_id::TEXT
      INTO order_status, order_user_id
      FROM public.orders
      WHERE order_no = p_order_no
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment order not found';
    END IF;
    IF order_user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'payment order owner mismatch';
    END IF;
    IF order_status = 'paid' THEN
      SELECT COALESCE(credits, 0) INTO current_balance
        FROM public.user_credits
        WHERE user_id = p_user_id;
      RETURN QUERY SELECT FALSE, current_balance, current_balance;
      RETURN;
    END IF;
    IF order_status <> 'pending' THEN
      RAISE EXCEPTION 'payment order is not pending';
    END IF;
  END IF;

  INSERT INTO public.payment_credit_events (
    provider,
    event_id,
    reference_id,
    order_no,
    user_id,
    product_id,
    credits,
    metadata
  ) VALUES (
    p_provider,
    p_event_id,
    p_reference_id,
    p_order_no,
    p_user_id,
    p_product_id,
    p_credits,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  ON CONFLICT DO NOTHING
  RETURNING TRUE INTO claimed_event;

  IF NOT claimed_event THEN
    SELECT *
      INTO existing_event
      FROM public.payment_credit_events
      WHERE provider = p_provider
        AND (event_id = p_event_id OR reference_id = p_reference_id)
      FOR UPDATE;

    IF NOT FOUND
      OR existing_event.event_id IS DISTINCT FROM p_event_id
      OR existing_event.reference_id IS DISTINCT FROM p_reference_id
      OR existing_event.user_id IS DISTINCT FROM p_user_id
      OR existing_event.product_id IS DISTINCT FROM p_product_id
      OR existing_event.credits IS DISTINCT FROM p_credits THEN
      RAISE EXCEPTION 'payment event identity mismatch';
    END IF;

    SELECT COALESCE(credits, 0) INTO current_balance
      FROM public.user_credits
      WHERE user_id = p_user_id;
    RETURN QUERY SELECT FALSE, current_balance, current_balance;
    RETURN;
  END IF;

  INSERT INTO public.user_credits (user_id, credits, is_pro)
  VALUES (p_user_id, 0, FALSE)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(credits, 0)
    INTO current_balance
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment credit account initialization failed';
  END IF;

  next_balance := current_balance + p_credits;
  IF next_balance > 10000000 THEN
    RAISE EXCEPTION 'payment credit balance limit exceeded';
  END IF;

  UPDATE public.user_credits
    SET credits = next_balance,
        is_pro = COALESCE(is_pro, FALSE) OR COALESCE(p_is_pro, FALSE),
        updated_at = NOW()
    WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    description,
    reference_id,
    balance_before,
    balance_after
  ) VALUES (
    p_user_id,
    p_credits,
    'purchase',
    p_description,
    p_reference_id,
    current_balance,
    next_balance
  );

  IF p_provider = 'xunhupay' THEN
    UPDATE public.orders
      SET status = 'paid',
          trade_no = COALESCE(NULLIF(p_metadata->>'trade_no', ''), trade_no),
          paid_at = COALESCE(paid_at, NOW()),
          updated_at = NOW()
      WHERE order_no = p_order_no
        AND status = 'pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment order claim failed';
    END IF;
  END IF;

  UPDATE public.payment_credit_events
    SET status = 'applied', applied_at = NOW()
    WHERE provider = p_provider AND event_id = p_event_id;

  RETURN QUERY SELECT TRUE, current_balance, next_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_payment_credits_once(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_payment_credits_once(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, JSONB) TO service_role;

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.grant_payment_credits_once(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, JSONB);
-- DROP TABLE IF EXISTS public.payment_credit_events;
