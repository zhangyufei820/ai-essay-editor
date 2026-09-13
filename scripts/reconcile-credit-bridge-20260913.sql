-- One-time, guarded repair for the four independently audited bridge pairs.
-- Retain already credited balances: no compensation, clawback or order edits.
-- Record the observed unlogged +96000 before merging, and mark the four
-- already attempted monthly periods as reconciled so they cannot be paid again.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  expected RECORD;
  bridge RECORD;
  source_balance INTEGER;
  target_balance INTEGER;
  last_recorded_balance INTEGER;
  main_source TEXT;
  main_target TEXT;
  before_total BIGINT := 0;
  after_total BIGINT := 0;
  period_number INTEGER;
  audit_id INTEGER;
  pair_count INTEGER := 0;
  paid_order public.orders%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.credit_transactions
    WHERE reference_id = 'credit-bridge-remediation:20260913:completed') THEN
    RAISE NOTICE 'Credit bridge remediation already completed; no changes';
    RETURN;
  END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('a4aee27055', 527630, 2491935),
    ('82c87f34ed', 1000, 1000),
    ('44a06417a8', 95, 59),
    ('ff5f0e67d3', 900, 811)
  ) AS v(account_hash, old_balance, canonical_balance)
  LOOP
    SELECT b.provider_user_id, b.supabase_user_id::TEXT AS target_id INTO STRICT bridge
      FROM public.auth_user_bridges b
      WHERE b.provider = 'authing'
        AND left(encode(sha256(convert_to(b.provider_user_id, 'UTF8')), 'hex'), 10) = expected.account_hash
      FOR SHARE;
    PERFORM pg_advisory_xact_lock(hashtextextended('credit-account:' || bridge.target_id, 0));
    SELECT c.credits INTO STRICT source_balance FROM public.user_credits c
      WHERE c.user_id = bridge.provider_user_id FOR UPDATE;
    SELECT c.credits INTO STRICT target_balance FROM public.user_credits c
      WHERE c.user_id = bridge.target_id FOR UPDATE;
    IF source_balance IS DISTINCT FROM expected.old_balance OR target_balance IS DISTINCT FROM expected.canonical_balance THEN
      RAISE EXCEPTION 'Balance changed since audit for account %; rerun read-only preview', expected.account_hash;
    END IF;
    before_total := before_total + source_balance + target_balance;
    pair_count := pair_count + 1;

    IF expected.account_hash = 'a4aee27055' THEN
      main_source := bridge.provider_user_id;
      main_target := bridge.target_id;
      SELECT * INTO STRICT paid_order FROM public.orders WHERE id = 152 FOR UPDATE;
      IF paid_order.user_id IS DISTINCT FROM main_source OR paid_order.status IS DISTINCT FROM 'paid'
        OR paid_order.product_id IS DISTINCT FROM 'premium' OR paid_order.amount IS DISTINCT FROM 1228.8 THEN
        RAISE EXCEPTION 'Audited annual membership order changed';
      END IF;
      SELECT t.balance_after INTO STRICT last_recorded_balance
        FROM public.credit_transactions t WHERE t.user_id = main_source
        ORDER BY t.created_at DESC, t.id DESC LIMIT 1;
      IF last_recorded_balance IS DISTINCT FROM 431630 OR source_balance - last_recorded_balance IS DISTINCT FROM 96000 THEN
        RAISE EXCEPTION 'Observed historical ledger gap changed';
      END IF;
      INSERT INTO public.credit_transactions
        (user_id, amount, type, description, reference_id, balance_before, balance_after, billing_metadata)
      VALUES (main_source, 96000, 'manual', '核对历史会员积分入账：补记已有余额，未新增积分',
        'credit-balance-reconciliation:20260913:' || main_source,
        last_recorded_balance, source_balance,
        jsonb_build_object('source','historical_balance_reconciliation','balanceChanged',false,
          'observedBalance',source_balance,'lastRecordedBalance',last_recorded_balance,
          'evidence','monthly grant updates preceded rejected membership_grant ledger inserts'));

      FOR period_number IN 1..4 LOOP
        -- Zero-value old-identity audit rows also stop the previous application
        -- version's reference check during the deployment transition.
        INSERT INTO public.credit_transactions
          (user_id, amount, type, description, reference_id, balance_before, balance_after, order_id, billing_metadata)
        VALUES (main_source, 0, 'manual', '历史会员积分期次已核对，无新增发放',
          'membership_monthly:152:' || period_number, source_balance, source_balance, 152,
          jsonb_build_object('source','membership_monthly_reconciliation','period',period_number))
        RETURNING id INTO audit_id;
        INSERT INTO public.membership_credit_grants
          (order_id, period, credit_user_id, credits, status, transaction_id, metadata)
        VALUES (152, period_number, main_target, 12000, 'reconciled', audit_id,
          jsonb_build_object('source','credit_audit_20260913','existingBalancePreserved',true));
      END LOOP;
    END IF;

    PERFORM 1 FROM public.merge_bridged_user_credits(bridge.provider_user_id, bridge.target_id);
    SELECT c.credits INTO STRICT source_balance FROM public.user_credits c WHERE c.user_id = bridge.provider_user_id;
    SELECT c.credits INTO STRICT target_balance FROM public.user_credits c WHERE c.user_id = bridge.target_id;
    IF source_balance IS DISTINCT FROM 0 OR target_balance IS DISTINCT FROM expected.old_balance + expected.canonical_balance THEN
      RAISE EXCEPTION 'Credit conservation check failed for account %', expected.account_hash;
    END IF;
    after_total := after_total + source_balance + target_balance;
  END LOOP;
  IF pair_count <> 4 OR before_total IS DISTINCT FROM after_total THEN
    RAISE EXCEPTION 'Credit repair population or total mismatch';
  END IF;
  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, reference_id, balance_before, balance_after, billing_metadata)
  SELECT main_target, 0, 'manual', '账户积分已统一，原有总额保持不变',
    'credit-bridge-remediation:20260913:completed', c.credits, c.credits,
    jsonb_build_object('source','credit_audit_20260913','pairs',pair_count,'totalBefore',before_total,'totalAfter',after_total)
  FROM public.user_credits c WHERE c.user_id = main_target;
  RAISE NOTICE 'Reconciled % pairs; total preserved at % credits', pair_count, after_total;
END;
$$;
COMMIT;

-- Do not reverse transfers after users have spent credits. The before/after
-- values above and the paired ledger entries preserve the audit evidence;
-- any later correction must use a separately reviewed compensating transaction.
