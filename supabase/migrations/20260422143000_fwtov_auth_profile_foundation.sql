alter table if exists public.users
  add column if not exists email text,
  add column if not exists free_trial_used_at timestamptz;

create unique index if not exists users_auth_user_id_unique_idx
  on public.users(auth_user_id)
  where auth_user_id is not null;

create index if not exists users_email_idx
  on public.users(email)
  where email is not null;
