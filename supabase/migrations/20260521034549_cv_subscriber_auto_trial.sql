create or replace function public.ensure_cv_subscriber(
  p_auth_user_id uuid,
  p_email text
)
returns public.cv_subscribers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber public.cv_subscribers;
begin
  insert into public.cv_subscribers (
    auth_user_id,
    email,
    trial_started_at,
    trial_ends_at,
    status
  )
  values (
    p_auth_user_id,
    nullif(p_email, ''),
    now(),
    now() + interval '7 days',
    'trialing'
  )
  on conflict (auth_user_id) do update
    set email = coalesce(excluded.email, public.cv_subscribers.email)
  returning * into v_subscriber;

  return v_subscriber;
end;
$$;

grant execute on function public.ensure_cv_subscriber(uuid, text)
  to authenticated, service_role;
