alter table if exists public.live_sessions
  add column if not exists ended_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'live_sessions_ended_reason_check'
  ) then
    alter table public.live_sessions
      add constraint live_sessions_ended_reason_check
      check (
        ended_reason is null
        or ended_reason in ('ended_user', 'ended_payment_required', 'ended_timeout', 'ended_failure')
      );
  end if;
end $$;

update public.live_sessions
set ended_reason = 'ended_user'
where status = 'ended' and ended_reason is null;
