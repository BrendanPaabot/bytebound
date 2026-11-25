-- Connects public.leaderboard_entries directly to public.users via a strict 1-to-1 foreign key (user_id -> public.users.id).
-- Run this in the Supabase SQL Editor.

-- ===== 1. Users / Cloud Profiles Table =====
create table if not exists public.users (
  id bigint generated always as identity primary key,
  username_key text not null unique check (char_length(btrim(username_key)) between 1 and 24),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  best_score integer not null default 0,
  total_kills integer not null default 0,
  total_correct integer not null default 0,
  total_answers integer not null default 0,
  topic_progress jsonb not null default '{}'::jsonb,
  skill_progress jsonb not null default '{}'::jsonb,
  review_store jsonb not null default '{}'::jsonb,
  achievements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.users add column if not exists best_score integer not null default 0;
alter table public.users add column if not exists total_kills integer not null default 0;
alter table public.users add column if not exists total_correct integer not null default 0;
alter table public.users add column if not exists total_answers integer not null default 0;
alter table public.users drop column if exists pin_hash;

create index if not exists users_username_key_idx
  on public.users (username_key);

alter table public.users enable row level security;

drop policy if exists "Users are public to read"
  on public.users;

revoke all on public.users from public, anon, authenticated;

-- ===== 2. Connect public.leaderboard_entries to public.users =====
create table if not exists public.leaderboard_entries (
  id bigint generated always as identity primary key,
  user_id bigint references public.users(id) on delete cascade,
  run_id uuid not null unique,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 24),
  kills integer not null check (kills between 0 and 1000),
  correct_answers integer not null check (correct_answers between 0 and 50000),
  total_answers integer not null check (
    total_answers between 0 and 50000
    and correct_answers <= total_answers
  ),
  accuracy integer generated always as (
    case
      when total_answers = 0 then 0
      else floor(100.0 * correct_answers / total_answers)::integer
    end
  ) stored,
  score integer generated always as (
    kills * 100
    + correct_answers * 10
    + case
        when total_answers = 0 then 0
        else floor(100.0 * correct_answers / total_answers)::integer
      end
  ) stored,
  submitted_at timestamptz not null default now()
);

-- Remove any non-Arcade rows (e.g. 1v1-only players with 0 virus kills) from the Arcade leaderboard
delete from public.leaderboard_entries
where kills <= 0;

-- Remove duplicate leaderboard rows for the same player (keep each player's highest-scoring row)
delete from public.leaderboard_entries a
using public.leaderboard_entries b
where lower(btrim(a.player_name)) = lower(btrim(b.player_name))
  and a.id <> b.id
  and (
    a.score < b.score
    or (a.score = b.score and a.correct_answers < b.correct_answers)
    or (a.score = b.score and a.correct_answers = b.correct_answers and a.kills < b.kills)
    or (a.score = b.score and a.correct_answers = b.correct_answers and a.kills = b.kills and a.id > b.id)
  );

-- Backfill all existing leaderboard players into public.users
insert into public.users (username_key, display_name, best_score, total_kills, total_correct, total_answers)
select
  lower(btrim(player_name)),
  btrim(player_name),
  score,
  kills,
  correct_answers,
  total_answers
from public.leaderboard_entries
on conflict (username_key) do update set
  best_score = greatest(public.users.best_score, excluded.best_score),
  total_kills = greatest(public.users.total_kills, excluded.total_kills),
  total_correct = greatest(public.users.total_correct, excluded.total_correct),
  total_answers = greatest(public.users.total_answers, excluded.total_answers);

-- Add user_id column and link every leaderboard entry to its public.users row
alter table public.leaderboard_entries
  add column if not exists user_id bigint;

update public.leaderboard_entries le
set user_id = u.id
from public.users u
where lower(btrim(le.player_name)) = u.username_key
  and le.user_id is distinct from u.id;

alter table public.leaderboard_entries
  alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leaderboard_entries_user_id_fkey'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end;
$$;

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_run_id_key;

create unique index if not exists leaderboard_entries_user_id_key_idx
  on public.leaderboard_entries (user_id);

create unique index if not exists leaderboard_entries_player_key_idx
  on public.leaderboard_entries (lower(btrim(player_name)));

create index if not exists leaderboard_entries_rank_idx
  on public.leaderboard_entries (score desc, correct_answers desc, kills desc, submitted_at asc);

alter table public.leaderboard_entries enable row level security;

drop policy if exists "Leaderboard entries are public to read"
  on public.leaderboard_entries;
create policy "Leaderboard entries are public to read"
  on public.leaderboard_entries
  for select
  to anon, authenticated
  using (true);

revoke all on public.leaderboard_entries from public, anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;

-- ===== 3. User Profile & Password Authentication RPCs =====
-- Password-based accounts, salted bcrypt hashing (pgcrypto), session tokens,
-- strict unique username enforcement (no #0001 auto-tagging), and verified legacy
-- account migration are defined in supabase/migration-password-auth.sql.
-- Run supabase/migration-password-auth.sql immediately after this schema file.
drop function if exists public.register_user_profile(text);
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb, text);
drop function if exists public.reset_user_profile(text);
drop function if exists public.reset_user_profile(text, text);

-- ===== 4. Submit Leaderboard Run RPC (Connected to public.users via user_id) =====
create or replace function public.submit_leaderboard_run(
  p_run_id uuid,
  p_player_name text,
  p_kills integer,
  p_correct_answers integer,
  p_total_answers integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(p_player_name, ''));
  v_player_key text := lower(v_display_name);
  v_new_accuracy integer;
  v_new_score integer;
  v_user_id bigint;
begin
  if p_run_id is null
    or p_player_name is null
    or char_length(v_display_name) not between 1 and 24
    or p_kills is null
    or p_kills not between 1 and 200
    or p_correct_answers is null
    or p_correct_answers not between 0 and 50000
    or p_total_answers is null
    or p_total_answers not between 0 and 50000
    or p_correct_answers > p_total_answers
    or p_total_answers < p_kills
  then
    raise exception 'Invalid leaderboard run data.';
  end if;

  v_new_accuracy := case
    when p_total_answers = 0 then 0
    else floor(100.0 * p_correct_answers / p_total_answers)::integer
  end;
  v_new_score := p_kills * 100 + p_correct_answers * 10 + v_new_accuracy;

  -- 1. Upsert user in public.users and get their user_id
  insert into public.users (
    username_key,
    display_name,
    best_score,
    total_kills,
    total_correct,
    total_answers,
    last_login_at,
    updated_at
  )
  values (
    v_player_key,
    v_display_name,
    v_new_score,
    p_kills,
    p_correct_answers,
    p_total_answers,
    now(),
    now()
  )
  on conflict (username_key) do update set
    display_name = excluded.display_name,
    best_score = greatest(public.users.best_score, excluded.best_score),
    total_kills = greatest(public.users.total_kills, excluded.total_kills),
    total_correct = greatest(public.users.total_correct, excluded.total_correct),
    total_answers = greatest(public.users.total_answers, excluded.total_answers),
    last_login_at = now(),
    updated_at = now()
  returning id into v_user_id;

  -- 2. Upsert the user's leaderboard entry linked via user_id
  insert into public.leaderboard_entries (
    user_id,
    run_id,
    player_name,
    kills,
    correct_answers,
    total_answers,
    submitted_at
  )
  values (
    v_user_id,
    p_run_id,
    v_display_name,
    p_kills,
    p_correct_answers,
    p_total_answers,
    now()
  )
  on conflict (user_id) do update set
    run_id = case
      when v_new_score >= public.leaderboard_entries.score then excluded.run_id
      else public.leaderboard_entries.run_id
    end,
    player_name = excluded.player_name,
    kills = case
      when v_new_score >= public.leaderboard_entries.score then excluded.kills
      else public.leaderboard_entries.kills
    end,
    correct_answers = case
      when v_new_score >= public.leaderboard_entries.score then excluded.correct_answers
      else public.leaderboard_entries.correct_answers
    end,
    total_answers = case
      when v_new_score >= public.leaderboard_entries.score then excluded.total_answers
      else public.leaderboard_entries.total_answers
    end,
    submitted_at = case
      when v_new_score >= public.leaderboard_entries.score then now()
      else public.leaderboard_entries.submitted_at
    end;
end;
$$;

revoke all on function public.submit_leaderboard_run(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_leaderboard_run(uuid, text, integer, integer, integer)
  to anon, authenticated;

-- ===== 5. 1v1 Multiplayer Rooms Registry (Online Matchmaking & Private Codes) =====
create table if not exists public.multiplayer_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{4,8}$'),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null check (status in ('waiting', 'full', 'in_match', 'closed')),
  host_client_id text not null,
  host_name text not null check (char_length(btrim(host_name)) between 1 and 24),
  host_avatar text not null default 'gold',
  guest_client_id text,
  guest_name text,
  guest_avatar text,
  settings jsonb not null default '{}'::jsonb,
  room_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists multiplayer_rooms_public_idx
  on public.multiplayer_rooms (visibility, status, updated_at desc);

alter table public.multiplayer_rooms enable row level security;

drop policy if exists "Multiplayer rooms are readable"
  on public.multiplayer_rooms;
create policy "Multiplayer rooms are readable"
  on public.multiplayer_rooms
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Multiplayer rooms can be created"
  on public.multiplayer_rooms;
create policy "Multiplayer rooms can be created"
  on public.multiplayer_rooms
  for insert
  to anon, authenticated
  with check (char_length(btrim(host_name)) between 1 and 24);

drop policy if exists "Multiplayer rooms can be updated"
  on public.multiplayer_rooms;
create policy "Multiplayer rooms can be updated"
  on public.multiplayer_rooms
  for update
  to anon, authenticated
  using (true)
  with check (char_length(btrim(host_name)) between 1 and 24);

drop policy if exists "Multiplayer rooms can be deleted"
  on public.multiplayer_rooms;
create policy "Multiplayer rooms can be deleted"
  on public.multiplayer_rooms
  for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.multiplayer_rooms to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.multiplayer_rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- ===== 6. 1v1 Competitive Leaderboard (Separate from Arcade Leaderboard) =====
create table if not exists public.pvp_leaderboard_entries (
  id bigint generated always as identity primary key,
  user_id bigint not null unique references public.users(id) on delete cascade,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 24),
  rating integer not null default 1000 check (rating between 100 and 10000),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  matches_played integer generated always as (wins + losses + draws) stored,
  damage_dealt integer not null default 0 check (damage_dealt >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  total_answers integer not null default 0 check (total_answers >= 0 and correct_answers <= total_answers),
  accuracy integer generated always as (
    case
      when total_answers = 0 then 0
      else floor(100.0 * correct_answers / total_answers)::integer
    end
  ) stored,
  win_rate integer generated always as (
    case
      when (wins + losses + draws) = 0 then 0
      else floor(100.0 * wins / (wins + losses + draws))::integer
    end
  ) stored,
  last_match_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists pvp_leaderboard_entries_player_key_idx
  on public.pvp_leaderboard_entries (lower(btrim(player_name)));

create index if not exists pvp_leaderboard_entries_rank_idx
  on public.pvp_leaderboard_entries (rating desc, wins desc, win_rate desc, accuracy desc, updated_at asc);

alter table public.pvp_leaderboard_entries enable row level security;

drop policy if exists "1v1 leaderboard entries are public to read"
  on public.pvp_leaderboard_entries;
create policy "1v1 leaderboard entries are public to read"
  on public.pvp_leaderboard_entries
  for select
  to anon, authenticated
  using (true);

revoke all on public.pvp_leaderboard_entries from public, anon, authenticated;
grant select on public.pvp_leaderboard_entries to anon, authenticated;

create or replace function public.submit_pvp_match_result(
  p_match_id text,
  p_player_name text,
  p_outcome text,
  p_correct_answers integer default 0,
  p_total_answers integer default 0,
  p_damage_dealt integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(p_player_name, ''));
  v_player_key text := lower(v_display_name);
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
  v_match_id text := btrim(coalesce(p_match_id, ''));
  v_user_id bigint;
  v_delta integer;
  v_win integer := case when v_outcome = 'won' then 1 else 0 end;
  v_loss integer := case when v_outcome = 'lost' then 1 else 0 end;
  v_draw integer := case when v_outcome = 'draw' then 1 else 0 end;
begin
  if char_length(v_match_id) < 1
    or char_length(v_display_name) not between 1 and 24
    or v_outcome not in ('won', 'lost', 'draw')
    or p_correct_answers is null or p_correct_answers < 0
    or p_total_answers is null or p_total_answers < p_correct_answers
    or p_damage_dealt is null or p_damage_dealt < 0
  then
    raise exception 'Invalid 1v1 match result data.';
  end if;

  v_delta := case
    when v_outcome = 'won' then 25
    when v_outcome = 'draw' then 5
    else -15
  end;

  insert into public.users (username_key, display_name, last_login_at, updated_at)
  values (v_player_key, v_display_name, now(), now())
  on conflict (username_key) do update set
    display_name = excluded.display_name,
    last_login_at = now(),
    updated_at = now()
  returning id into v_user_id;

  insert into public.pvp_leaderboard_entries (
    user_id, player_name, rating, wins, losses, draws,
    damage_dealt, correct_answers, total_answers, last_match_id, updated_at
  )
  values (
    v_user_id, v_display_name, greatest(100, 1000 + v_delta),
    v_win, v_loss, v_draw, p_damage_dealt, p_correct_answers, p_total_answers, v_match_id, now()
  )
  on conflict (user_id) do update set
    player_name = excluded.player_name,
    rating = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.rating
      else greatest(100, public.pvp_leaderboard_entries.rating + v_delta)
    end,
    wins = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.wins
      else public.pvp_leaderboard_entries.wins + v_win
    end,
    losses = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.losses
      else public.pvp_leaderboard_entries.losses + v_loss
    end,
    draws = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.draws
      else public.pvp_leaderboard_entries.draws + v_draw
    end,
    damage_dealt = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.damage_dealt
      else public.pvp_leaderboard_entries.damage_dealt + p_damage_dealt
    end,
    correct_answers = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.correct_answers
      else public.pvp_leaderboard_entries.correct_answers + p_correct_answers
    end,
    total_answers = case
      when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.total_answers
      else public.pvp_leaderboard_entries.total_answers + p_total_answers
    end,
    last_match_id = v_match_id,
    updated_at = now();
end;
$$;

revoke all on function public.submit_pvp_match_result(text, text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_pvp_match_result(text, text, text, integer, integer, integer)
  to anon, authenticated;
