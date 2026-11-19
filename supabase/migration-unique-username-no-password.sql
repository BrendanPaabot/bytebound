-- Migration: Remove Password / PIN authentication and enforce passwordless unique username identification.
-- Run once in the Supabase SQL Editor on existing projects.

-- 1. Drop legacy PIN hash column from public.users
alter table public.users
  drop column if exists pin_hash;

-- 2. Ensure case-insensitive unique index on username_key
create unique index if not exists users_username_key_unique_idx
  on public.users (username_key);

-- 3. Add registration RPC that keeps the requested username if available, or atomically assigns an Xbox-style #0001..#9999 numeric discriminator on duplicates
drop function if exists public.register_user_profile(text);
create or replace function public.register_user_profile(
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text := btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
  v_base text;
  v_candidate_name text;
  v_candidate_key text;
  v_suffix integer := 0;
  v_user public.users;
begin
  if char_length(v_requested) not between 1 and 24 then
    raise exception 'Invalid username.';
  end if;

  v_base := btrim(regexp_replace(v_requested, '#[0-9]{1,4}$', ''));
  if char_length(v_base) < 1 then
    v_base := v_requested;
  end if;
  v_base := btrim(left(v_base, 19));
  if char_length(v_base) < 1 then
    v_base := left(v_requested, 19);
  end if;

  loop
    if v_suffix = 0 then
      v_candidate_name := v_requested;
    else
      if v_suffix > 9999 then
        raise exception 'No available numeric tag remains for this username.';
      end if;
      v_candidate_name := v_base || '#' || lpad(v_suffix::text, 4, '0');
    end if;
    v_candidate_key := lower(v_candidate_name);

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
        v_candidate_key,
        v_candidate_name,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      )
      returning * into v_user;
      exit;
    exception
      when unique_violation then
        v_suffix := v_suffix + 1;
    end;
  end loop;

  return jsonb_build_object(
    'id', v_user.id,
    'username_key', v_user.username_key,
    'display_name', v_user.display_name,
    'assigned_suffix', (v_suffix > 0),
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

revoke all on function public.register_user_profile(text)
  from public, anon, authenticated;
grant execute on function public.register_user_profile(text)
  to anon, authenticated;

-- 4. Replace upsert_user_profile without PIN parameters or checks
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb, text);
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
  v_display_name text := btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
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

-- 5. Replace reset_user_profile without PIN parameters or checks
drop function if exists public.reset_user_profile(text);
drop function if exists public.reset_user_profile(text, text);
create or replace function public.reset_user_profile(
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username_key text := lower(btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g')));
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

revoke all on function public.reset_user_profile(text)
  from public, anon, authenticated;
grant execute on function public.reset_user_profile(text)
  to anon, authenticated;
