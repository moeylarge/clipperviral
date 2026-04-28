create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type ops_operator_category as enum ('sportsbook', 'casino');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_account_status as enum ('active', 'paused', 'collections', 'closed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_wallet_type as enum ('cash', 'credit');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_wallet_entry_type as enum (
    'opening_balance',
    'deposit',
    'withdrawal',
    'wager_stake',
    'wager_payout',
    'credit_issue',
    'credit_forfeit',
    'payout_cash_receipt',
    'payout_credit_receipt',
    'manual_adjustment',
    'correction_reverse'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_wallet_entry_status as enum ('pending', 'posted', 'void', 'duplicate', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_source_of_entry as enum ('manual', 'import', 'system');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_event_status as enum ('scheduled', 'live', 'final', 'canceled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_ticket_status as enum ('open', 'partially_settled', 'settled', 'void', 'cashout', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_ticket_settlement_type as enum ('partial', 'final', 'void', 'resettle', 'cashout');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_ticket_settlement_status as enum ('posted', 'void', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_payout_period_type as enum ('weekly', 'monthly');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_payout_period_status as enum ('scheduled', 'open', 'statement_posted', 'partially_paid', 'paid', 'disputed', 'locked');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_statement_source as enum ('operator_statement', 'internal_calc', 'manual');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_statement_status as enum ('draft', 'posted', 'revised', 'disputed', 'void');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_statement_authority as enum ('authoritative', 'superseded', 'suspended', 'void');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_reconciliation_run_type as enum ('manual', 'scheduled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_reconciliation_status as enum ('clean', 'attention', 'blocked', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_issue_type as enum (
    'missing_opening_balance',
    'unmatched_deposit',
    'unmatched_withdrawal',
    'open_ticket',
    'late_settlement',
    'statement_missing',
    'statement_shortfall',
    'duplicate_entry',
    'manual_adjustment_unreviewed',
    'disputed_entry',
    'settlement_wallet_mismatch'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_issue_severity as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_issue_status as enum ('open', 'resolved', 'waived', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_task_type as enum (
    'claim_payout',
    'verify_receipt',
    'resolve_duplicate',
    'investigate_ticket',
    'review_adjustment',
    'collections_followup'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_task_status as enum ('open', 'in_progress', 'done', 'canceled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_task_priority as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_note_type as enum ('collections', 'payout_followup', 'state_change', 'internal');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_note_platform as enum ('telegram', 'whatsapp', 'internal');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_credit_grant_status as enum ('issued', 'partially_wagered', 'fully_wagered', 'settled', 'expired', 'forfeited');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type ops_audit_entity_type as enum (
    'account',
    'wallet_entry',
    'ticket',
    'statement',
    'reconciliation_issue',
    'task',
    'note'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.ops_operators (
  id text primary key,
  name text not null unique,
  category ops_operator_category not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_accounts (
  id text primary key,
  operator_id text not null references public.ops_operators (id) on delete restrict,
  label text not null,
  status ops_account_status not null default 'active',
  opened_at timestamptz not null,
  closed_at timestamptz,
  external_account_ref text,
  created_at timestamptz not null default now(),
  constraint ops_accounts_operator_label_uniq unique (operator_id, label)
);

create table if not exists public.ops_market_events (
  id text primary key,
  sport text not null,
  event_name text not null,
  starts_at timestamptz not null,
  status ops_event_status not null default 'scheduled',
  external_event_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_tickets (
  id text primary key,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  market_event_id text not null references public.ops_market_events (id) on delete restrict,
  ticket_ref text not null,
  market text not null,
  side text not null,
  odds_decimal numeric(10,4) not null,
  stake_cash numeric(14,2) not null default 0,
  stake_credit numeric(14,2) not null default 0,
  placed_at timestamptz not null,
  accepted_at timestamptz,
  status ops_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint ops_tickets_account_ticket_ref_uniq unique (account_id, ticket_ref)
);

create table if not exists public.ops_payout_periods (
  id text primary key,
  operator_id text not null references public.ops_operators (id) on delete cascade,
  period_type ops_payout_period_type not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz not null,
  status ops_payout_period_status not null default 'scheduled',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ops_payout_periods_operator_range_uniq unique (operator_id, period_type, period_start, period_end)
);

create table if not exists public.ops_period_statements (
  id text primary key,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  payout_period_id text not null references public.ops_payout_periods (id) on delete cascade,
  source_of_entry ops_source_of_entry not null,
  source ops_statement_source not null,
  status ops_statement_status not null default 'draft',
  statement_series_id text not null,
  version_no integer not null check (version_no >= 1),
  authority ops_statement_authority not null default 'authoritative',
  supersedes_statement_id text references public.ops_period_statements (id) on delete set null,
  superseded_by_statement_id text references public.ops_period_statements (id) on delete set null,
  statement_ref text,
  expected_cash_due numeric(14,2) not null default 0,
  expected_credit_due numeric(14,2) not null default 0,
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_account_notes (
  id text primary key,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  note_type ops_note_type not null,
  platform ops_note_platform not null,
  subject text not null,
  body text not null,
  affects_collections boolean not null default false,
  affects_state boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_wallet_entries (
  id text primary key,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  wallet_type ops_wallet_type not null,
  entry_type ops_wallet_entry_type not null,
  source_of_entry ops_source_of_entry not null,
  signed_amount numeric(14,2) not null,
  status ops_wallet_entry_status not null default 'pending',
  occurred_at timestamptz not null,
  posted_at timestamptz,
  external_ref text,
  dedupe_key text,
  ticket_id text references public.ops_tickets (id) on delete set null,
  statement_id text references public.ops_period_statements (id) on delete set null,
  note_id text references public.ops_account_notes (id) on delete set null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_ticket_settlements (
  id text primary key,
  ticket_id text not null references public.ops_tickets (id) on delete cascade,
  source_of_entry ops_source_of_entry not null,
  settlement_type ops_ticket_settlement_type not null,
  status ops_ticket_settlement_status not null default 'posted',
  settled_cash_stake numeric(14,2) not null default 0,
  settled_credit_stake numeric(14,2) not null default 0,
  cash_return numeric(14,2) not null default 0,
  credit_return numeric(14,2) not null default 0,
  pnl_cash numeric(14,2) not null default 0,
  pnl_credit numeric(14,2) not null default 0,
  effective_at timestamptz not null,
  external_ref text,
  payout_wallet_entry_id text references public.ops_wallet_entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_credit_grants (
  id text primary key,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  issued_wallet_entry_id text not null references public.ops_wallet_entries (id) on delete restrict,
  grant_ref text not null,
  original_amount numeric(14,2) not null check (original_amount >= 0),
  expires_at timestamptz,
  rollover_requirement integer,
  status ops_credit_grant_status not null,
  created_at timestamptz not null default now(),
  constraint ops_credit_grants_account_ref_uniq unique (account_id, grant_ref)
);

create table if not exists public.ops_ticket_credit_allocations (
  id text primary key,
  ticket_id text not null references public.ops_tickets (id) on delete cascade,
  credit_grant_id text not null references public.ops_credit_grants (id) on delete cascade,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ops_reconciliation_runs (
  id text primary key,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  payout_period_id text not null references public.ops_payout_periods (id) on delete cascade,
  statement_id text references public.ops_period_statements (id) on delete set null,
  run_type ops_reconciliation_run_type not null,
  status ops_reconciliation_status not null,
  run_at timestamptz not null,
  completed_at timestamptz,
  actor text not null,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_reconciliation_issues (
  id text primary key,
  reconciliation_run_id text not null references public.ops_reconciliation_runs (id) on delete cascade,
  account_id text not null references public.ops_accounts (id) on delete cascade,
  payout_period_id text not null references public.ops_payout_periods (id) on delete cascade,
  issue_type ops_issue_type not null,
  severity ops_issue_severity not null,
  status ops_issue_status not null default 'open',
  amount numeric(14,2),
  related_entity_type text,
  related_entity_id text,
  opened_at timestamptz not null,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_tasks (
  id text primary key,
  account_id text references public.ops_accounts (id) on delete cascade,
  payout_period_id text references public.ops_payout_periods (id) on delete cascade,
  reconciliation_issue_id text references public.ops_reconciliation_issues (id) on delete set null,
  note_id text references public.ops_account_notes (id) on delete set null,
  task_type ops_task_type not null,
  status ops_task_status not null default 'open',
  priority ops_task_priority not null default 'medium',
  title text not null,
  due_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_audit_events (
  id text primary key,
  entity_type ops_audit_entity_type not null,
  entity_id text not null,
  action text not null,
  actor text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists ops_accounts_operator_idx on public.ops_accounts (operator_id, status);
create index if not exists ops_wallet_entries_account_status_idx on public.ops_wallet_entries (account_id, wallet_type, status, occurred_at desc);
create index if not exists ops_wallet_entries_external_ref_idx on public.ops_wallet_entries (external_ref);
create index if not exists ops_wallet_entries_dedupe_idx on public.ops_wallet_entries (dedupe_key);
create index if not exists ops_tickets_account_idx on public.ops_tickets (account_id, status, accepted_at desc);
create index if not exists ops_ticket_settlements_ticket_idx on public.ops_ticket_settlements (ticket_id, effective_at desc);
create index if not exists ops_period_statements_account_idx on public.ops_period_statements (account_id, payout_period_id, status);
create unique index if not exists ops_wallet_entries_active_dedupe_uniq
  on public.ops_wallet_entries (dedupe_key)
  where dedupe_key is not null and status in ('pending', 'posted', 'disputed');
create unique index if not exists ops_ticket_settlements_payout_wallet_uniq
  on public.ops_ticket_settlements (payout_wallet_entry_id)
  where payout_wallet_entry_id is not null;
create unique index if not exists ops_period_statements_series_version_uniq
  on public.ops_period_statements (statement_series_id, version_no);
create unique index if not exists ops_period_statements_series_authority_uniq
  on public.ops_period_statements (statement_series_id)
  where authority = 'authoritative';
create index if not exists ops_credit_grants_account_idx on public.ops_credit_grants (account_id, status, expires_at);
create index if not exists ops_ticket_credit_allocations_ticket_idx on public.ops_ticket_credit_allocations (ticket_id, credit_grant_id);
create index if not exists ops_reconciliation_runs_account_idx on public.ops_reconciliation_runs (account_id, run_at desc);
create index if not exists ops_reconciliation_issues_account_idx on public.ops_reconciliation_issues (account_id, status, severity);
create index if not exists ops_tasks_status_idx on public.ops_tasks (status, due_at, priority);
