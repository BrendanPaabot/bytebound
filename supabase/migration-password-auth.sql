-- Migration: Restore secure password-based accounts with salted server-side hashing (pgcrypto bcrypt),
-- authoritative case/whitespace-insensitive username uniqueness (no #0001 auto-tagging),
-- opaque session tokens, and verified legacy passwordless account migration.
-- Run once in the Supabase SQL Editor on existing projects (safe to re-run; idempotent).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1. Ensure public.users has strict unique normalized username_key and no legacy plaintext/weak pin_hash
alter table public.users
  drop column if exists pin_hash;

create unique index if not exists users_username_key_unique_idx
  on public.users (username_key);

-- Lock down public.users so unauthenticated clients cannot enumerate usernames or modify profiles directly.
-- Public leaderboards continue reading from public.leaderboard_entries and public.pvp_leaderboard_entries.
drop policy if exists "Users are public to read" on public.users;
revoke all on public.users from public, anon, authenticated;

-- 2. Private server-only credentials table (salted bcrypt hashes via pgcrypto)
create table if not exists public.user_credentials (
  user_id bigint primary key references public.users(id) on delete cascade,
  password_hash text not null check (password_hash ~ '^\$2[aby]\$[0-9]{2}\$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_credentials enable row level security;
revoke all on public.user_credentials from public, anon, authenticated;

-- 3. Private server-only opaque session tokens table (stores SHA-256 hash of random 256-bit bearer token)
create table if not exists public.user_sessions (
  token_hash text primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id);

create index if not exists user_sessions_expires_at_idx
  on public.user_sessions (expires_at);

alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from public, anon, authenticated;

-- 4. Clean up any unused legacy migration objects
drop function if exists public.auth_migrate_legacy_account(text, text, text);
drop function if exists public.issue_legacy_migration_code(text, integer);
drop table if exists public.legacy_migration_codes;

-- 5. Drop old passwordless / auto-tagging / unauthenticated profile mutation RPCs
drop function if exists public.register_user_profile(text);
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb, text);
drop function if exists public.reset_user_profile(text);
drop function if exists public.reset_user_profile(text, text);

-- 6. Internal helper: serialize public.users row (never includes credentials)
create or replace function public._serialize_auth_user(p_user public.users)
returns jsonb
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', p_user.id,
    'username_key', p_user.username_key,
    'display_name', p_user.display_name,
    'best_score', p_user.best_score,
    'total_kills', p_user.total_kills,
    'total_correct', p_user.total_correct,
    'total_answers', p_user.total_answers,
    'topic_progress', p_user.topic_progress,
    'skill_progress', p_user.skill_progress,
    'review_store', p_user.review_store,
    'achievements', p_user.achievements,
    'created_at', p_user.created_at,
    'updated_at', p_user.updated_at,
    'last_login_at', p_user.last_login_at
  );
$$;

revoke all on function public._serialize_auth_user(public.users) from public, anon, authenticated;

-- 7. Internal helper: resolve a valid session token to user_id
create or replace function public._resolve_session_user_id(p_session_token text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text := btrim(coalesce(p_session_token, ''));
  v_token_hash text;
  v_user_id bigint;
begin
  if char_length(v_token) < 32 then
    return null;
  end if;

  v_token_hash := encode(digest(convert_to(v_token, 'utf8'), 'sha256'::text), 'hex');

  select s.user_id
  into v_user_id
  from public.user_sessions s
  where s.token_hash = v_token_hash
    and s.expires_at > now();

  return v_user_id;
end;
$$;

revoke all on function public._resolve_session_user_id(text) from public, anon, authenticated;

-- 8. Sign Up RPC: enforces strict normalized username uniqueness (rejects duplicates & existing legacy accounts)
create or replace function public.auth_sign_up(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_display_name text := btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
  v_username_key text := lower(v_display_name);
  v_password text := coalesce(p_password, '');
  v_password_hash text;
  v_user public.users;
  v_session_token text;
  v_token_hash text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if char_length(v_display_name) not between 1 and 24 then
    raise exception 'AUTH_INVALID_USERNAME: Username must be between 1 and 24 characters.';
  end if;

  if char_length(v_password) < 6 or char_length(v_password) > 72 or char_length(btrim(v_password)) = 0 then
    raise exception 'AUTH_INVALID_PASSWORD: Password must be between 6 and 72 characters.';
  end if;

  begin
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
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    returning * into v_user;
  exception
    when unique_violation then
      raise exception 'AUTH_USERNAME_TAKEN: That username is already taken. Please choose another name.';
  end;

  v_password_hash := crypt(v_password, gen_salt('bf'::text, 12));

  insert into public.user_credentials (user_id, password_hash, created_at, updated_at)
  values (v_user.id, v_password_hash, now(), now());

  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(convert_to(v_session_token, 'utf8'), 'sha256'::text), 'hex');

  insert into public.user_sessions (token_hash, user_id, created_at, expires_at)
  values (v_token_hash, v_user.id, now(), v_expires_at);

  return jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at,
    'user', public._serialize_auth_user(v_user)
  );
end;
$$;

revoke all on function public.auth_sign_up(text, text) from public, anon, authenticated;
grant execute on function public.auth_sign_up(text, text) to anon, authenticated;

-- 9. Log In RPC: verifies salted bcrypt hash with non-enumerating error & constant-time dummy verification
create or replace function public.auth_log_in(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_display_name text := btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
  v_username_key text := lower(v_display_name);
  v_password text := coalesce(p_password, '');
  v_user public.users;
  v_password_hash text;
  v_dummy_hash text := '$2a$12$C6UzMDM.H6dfI/f/IKxGhu6C8M7xT7P1z8xN4M2P5W6Q9yH2vK3aW';
  v_computed text;
  v_session_token text;
  v_token_hash text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if char_length(v_display_name) not between 1 and 24 or char_length(v_password) = 0 or char_length(v_password) > 72 then
    raise exception 'AUTH_INVALID_CREDENTIALS: Invalid username or password.';
  end if;

  select * into v_user
  from public.users
  where username_key = v_username_key;

  if v_user.id is not null then
    select c.password_hash into v_password_hash
    from public.user_credentials c
    where c.user_id = v_user.id;
  end if;

  -- Always execute bcrypt verification so response timing does not leak account existence
  v_computed := crypt(v_password, coalesce(v_password_hash, v_dummy_hash));

  if v_user.id is null or v_password_hash is null or v_computed <> v_password_hash then
    raise exception 'AUTH_INVALID_CREDENTIALS: Invalid username or password.';
  end if;

  update public.users
  set last_login_at = now()
  where id = v_user.id
  returning * into v_user;

  delete from public.user_sessions
  where user_id = v_user.id and expires_at <= now();

  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(convert_to(v_session_token, 'utf8'), 'sha256'::text), 'hex');

  insert into public.user_sessions (token_hash, user_id, created_at, expires_at)
  values (v_token_hash, v_user.id, now(), v_expires_at);

  return jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at,
    'user', public._serialize_auth_user(v_user)
  );
end;
$$;

revoke all on function public.auth_log_in(text, text) from public, anon, authenticated;
grant execute on function public.auth_log_in(text, text) to anon, authenticated;

-- 10. Validate active session token and fetch user profile
create or replace function public.auth_get_session(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint := public._resolve_session_user_id(p_session_token);
  v_user public.users;
begin
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Your session has expired. Please log in again.';
  end if;

  select * into v_user
  from public.users
  where id = v_user_id;

  if v_user.id is null then
    raise exception 'AUTH_SESSION_INVALID: Your session has expired. Please log in again.';
  end if;

  return jsonb_build_object(
    'user', public._serialize_auth_user(v_user)
  );
end;
$$;

revoke all on function public.auth_get_session(text) from public, anon, authenticated;
grant execute on function public.auth_get_session(text) to anon, authenticated;

-- 11. Log out (revoke session token)
create or replace function public.auth_logout(
  p_session_token text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text := btrim(coalesce(p_session_token, ''));
  v_token_hash text;
begin
  if char_length(v_token) < 32 then
    return;
  end if;
  v_token_hash := encode(digest(convert_to(v_token, 'utf8'), 'sha256'::text), 'hex');
  delete from public.user_sessions where token_hash = v_token_hash;
end;
$$;

revoke all on function public.auth_logout(text) from public, anon, authenticated;
grant execute on function public.auth_logout(text) to anon, authenticated;

-- 12. Authenticated profile progress sync
create or replace function public.auth_save_profile(
  p_session_token text,
  p_topic_progress jsonb default null,
  p_skill_progress jsonb default null,
  p_review_store jsonb default null,
  p_achievements jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint := public._resolve_session_user_id(p_session_token);
  v_user public.users;
begin
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Please log in again to save your progress.';
  end if;

  update public.users
  set
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
  where id = v_user_id
  returning * into v_user;

  return public._serialize_auth_user(v_user);
end;
$$;

revoke all on function public.auth_save_profile(text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.auth_save_profile(text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- 13. Authenticated profile reset
create or replace function public.auth_reset_profile(
  p_session_token text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint := public._resolve_session_user_id(p_session_token);
  v_username_key text;
begin
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Please log in again to reset your profile.';
  end if;

  select username_key into v_username_key
  from public.users
  where id = v_user_id;

  delete from public.leaderboard_entries
  where user_id = v_user_id
     or (v_username_key is not null and lower(btrim(player_name)) = v_username_key);

  if to_regclass('public.pvp_leaderboard_entries') is not null then
    delete from public.pvp_leaderboard_entries
    where user_id = v_user_id
       or (v_username_key is not null and lower(btrim(player_name)) = v_username_key);
  end if;

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
  where id = v_user_id;
end;
$$;

revoke all on function public.auth_reset_profile(text) from public, anon, authenticated;
grant execute on function public.auth_reset_profile(text) to anon, authenticated;

-- 14. Require authenticated session on leaderboard submissions (prevents spoofing or creating passwordless rows)
drop function if exists public.submit_leaderboard_run(uuid, text, integer, integer, integer);
drop function if exists public.submit_leaderboard_run(uuid, text, integer, integer, integer, text);
create or replace function public.submit_leaderboard_run(
  p_run_id uuid,
  p_player_name text,
  p_kills integer,
  p_correct_answers integer,
  p_total_answers integer,
  p_session_token text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint := public._resolve_session_user_id(p_session_token);
  v_user public.users;
  v_new_accuracy integer;
  v_new_score integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Please log in to submit leaderboard scores.';
  end if;

  if p_run_id is null
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

  select * into v_user
  from public.users
  where id = v_user_id;

  if v_user.id is null then
    raise exception 'AUTH_SESSION_INVALID: Please log in to submit leaderboard scores.';
  end if;

  v_new_accuracy := case
    when p_total_answers = 0 then 0
    else floor(100.0 * p_correct_answers / p_total_answers)::integer
  end;
  v_new_score := p_kills * 100 + p_correct_answers * 10 + v_new_accuracy;

  update public.users
  set
    best_score = greatest(public.users.best_score, v_new_score),
    total_kills = greatest(public.users.total_kills, p_kills),
    total_correct = greatest(public.users.total_correct, p_correct_answers),
    total_answers = greatest(public.users.total_answers, p_total_answers),
    last_login_at = now(),
    updated_at = now()
  where id = v_user.id;

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
    v_user.id,
    p_run_id,
    v_user.display_name,
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
    player_name = v_user.display_name,
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

revoke all on function public.submit_leaderboard_run(uuid, text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_leaderboard_run(uuid, text, integer, integer, integer, text)
  to anon, authenticated;

drop function if exists public.submit_pvp_match_result(text, text, text, integer, integer, integer);
drop function if exists public.submit_pvp_match_result(text, text, text, integer, integer, integer, text);
create or replace function public.submit_pvp_match_result(
  p_match_id text,
  p_player_name text,
  p_outcome text,
  p_correct_answers integer default 0,
  p_total_answers integer default 0,
  p_damage_dealt integer default 0,
  p_session_token text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint := public._resolve_session_user_id(p_session_token);
  v_user public.users;
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
  v_match_id text := btrim(coalesce(p_match_id, ''));
  v_delta integer;
  v_win integer := case when v_outcome = 'won' then 1 else 0 end;
  v_loss integer := case when v_outcome = 'lost' then 1 else 0 end;
  v_draw integer := case when v_outcome = 'draw' then 1 else 0 end;
begin
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Please log in to submit 1v1 results.';
  end if;

  if char_length(v_match_id) < 1
    or v_outcome not in ('won', 'lost', 'draw')
    or p_correct_answers is null or p_correct_answers < 0
    or p_total_answers is null or p_total_answers < p_correct_answers
    or p_damage_dealt is null or p_damage_dealt < 0
  then
    raise exception 'Invalid 1v1 match result data.';
  end if;

  select * into v_user
  from public.users
  where id = v_user_id;

  if v_user.id is null then
    raise exception 'AUTH_SESSION_INVALID: Please log in to submit 1v1 results.';
  end if;

  v_delta := case
    when v_outcome = 'won' then 25
    when v_outcome = 'draw' then 5
    else -15
  end;

  update public.users
  set last_login_at = now(), updated_at = now()
  where id = v_user.id;

  insert into public.pvp_leaderboard_entries (
    user_id, player_name, rating, wins, losses, draws,
    damage_dealt, correct_answers, total_answers, last_match_id, updated_at
  )
  values (
    v_user.id, v_user.display_name, greatest(100, 1000 + v_delta),
    v_win, v_loss, v_draw, p_damage_dealt, p_correct_answers, p_total_answers, v_match_id, now()
  )
  on conflict (user_id) do update set
    player_name = v_user.display_name,
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

revoke all on function public.submit_pvp_match_result(text, text, text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_pvp_match_result(text, text, text, integer, integer, integer, text)
  to anon, authenticated;

-- Refresh PostgREST schema cache immediately so new RPCs are callable right away
notify pgrst, 'reload schema';
