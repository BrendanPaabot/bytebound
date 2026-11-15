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

create index if not exists users_username_key_idx
  on public.users (username_key);

alter table public.users enable row level security;

drop policy if exists "Users are public to read"
  on public.users;
create policy "Users are public to read"
  on public.users
  for select
  to anon, authenticated
  using (true);

revoke all on public.users from public, anon, authenticated;
grant select on public.users to anon, authenticated;

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

-- ===== 3. User Profile RPCs =====
create or replace function public.upsert_user_profile(
  p_username text,
  p_topic_progress jsonb default null,
  p_skill_progress jsonb default null,
  p_review_store jsonb default null,
  p_achievements jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(p_username, ''));
  v_username_key text := lower(v_display_name);
  v_user public.users;
begin
  if char_length(v_display_name) not between 1 and 24 then
    raise exception 'Invalid username.';
  end if;

  insert into public.users (
    username_key,
    display_name,
    topic_progress,
    skill_progress,
    review_store,
    achievements,
    last_login_at,
    updated_at
  )
  values (
    v_username_key,
    v_display_name,
    coalesce(p_topic_progress, '{}'::jsonb),
    coalesce(p_skill_progress, '{}'::jsonb),
    coalesce(p_review_store, '{}'::jsonb),
    coalesce(p_achievements, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (username_key) do update set
    display_name = excluded.display_name,
    topic_progress = coalesce(p_topic_progress, public.users.topic_progress),
    skill_progress = coalesce(p_skill_progress, public.users.skill_progress),
    review_store = coalesce(p_review_store, public.users.review_store),
    achievements = coalesce(p_achievements, public.users.achievements),
    last_login_at = now(),
    updated_at = case
      when p_topic_progress is not null
        or p_skill_progress is not null
        or p_review_store is not null
        or p_achievements is not null
      then now()
      else public.users.updated_at
    end
  returning * into v_user;

  return jsonb_build_object(
    'id', v_user.id,
    'username_key', v_user.username_key,
    'display_name', v_user.display_name,
    'best_score', v_user.best_score,
    'total_kills', v_user.total_kills,
    'total_correct', v_user.total_correct,
    'total_answers', v_user.total_answers,
    'topic_progress', v_user.topic_progress,
    'skill_progress', v_user.skill_progress,
    'review_store', v_user.review_store,
    'achievements', v_user.achievements,
    'created_at', v_user.created_at,
    'updated_at', v_user.updated_at,
    'last_login_at', v_user.last_login_at
  );
end;
$$;

revoke all on function public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb)
  to anon, authenticated;

create or replace function public.reset_user_profile(
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username_key text := lower(btrim(coalesce(p_username, '')));
begin
  if char_length(v_username_key) not between 1 and 24 then
    raise exception 'Invalid username.';
  end if;

  update public.users
  set
    topic_progress = '{}'::jsonb,
    skill_progress = '{}'::jsonb,
    review_store = '{}'::jsonb,
    achievements = '{}'::jsonb,
    updated_at = now()
  where username_key = v_username_key;
end;
$$;

revoke all on function public.reset_user_profile(text)
  from public, anon, authenticated;
grant execute on function public.reset_user_profile(text)
  to anon, authenticated;

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
    or p_kills not between 0 and 200
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
