alter table if exists public.personas enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.shows enable row level security;
alter table if exists public.show_participants enable row level security;
alter table if exists public.queue_entries enable row level security;
alter table if exists public.rounds enable row level security;
alter table if exists public.votes enable row level security;
alter table if exists public.results enable row level security;
alter table if exists public.clips enable row level security;
alter table if exists public.rankings enable row level security;
alter table if exists public.live_sessions enable row level security;
alter table if exists public.session_messages enable row level security;
alter table if exists public.session_transcript_chunks enable row level security;
alter table if exists public.session_usage_events enable row level security;
alter table if exists public.payments enable row level security;
alter table if exists public.persona_metrics_daily enable row level security;

alter table if exists public.ops_operators enable row level security;
alter table if exists public.ops_accounts enable row level security;
alter table if exists public.ops_market_events enable row level security;
alter table if exists public.ops_tickets enable row level security;
alter table if exists public.ops_payout_periods enable row level security;
alter table if exists public.ops_period_statements enable row level security;
alter table if exists public.ops_account_notes enable row level security;
alter table if exists public.ops_wallet_entries enable row level security;
alter table if exists public.ops_ticket_settlements enable row level security;
alter table if exists public.ops_credit_grants enable row level security;
alter table if exists public.ops_ticket_credit_allocations enable row level security;
alter table if exists public.ops_reconciliation_runs enable row level security;
alter table if exists public.ops_reconciliation_issues enable row level security;
alter table if exists public.ops_tasks enable row level security;
alter table if exists public.ops_audit_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'public_read_users') then
    create policy public_read_users on public.users for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'public_read_profiles') then
    create policy public_read_profiles on public.profiles for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shows' and policyname = 'public_read_shows') then
    create policy public_read_shows on public.shows for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'show_participants' and policyname = 'public_read_show_participants') then
    create policy public_read_show_participants on public.show_participants for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'queue_entries' and policyname = 'public_read_queue_entries') then
    create policy public_read_queue_entries on public.queue_entries for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rounds' and policyname = 'public_read_rounds') then
    create policy public_read_rounds on public.rounds for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'votes' and policyname = 'public_read_votes') then
    create policy public_read_votes on public.votes for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'results' and policyname = 'public_read_results') then
    create policy public_read_results on public.results for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clips' and policyname = 'public_read_clips') then
    create policy public_read_clips on public.clips for select to anon, authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rankings' and policyname = 'public_read_rankings') then
    create policy public_read_rankings on public.rankings for select to anon, authenticated using (true);
  end if;
end $$;
