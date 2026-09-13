BEGIN;

CREATE OR REPLACE FUNCTION public.spend_real_credits_atomic(p_user_id text, p_amount integer, p_type text, p_description text, p_reference_id text DEFAULT NULL::text, p_billing_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(spent boolean, balance_before integer, balance_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resolved_user_id TEXT;
  current_balance INTEGER;
  next_balance INTEGER;
  transaction_metadata JSONB;
BEGIN
  IF p_user_id IS NULL OR BTRIM(p_user_id) = '' OR LENGTH(p_user_id) > 200 THEN
    RAISE EXCEPTION 'invalid credit user';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'invalid credit amount';
  END IF;
  IF p_type IS NULL OR BTRIM(p_type) = '' OR LENGTH(p_type) > 100 THEN
    RAISE EXCEPTION 'invalid credit transaction type';
  END IF;
  IF p_description IS NULL OR LENGTH(p_description) > 1000 THEN
    RAISE EXCEPTION 'invalid credit transaction description';
  END IF;
  IF p_reference_id IS NOT NULL AND LENGTH(p_reference_id) > 500 THEN
    RAISE EXCEPTION 'invalid credit reference';
  END IF;

  SELECT a.credit_user_id INTO resolved_user_id
    FROM public.ensure_credit_account(p_user_id) a;

  SELECT COALESCE(credits, 0)
    INTO current_balance
    FROM public.user_credits
    WHERE user_id = resolved_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit account initialization failed';
  END IF;

  IF current_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, current_balance, current_balance;
    RETURN;
  END IF;

  next_balance := current_balance - p_amount;
  transaction_metadata := COALESCE(p_billing_metadata, '{}'::JSONB) || jsonb_build_object(
    'userId', resolved_user_id,
    'requestedUserId', p_user_id,
    'actionType', p_type,
    'chargedCredits', p_amount,
    'balanceBefore', current_balance,
    'balanceAfter', next_balance,
    'requestId', p_reference_id,
    'conversationId', COALESCE(p_billing_metadata->>'conversationId', p_reference_id),
    'description', p_description
  );

  UPDATE public.user_credits
    SET credits = next_balance,
        updated_at = NOW()
    WHERE user_id = resolved_user_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    description,
    reference_id,
    balance_before,
    balance_after,
    billing_metadata
  ) VALUES (
    resolved_user_id,
    -p_amount,
    p_type,
    p_description,
    p_reference_id,
    current_balance,
    next_balance,
    transaction_metadata
  );

  RETURN QUERY SELECT TRUE, current_balance, next_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.spend_real_credits_atomic(TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_real_credits_atomic(TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;

-- Rollback: restore the previous function definition from scripts/025_atomic_real_credit_spending.sql.
