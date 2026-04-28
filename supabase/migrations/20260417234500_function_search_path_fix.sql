create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.apply_wallet_credit(
  p_user_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_cents bigint,
  p_credited_cents bigint,
  p_currency text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  existing_payment_id uuid;
  next_balance bigint;
begin
  if p_credited_cents <= 0 then
    raise exception 'credited cents must be positive';
  end if;

  select id
  into existing_payment_id
  from public.payments
  where provider = p_provider
    and provider_payment_id = p_provider_payment_id
  limit 1;

  if existing_payment_id is not null then
    select credits_cents into next_balance
    from public.users
    where id = p_user_id;

    return coalesce(next_balance, 0);
  end if;

  update public.users
  set
    credits_cents = credits_cents + p_credited_cents,
    updated_at = now()
  where id = p_user_id
  returning credits_cents into next_balance;

  insert into public.payments (
    id,
    user_id,
    provider,
    provider_payment_id,
    amount_cents,
    currency,
    status,
    metadata,
    created_at
  )
  values (
    extensions.gen_random_uuid(),
    p_user_id,
    p_provider,
    p_provider_payment_id,
    p_amount_cents,
    p_currency,
    'succeeded',
    p_metadata || jsonb_build_object('credited_cents', p_credited_cents),
    now()
  );

  return coalesce(next_balance, 0);
end;
$$;
