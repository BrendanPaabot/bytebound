-- Migration: Separate 1v1 Competitive Leaderboard & Purge 1v1-Only Records from Arcade Leaderboard
-- Run this in the Supabase SQL Editor on existing projects.

-- 1. Remove players from the Arcade leaderboard who only played 1v1 (0 Arcade virus kills)
delete from public.leaderboard_entries
where kills <= 0;

-- 2. Require at least 1 Arcade virus kill when submitting to the Arcade leaderboard
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

  insert into public.users (
    username_key, display_name, best_score, total_kills, total_correct, total_answers, last_login_at, updated_at
  )
  values (
    v_player_key, v_display_name, v_new_score, p_kills, p_correct_answers, p_total_answers, now(), now()
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

  insert into public.leaderboard_entries (
    user_id, run_id, player_name, kills, correct_answers, total_answers, submitted_at
  )
  values (
    v_user_id, p_run_id, v_display_name, p_kills, p_correct_answers, p_total_answers, now()
  )
  on conflict (user_id) do update set
    run_id = case when v_new_score >= public.leaderboard_entries.score then excluded.run_id else public.leaderboard_entries.run_id end,
    player_name = excluded.player_name,
    kills = case when v_new_score >= public.leaderboard_entries.score then excluded.kills else public.leaderboard_entries.kills end,
    correct_answers = case when v_new_score >= public.leaderboard_entries.score then excluded.correct_answers else public.leaderboard_entries.correct_answers end,
    total_answers = case when v_new_score >= public.leaderboard_entries.score then excluded.total_answers else public.leaderboard_entries.total_answers end,
    submitted_at = case when v_new_score >= public.leaderboard_entries.score then now() else public.leaderboard_entries.submitted_at end;
end;
$$;

revoke all on function public.submit_leaderboard_run(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_leaderboard_run(uuid, text, integer, integer, integer) to anon, authenticated;

-- 3. Create 1v1 Competitive Leaderboard table and RPC
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
    case when total_answers = 0 then 0 else floor(100.0 * correct_answers / total_answers)::integer end
  ) stored,
  win_rate integer generated always as (
    case when (wins + losses + draws) = 0 then 0 else floor(100.0 * wins / (wins + losses + draws))::integer end
  ) stored,
  last_match_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists pvp_leaderboard_entries_player_key_idx
  on public.pvp_leaderboard_entries (lower(btrim(player_name)));

create index if not exists pvp_leaderboard_entries_rank_idx
  on public.pvp_leaderboard_entries (rating desc, wins desc, win_rate desc, accuracy desc, updated_at asc);

alter table public.pvp_leaderboard_entries enable row level security;

drop policy if exists "1v1 leaderboard entries are public to read" on public.pvp_leaderboard_entries;
create policy "1v1 leaderboard entries are public to read"
  on public.pvp_leaderboard_entries for select to anon, authenticated using (true);

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

  v_delta := case when v_outcome = 'won' then 25 when v_outcome = 'draw' then 5 else -15 end;

  insert into public.users (username_key, display_name, last_login_at, updated_at)
  values (v_player_key, v_display_name, now(), now())
  on conflict (username_key) do update set
    display_name = excluded.display_name, last_login_at = now(), updated_at = now()
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
    rating = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.rating else greatest(100, public.pvp_leaderboard_entries.rating + v_delta) end,
    wins = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.wins else public.pvp_leaderboard_entries.wins + v_win end,
    losses = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.losses else public.pvp_leaderboard_entries.losses + v_loss end,
    draws = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.draws else public.pvp_leaderboard_entries.draws + v_draw end,
    damage_dealt = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.damage_dealt else public.pvp_leaderboard_entries.damage_dealt + p_damage_dealt end,
    correct_answers = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.correct_answers else public.pvp_leaderboard_entries.correct_answers + p_correct_answers end,
    total_answers = case when public.pvp_leaderboard_entries.last_match_id = v_match_id then public.pvp_leaderboard_entries.total_answers else public.pvp_leaderboard_entries.total_answers + p_total_answers end,
    last_match_id = v_match_id,
    updated_at = now();
end;
$$;

revoke all on function public.submit_pvp_match_result(text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_pvp_match_result(text, text, text, integer, integer, integer) to anon, authenticated;

-- 4. Update reset_user_profile so resetting data also wipes Arcade + 1v1 leaderboard records
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
  v_user_id bigint;
begin
  if char_length(v_username_key) not between 1 and 24 then
    raise exception 'Invalid username.';
  end if;

  select id into v_user_id
  from public.users
  where username_key = v_username_key;

  delete from public.leaderboard_entries
  where (v_user_id is not null and user_id = v_user_id)
     or lower(btrim(player_name)) = v_username_key;

  delete from public.pvp_leaderboard_entries
  where (v_user_id is not null and user_id = v_user_id)
     or lower(btrim(player_name)) = v_username_key;

  update public.users
  set
    best_score = 0,
    total_kills = 0,
    total_correct = 0,
    total_answers = 0,
    topic_progress = '{}'::jsonb,
    skill_progress = '{}'::jsonb,
    review_store = '{}'::jsonb,
    achievements = '{}'::jsonb,
    updated_at = now()
  where username_key = v_username_key;
end;
$$;

revoke all on function public.reset_user_profile(text) from public, anon, authenticated;
grant execute on function public.reset_user_profile(text) to anon, authenticated;
