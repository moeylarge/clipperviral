alter table if exists users
  add column if not exists external_user_id text;

update users
set external_user_id = id::text
where external_user_id is null;

alter table if exists users
  alter column external_user_id set not null;

create unique index if not exists users_external_user_id_idx on users(external_user_id);
