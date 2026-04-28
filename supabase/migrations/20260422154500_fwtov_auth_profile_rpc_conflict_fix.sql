do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_user_id_key'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

create or replace function public.ensure_fwtov_user(
  p_auth_user_id uuid,
  p_external_user_id text,
  p_email text,
  p_handle text
)
returns table (
  id uuid,
  auth_user_id uuid,
  external_user_id text,
  email text,
  credits_cents bigint,
  free_trial_used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_auth_user_id is null then
    raise exception 'auth user id is required';
  end if;

  return query
  insert into public.users (
    id,
    auth_user_id,
    external_user_id,
    email,
    handle,
    credits_cents,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    p_auth_user_id,
    p_external_user_id,
    p_email,
    p_handle,
    0,
    now(),
    now()
  )
  on conflict on constraint users_auth_user_id_key
  do update set
    external_user_id = excluded.external_user_id,
    email = excluded.email,
    updated_at = now()
  returning
    users.id,
    users.auth_user_id,
    users.external_user_id,
    users.email,
    users.credits_cents,
    users.free_trial_used_at;
end;
$$;

revoke all on function public.ensure_fwtov_user(uuid, text, text, text) from public;
grant execute on function public.ensure_fwtov_user(uuid, text, text, text) to service_role;
