-- Face2Face AI MVP core schema

create extension if not exists pgcrypto;

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  value_line text not null,
  description text not null,
  avatar_id text not null,
  voice_id text not null,
  system_prompt text not null,
  moderation_profile text not null,
  price_cents_per_minute integer not null default 199,
  free_seconds integer not null default 60,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  credits_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  persona_id uuid not null references personas(id),
  status text not null check (status in ('active','paused_for_payment','reconnecting','ended')),
  connection_state text not null check (connection_state in ('connected','reconnecting','disconnected')),
  started_at timestamptz not null,
  free_ends_at timestamptz not null,
  ended_at timestamptz,
  last_heartbeat_at timestamptz not null,
  billable_ms bigint not null default 0,
  charged_cents bigint not null default 0,
  summary_points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists session_transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  token_count integer,
  created_at timestamptz not null default now(),
  unique(session_id, chunk_index)
);

create table if not exists session_usage_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  event_time timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  provider text not null,
  provider_payment_id text,
  amount_cents bigint not null,
  currency text not null default 'usd',
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists persona_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personas(id),
  metric_date date not null,
  landing_clicks integer not null default 0,
  session_starts integer not null default 0,
  retention_15s integer not null default 0,
  retention_60s integer not null default 0,
  paid_conversions integer not null default 0,
  revenue_cents bigint not null default 0,
  disconnect_count integer not null default 0,
  reconnect_success_count integer not null default 0,
  billing_mismatch_count integer not null default 0,
  transcript_completion_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, metric_date)
);

create index if not exists idx_live_sessions_persona_id on live_sessions(persona_id);
create index if not exists idx_live_sessions_user_id on live_sessions(user_id);
create index if not exists idx_live_sessions_started_at on live_sessions(started_at);
create index if not exists idx_session_messages_session_id_created_at on session_messages(session_id, created_at);
create index if not exists idx_usage_events_session_time on session_usage_events(session_id, event_time);
create index if not exists idx_payments_user_created on payments(user_id, created_at);

insert into personas (slug, display_name, value_line, description, avatar_id, voice_id, system_prompt, moderation_profile, price_cents_per_minute, free_seconds)
values
  ('rabbi', 'Rabbi', 'Life, family, clarity', 'Ethics, faith, and family guidance', 'avatar_rabbi_default', 'voice_rabbi_default', 'You are a warm and disciplined rabbi mentor. Help users with ethics, meaning, family, and practical life decisions.', 'strict-safe', 199, 60),
  ('businessman', 'Businessman', 'Money, deals, discipline', 'Finance, negotiation, and execution discipline', 'avatar_businessman_default', 'voice_businessman_default', 'You are a direct Jewish business mentor focused on cash flow, discipline, negotiation, and long-term decision quality.', 'strict-safe', 199, 60),
  ('moses', 'Moses', 'Leadership, wisdom, hard decisions', 'Leadership under pressure and principled choices', 'avatar_moses_default', 'voice_moses_default', 'You are a Moses-style leader and scholar mentor. Speak with calm conviction and guide hard decisions with wisdom.', 'strict-safe', 199, 60)
on conflict (slug) do update
set
  display_name = excluded.display_name,
  value_line = excluded.value_line,
  description = excluded.description,
  avatar_id = excluded.avatar_id,
  voice_id = excluded.voice_id,
  system_prompt = excluded.system_prompt,
  moderation_profile = excluded.moderation_profile,
  price_cents_per_minute = excluded.price_cents_per_minute,
  free_seconds = excluded.free_seconds,
  updated_at = now();
