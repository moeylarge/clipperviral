create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type spotlight_show_status as enum ('upcoming', 'live', 'ended', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type spotlight_queue_entry_status as enum ('queued', 'called', 'on_stage', 'completed', 'disqualified');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type spotlight_round_status as enum ('waiting', 'live', 'ended');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type spotlight_vote_choice as enum ('keep', 'swap');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type spotlight_result_outcome as enum ('spotlight_held', 'spotlight_passed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type spotlight_ranking_tier as enum ('bronze', 'silver', 'gold', 'elite');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  handle text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_auth_user_id_uniq unique (auth_user_id)
);
comment on table public.users is 'Spotlight users mapped to auth identities. Shared auth anchor for profiles, participants, and rankings.';

create table if not exists public.profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category text,
  bio text,
  avatar_url text,
  wins integer not null default 0,
  losses integer not null default 0,
  streak integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_user_id_uniq unique (user_id)
);
comment on table public.profiles is 'Public profile layer used by status shells and identity surfaces.';

create table if not exists public.shows (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  host_id uuid references public.users (id) on delete set null,
  category text,
  state spotlight_show_status not null default 'upcoming',
  starts_at timestamptz,
  ends_at timestamptz,
  turn_seconds integer not null default 60,
  max_queue_size integer not null default 12,
  audience_cap integer not null default 3000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.shows is 'Scheduled live shows and their venue-level runtime config.';

create table if not exists public.show_participants (
  id uuid primary key default extensions.gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  lane text not null default 'main',
  role text,
  status text not null default 'pending',
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.show_participants is 'Audience contestants attached to a specific show and lane.';

create table if not exists public.queue_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  participant_id uuid not null references public.show_participants (id) on delete cascade,
  position integer not null check (position >= 1),
  status spotlight_queue_entry_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_entries_show_position_uniq unique (show_id, position),
  constraint queue_entries_show_participant_uniq unique (show_id, participant_id)
);
comment on table public.queue_entries is 'Live queue snapshot used for current and next-up staging.';

create table if not exists public.rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  participant_id uuid not null references public.show_participants (id) on delete cascade,
  state spotlight_round_status not null default 'waiting',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rounds is 'Single spotlight turns with explicit waiting/live/ended lifecycle.';

create table if not exists public.votes (
  id uuid primary key default extensions.gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  choice spotlight_vote_choice not null,
  created_at timestamptz not null default now(),
  constraint votes_round_user_uniq unique (round_id, user_id)
);
comment on table public.votes is 'Audience vote records for each active round.';

create table if not exists public.results (
  id uuid primary key default extensions.gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  winner_participant_id uuid references public.show_participants (id) on delete set null,
  outcome spotlight_result_outcome not null default 'spotlight_held',
  headline text,
  detail text,
  winner_votes integer not null default 0,
  loser_votes integer not null default 0,
  margin integer not null default 0,
  posted_at timestamptz not null default now(),
  constraint results_round_uniq unique (round_id)
);
comment on table public.results is 'Round outcome snapshot to keep winner and score state explicit.';

create table if not exists public.clips (
  id uuid primary key default extensions.gen_random_uuid(),
  show_id uuid references public.shows (id) on delete set null,
  round_id uuid references public.rounds (id) on delete set null,
  participant_id uuid references public.show_participants (id) on delete set null,
  title text not null,
  media_url text,
  outcome text,
  heat integer,
  proof_text text,
  duration_seconds integer,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.clips is 'Spotlight proof moments, optionally tied back to show/round/participant.';

create table if not exists public.rankings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  season text not null default 'season-2026',
  tier spotlight_ranking_tier not null default 'bronze',
  score integer not null default 0,
  rank integer,
  wins integer not null default 0,
  losses integer not null default 0,
  streak integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint rankings_user_season_uniq unique (user_id, season)
);
comment on table public.rankings is 'Lightweight status model for public competitive standing.';

create index if not exists users_auth_user_id_idx on public.users (auth_user_id);
create unique index if not exists users_handle_idx on public.users (handle);
create unique index if not exists profiles_user_id_idx on public.profiles (user_id);
create index if not exists shows_slug_idx on public.shows (slug);
create index if not exists shows_state_idx on public.shows (state, starts_at);
create index if not exists show_participants_show_idx on public.show_participants (show_id, status, lane);
create unique index if not exists show_participants_user_idx on public.show_participants (show_id, user_id);
create index if not exists queue_entries_show_status_idx on public.queue_entries (show_id, status, position);
create index if not exists queue_entries_participant_idx on public.queue_entries (participant_id, status);
create index if not exists rounds_show_status_idx on public.rounds (show_id, state, created_at);
create index if not exists votes_round_idx on public.votes (round_id, created_at);
create index if not exists results_round_idx on public.results (round_id);
create index if not exists clips_show_idx on public.clips (show_id, published_at desc nulls last);
create index if not exists clips_round_idx on public.clips (round_id);
create index if not exists rankings_user_idx on public.rankings (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_touch_updated_at
  before update on public.users
  for each row
  execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

create trigger shows_touch_updated_at
  before update on public.shows
  for each row
  execute function public.touch_updated_at();

create trigger show_participants_touch_updated_at
  before update on public.show_participants
  for each row
  execute function public.touch_updated_at();

create trigger queue_entries_touch_updated_at
  before update on public.queue_entries
  for each row
  execute function public.touch_updated_at();

create trigger rounds_touch_updated_at
  before update on public.rounds
  for each row
  execute function public.touch_updated_at();
