-- Adds optional hashed 4-digit PIN protection to public.users and profile RPCs.
-- Run once in the Supabase SQL Editor on existing projects.

alter table public.users
  add column if not exists pin_hash text;

drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb, text);
create or replace function public.upsert_user_profile(
  p_username text,
  p_topic_progress jsonb default null,
  p_skill_progress jsonb default null,
  p_review_store jsonb default null,
  p_achievements jsonb default null,
  p_pin_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(p_username, ''));
  v_username_key text := lower(v_display_name);
  v_pin_hash text := nullif(btrim(coalesce(p_pin_hash, '')), '');
  v_existing public.users;
  v_user public.users;
begin
  if char_length(v_display_name) not between 1 and 24 then
    raise exception 'Invalid username.';
  end if;

  select * into v_existing
  from public.users
  where username_key = v_username_key;

  if v_existing.id is not null and v_existing.pin_hash is not null then
    if v_pin_hash is null or v_existing.pin_hash <> v_pin_hash then
      raise exception 'Invalid profile PIN.';
    end if;
  end if;

  insert into public.users (
    username_key,
    display_name,
    pin_hash,
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
    v_pin_hash,
    coalesce(p_topic_progress, '{}'::jsonb),
    coalesce(p_skill_progress, '{}'::jsonb),
    coalesce(p_review_store, '{}'::jsonb),
    coalesce(p_achievements, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (username_key) do update set
    display_name = excluded.display_name,
    pin_hash = coalesce(public.users.pin_hash, v_pin_hash),
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
    'has_pin', (v_user.pin_hash is not null),
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

revoke all on function public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.upsert_user_profile(text, jsonb, jsonb, jsonb, jsonb, text)
  to anon, authenticated;

drop function if exists public.reset_user_profile(text);
drop function if exists public.reset_user_profile(text, text);
create or replace function public.reset_user_profile(
  p_username text,
  p_pin_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username_key text := lower(btrim(coalesce(p_username, '')));
  v_pin_hash text := nullif(btrim(coalesce(p_pin_hash, '')), '');
  v_user_id bigint;
  v_existing_pin text;
begin
  if char_length(v_username_key) not between 1 and 24 then
    raise exception 'Invalid username.';
  end if;

  select id, pin_hash into v_user_id, v_existing_pin
  from public.users
  where username_key = v_username_key;

  if v_existing_pin is not null and (v_pin_hash is null or v_existing_pin <> v_pin_hash) then
    raise exception 'Invalid profile PIN.';
  end if;

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

revoke all on function public.reset_user_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.reset_user_profile(text, text)
  to anon, authenticated;
