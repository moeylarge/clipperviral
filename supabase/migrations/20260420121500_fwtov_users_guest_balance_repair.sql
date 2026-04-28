alter table if exists public.users
  add column if not exists credits_cents bigint not null default 0;

update public.users
set credits_cents = 0
where credits_cents is null;

alter table if exists public.users
  alter column auth_user_id drop not null;
