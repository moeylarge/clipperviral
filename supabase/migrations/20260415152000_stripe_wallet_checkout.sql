create unique index if not exists payments_provider_payment_id_idx
  on payments(provider, provider_payment_id)
  where provider_payment_id is not null;

create or replace function apply_wallet_credit(
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
  from payments
  where provider = p_provider
    and provider_payment_id = p_provider_payment_id
  limit 1;

  if existing_payment_id is not null then
    select credits_cents into next_balance
    from users
    where id = p_user_id;

    return coalesce(next_balance, 0);
  end if;

  update users
  set
    credits_cents = credits_cents + p_credited_cents,
    updated_at = now()
  where id = p_user_id
  returning credits_cents into next_balance;

  insert into payments (
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
    gen_random_uuid(),
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
