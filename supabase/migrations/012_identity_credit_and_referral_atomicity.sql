begin;

create unique index if not exists idx_referrals_unique_referee
  on public.referrals (referee_id);

create or replace function public.merge_bridged_user_credits(
  p_source_user_id text,
  p_target_user_id text
)
returns table(
  applied boolean,
  source_balance_before integer,
  target_balance_before integer,
  target_balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  source_balance integer := 0;
  target_balance integer := 0;
  source_is_pro boolean := false;
  target_is_pro boolean := false;
  source_account_exists boolean := false;
  merged_balance integer := 0;
  transfer_reference text;
begin
  if p_source_user_id is null or btrim(p_source_user_id) = '' or length(p_source_user_id) > 200 then
    raise exception 'invalid source credit user';
  end if;
  if p_target_user_id is null or btrim(p_target_user_id) = '' or length(p_target_user_id) > 200 then
    raise exception 'invalid target credit user';
  end if;
  if p_source_user_id = p_target_user_id then
    return query select false, 0, 0, 0;
    return;
  end if;

  select coalesce(credits, 0), coalesce(is_pro, false)
    into source_balance, source_is_pro
    from public.user_credits
    where user_id = p_source_user_id
    for update;

  source_account_exists := found;
  if not source_account_exists then
    return query select false, 0, 0, 0;
    return;
  end if;

  insert into public.user_credits (user_id, credits, is_pro)
  values (p_target_user_id, 0, false)
  on conflict (user_id) do nothing;

  select coalesce(credits, 0), coalesce(is_pro, false)
    into target_balance, target_is_pro
    from public.user_credits
    where user_id = p_target_user_id
    for update;

  if not found then
    raise exception 'target credit account initialization failed';
  end if;

  if source_balance <= 0 and not source_is_pro then
    return query select false, source_balance, target_balance, target_balance;
    return;
  end if;

  merged_balance := target_balance + source_balance;
  if merged_balance > 10000000 then
    raise exception 'merged credit balance limit exceeded';
  end if;

  update public.user_credits
    set credits = 0,
        is_pro = false,
        updated_at = now()
    where user_id = p_source_user_id;

  update public.user_credits
    set credits = merged_balance,
        is_pro = target_is_pro or source_is_pro,
        updated_at = now()
    where user_id = p_target_user_id;

  if source_balance > 0 then
    transfer_reference := 'identity-merge:' || p_source_user_id || ':' || p_target_user_id;

    insert into public.credit_transactions (
      user_id, amount, type, description, reference_id, balance_before, balance_after
    ) values (
      p_source_user_id,
      -source_balance,
      'manual',
      '账号合并：积分转入统一会员账户',
      transfer_reference || ':out',
      source_balance,
      0
    );

    insert into public.credit_transactions (
      user_id, amount, type, description, reference_id, balance_before, balance_after
    ) values (
      p_target_user_id,
      source_balance,
      'manual',
      '账号合并：保留原账号积分',
      transfer_reference || ':in',
      target_balance,
      merged_balance
    );
  end if;

  return query select true, source_balance, target_balance, merged_balance;
end;
$$;

revoke all on function public.merge_bridged_user_credits(text, text) from public, anon, authenticated;
grant execute on function public.merge_bridged_user_credits(text, text) to service_role;

create or replace function public.grant_referral_credits_once(
  p_referee_id text,
  p_referral_code text
)
returns table(
  applied boolean,
  referrer_id text,
  referrer_reward integer,
  referee_reward integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_referrer_id text;
  existing_referral public.referrals%rowtype;
  has_existing_referral boolean := false;
  current_referrer_reward integer := 0;
  actual_referrer_reward integer := 0;
  configured_reward constant integer := 1000;
  configured_referrer_limit constant integer := 50000;
  referrer_balance integer := 0;
  referee_balance integer := 0;
begin
  if p_referee_id is null or btrim(p_referee_id) = '' or length(p_referee_id) > 200 then
    raise exception 'invalid referral user';
  end if;
  if p_referral_code is null or btrim(p_referral_code) = '' or length(p_referral_code) > 100 then
    raise exception 'invalid referral code';
  end if;

  select coalesce(bridge.supabase_user_id::text, rc.user_id)
    into resolved_referrer_id
    from public.referral_codes as rc
    left join public.auth_user_bridges as bridge
      on bridge.provider = 'authing'
     and bridge.provider_user_id = rc.user_id
    where rc.code = btrim(p_referral_code)
    for update of rc;

  if not found then
    raise exception 'referral code not found';
  end if;
  if resolved_referrer_id = p_referee_id then
    raise exception 'self referral is not allowed';
  end if;

  select *
    into existing_referral
    from public.referrals as r
    where r.referee_id = p_referee_id
    for update;

  has_existing_referral := found;

  if has_existing_referral and existing_referral.status = 'completed' then
    return query select false, existing_referral.referrer_id, existing_referral.reward_credits, configured_reward;
    return;
  end if;
  if has_existing_referral and (
    existing_referral.referrer_id is distinct from resolved_referrer_id
    or existing_referral.referral_code is distinct from btrim(p_referral_code)
  ) then
    raise exception 'referral identity mismatch';
  end if;

  select coalesce(sum(reward_credits), 0)
    into current_referrer_reward
    from public.referrals as r
    where r.referrer_id = resolved_referrer_id
      and r.status = 'completed';

  actual_referrer_reward := greatest(
    0,
    least(configured_reward, configured_referrer_limit - current_referrer_reward)
  );

  if not has_existing_referral then
    insert into public.referrals (
      referrer_id, referee_id, referral_code, reward_credits, status
    ) values (
      resolved_referrer_id, p_referee_id, btrim(p_referral_code), actual_referrer_reward, 'pending'
    );
  else
    update public.referrals as r
      set reward_credits = actual_referrer_reward,
          status = 'pending',
          completed_at = null,
          updated_at = now()
      where r.referee_id = p_referee_id;
  end if;

  insert into public.user_credits (user_id, credits, is_pro)
  values (resolved_referrer_id, 1000, false)
  on conflict (user_id) do nothing;

  insert into public.user_credits (user_id, credits, is_pro)
  values (p_referee_id, 1000, false)
  on conflict (user_id) do nothing;

  perform 1
    from public.user_credits
    where user_id in (resolved_referrer_id, p_referee_id)
    order by user_id
    for update;

  select coalesce(credits, 0)
    into referrer_balance
    from public.user_credits
    where user_id = resolved_referrer_id;

  select coalesce(credits, 0)
    into referee_balance
    from public.user_credits
    where user_id = p_referee_id;

  if referrer_balance + actual_referrer_reward > 10000000
    or referee_balance + configured_reward > 10000000 then
    raise exception 'referral credit balance limit exceeded';
  end if;

  if actual_referrer_reward > 0 then
    update public.user_credits
      set credits = referrer_balance + actual_referrer_reward,
          updated_at = now()
      where user_id = resolved_referrer_id;

    insert into public.credit_transactions (
      user_id, amount, type, description, reference_id, balance_before, balance_after
    ) values (
      resolved_referrer_id,
      actual_referrer_reward,
      'bonus',
      '成功邀请好友注册奖励',
      'referral:' || p_referee_id || ':referrer',
      referrer_balance,
      referrer_balance + actual_referrer_reward
    );
  end if;

  update public.user_credits
    set credits = referee_balance + configured_reward,
        updated_at = now()
    where user_id = p_referee_id;

  insert into public.credit_transactions (
    user_id, amount, type, description, reference_id, balance_before, balance_after
  ) values (
    p_referee_id,
    configured_reward,
    'bonus',
    '通过好友邀请完成注册奖励',
    'referral:' || p_referee_id || ':referee',
    referee_balance,
    referee_balance + configured_reward
  );

  update public.referrals as r
    set status = 'completed',
        completed_at = now(),
        updated_at = now()
    where r.referee_id = p_referee_id;

  update public.referral_codes as rc
    set uses = coalesce(uses, 0) + 1,
        updated_at = now()
    where rc.code = btrim(p_referral_code);

  return query select true, resolved_referrer_id, actual_referrer_reward, configured_reward;
end;
$$;

revoke all on function public.grant_referral_credits_once(text, text) from public, anon, authenticated;
grant execute on function public.grant_referral_credits_once(text, text) to service_role;

commit;

-- Rollback:
-- drop function if exists public.grant_referral_credits_once(text, text);
-- drop function if exists public.merge_bridged_user_credits(text, text);
-- drop index if exists public.idx_referrals_unique_referee;
