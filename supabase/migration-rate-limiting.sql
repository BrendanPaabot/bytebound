-- Supabase Rate Limiting & Concurrency Protection Migration
-- Run this AFTER supabase/migration-password-auth.sql and supabase/migration-admin-console.sql.
-- Protects auth_log_in, admin_log_in, forgot-password, year-change requests, and leaderboard writes.

-- 1. Private Sliding-Window Rate-Limit Store
create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  hit_count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

-- Non-throwing rate-limit checker (returns allowed boolean + retry_after seconds so RPC callers can commit failure counters cleanly).
create or replace function public._check_rate_limit(
  p_bucket_key text,
  p_max_hits integer,
  p_window_seconds integer,
  p_consume boolean default true
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => greatest(1, p_window_seconds));
  v_row public.api_rate_limits;
  v_elapsed integer;
begin
  select * into v_row
  from public.api_rate_limits
  where bucket_key = p_bucket_key
  for update;

  if v_row.bucket_key is null or (v_row.window_start + v_window) <= v_now then
    if p_consume then
      insert into public.api_rate_limits (bucket_key, hit_count, window_start, updated_at)
      values (p_bucket_key, 1, v_now, v_now)
      on conflict (bucket_key) do update set
        hit_count = 1,
        window_start = v_now,
        updated_at = v_now;
    end if;
    return query select true, 0;
    return;
  end if;

  if v_row.hit_count >= p_max_hits then
    v_elapsed := greatest(0, floor(extract(epoch from (v_now - v_row.window_start)))::integer);
    return query select false, greatest(1, p_window_seconds - v_elapsed);
    return;
  end if;

  if p_consume then
    update public.api_rate_limits
    set hit_count = v_row.hit_count + 1,
        updated_at = v_now
    where bucket_key = p_bucket_key;
  end if;

  return query select true, 0;
end;
$$;
revoke all on function public._check_rate_limit(text, integer, integer, boolean) from public, anon, authenticated;

create or replace function public._clear_rate_limit(p_bucket_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  delete from public.api_rate_limits where bucket_key = p_bucket_key;
end;
$$;
revoke all on function public._clear_rate_limit(text) from public, anon, authenticated;

-- 2. Rate-Limited Player Login (5 failed attempts per 15 min per username; clears on valid sign-in)
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
  v_bucket text := 'login:' || coalesce(nullif(v_username_key, ''), 'blank');
  v_rl record;
  v_user public.users;
  v_password_hash text;
  v_dummy_hash text := '$2a$12$C6UzMDM.H6dfI/f/IKxGhu6C8M7xT7P1z8xN4M2P5W6Q9yH2vK3aW';
  v_computed text;
  v_session_token text;
  v_token_hash text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  select * into v_rl from public._check_rate_limit(v_bucket, 5, 900, false);
  if not coalesce(v_rl.allowed, true) then
    return jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retry_after', v_rl.retry_after,
      'error', 'Too many failed login attempts for "' || coalesce(nullif(v_display_name, ''), 'account') || '". Please wait ' || v_rl.retry_after || ' seconds and try again.'
    );
  end if;

  if char_length(v_display_name) not between 1 and 24 or char_length(v_password) = 0 or char_length(v_password) > 72 then
    perform public._check_rate_limit(v_bucket, 5, 900, true);
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS', 'error', 'Invalid username or password.');
  end if;

  select * into v_user
  from public.users
  where username_key = v_username_key;

  if v_user.id is not null then
    select c.password_hash into v_password_hash
    from public.user_credentials c
    where c.user_id = v_user.id;
  end if;

  v_computed := crypt(v_password, coalesce(v_password_hash, v_dummy_hash));

  if v_user.id is null or v_password_hash is null or v_computed <> v_password_hash then
    perform public._check_rate_limit(v_bucket, 5, 900, true);
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS', 'error', 'Invalid username or password.');
  end if;

  if coalesce(v_user.is_suspended, false) then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_SUSPENDED', 'error', 'This account has been locked by an administrator.');
  end if;

  perform public._clear_rate_limit(v_bucket);

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
    'ok', true,
    'session_token', v_session_token,
    'expires_at', v_expires_at,
    'user', public._serialize_auth_user(v_user)
  );
end;
$$;
revoke all on function public.auth_log_in(text, text) from public, anon, authenticated;
grant execute on function public.auth_log_in(text, text) to anon, authenticated;

-- 3. Rate-Limited Forgot-Password Request (3 requests / 10 min per account)
create or replace function public.auth_request_password_reset(
  p_username text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
  v_key text := lower(v_name);
  v_note text := left(btrim(coalesce(p_note, '')), 180);
  v_user public.users;
  v_existing_id bigint;
  v_rl record;
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'AUTH_INVALID_USERNAME: Enter your username (1 to 24 characters).';
  end if;

  select * into v_user from public.users where username_key = v_key;
  if v_user.id is null then
    raise exception 'AUTH_ACCOUNT_NOT_FOUND: No account found with username "%". Please check the spelling or sign up first.', v_name;
  end if;

  select * into v_rl from public._check_rate_limit('forgot:' || v_key, 3, 600, true);
  if not coalesce(v_rl.allowed, true) then
    return jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retry_after', v_rl.retry_after,
      'error', 'Too many password reset requests. Please wait ' || v_rl.retry_after || ' seconds and try again.'
    );
  end if;

  select id into v_existing_id
  from public.password_reset_requests
  where username_key = v_key and status = 'pending'
  limit 1;

  if v_existing_id is not null then
    update public.password_reset_requests
    set note = case when v_note <> '' then v_note else note end,
        created_at = now()
    where id = v_existing_id;
  else
    insert into public.password_reset_requests (user_id, username_key, display_name, note, status)
    values (v_user.id, v_user.username_key, v_user.display_name, v_note, 'pending');
  end if;

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (
    v_user.display_name,
    'FORGOT_PASSWORD_REQUEST',
    v_user.display_name,
    case when v_note <> '' then 'Requested password reset: ' || v_note else 'Submitted Forgot Password request' end
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Password reset request sent to the administrator. Ask your admin for your temporary password once approved.'
  );
end;
$$;
revoke all on function public.auth_request_password_reset(text, text) from public, anon, authenticated;
grant execute on function public.auth_request_password_reset(text, text) to anon, authenticated;

-- 4. Rate-Limited Year Change Request (3 requests / 10 min per player)
create or replace function public.auth_request_year_change(
  p_session_token text,
  p_requested_year integer,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint;
  v_user public.users;
  v_cur_year integer;
  v_req_year integer := greatest(1, least(4, coalesce(p_requested_year, 4)));
  v_reason text := left(btrim(coalesce(p_reason, '')), 180);
  v_existing_id bigint;
  v_rl record;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Your session has expired. Please log in again.';
  end if;

  select * into v_user from public.users where id = v_user_id;
  v_cur_year := coalesce((v_user.review_store->>'academicYear')::int, 4);
  if v_req_year = v_cur_year then
    raise exception 'INVALID_YEAR: You are already set to that Year Level.';
  end if;

  select * into v_rl from public._check_rate_limit('yearchg:' || v_user.username_key, 3, 600, true);
  if not coalesce(v_rl.allowed, true) then
    return jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retry_after', v_rl.retry_after,
      'error', 'Too many year change requests. Please wait ' || v_rl.retry_after || ' seconds and try again.'
    );
  end if;

  select id into v_existing_id
  from public.year_change_requests
  where username_key = v_user.username_key and status = 'pending'
  limit 1;

  if v_existing_id is not null then
    update public.year_change_requests
    set current_year = v_cur_year, requested_year = v_req_year, reason = v_reason, created_at = now()
    where id = v_existing_id;
  else
    insert into public.year_change_requests (user_id, username_key, display_name, current_year, requested_year, reason, status)
    values (v_user.id, v_user.username_key, v_user.display_name, v_cur_year, v_req_year, v_reason, 'pending')
    returning id into v_existing_id;
  end if;

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (
    v_user.display_name,
    'YEAR_CHANGE_REQUEST',
    v_user.display_name,
    'Requested Year ' || v_cur_year || ' -> Year ' || v_req_year || case when v_reason <> '' then ' (' || v_reason || ')' else '' end
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Year change request sent! Waiting for admin approval to switch to Year ' || v_req_year || '.',
    'request', jsonb_build_object(
      'id', v_existing_id,
      'current_year', v_cur_year,
      'requested_year', v_req_year,
      'reason', v_reason,
      'status', 'pending'
    )
  );
end;
$$;
revoke all on function public.auth_request_year_change(text, integer, text) from public, anon, authenticated;
grant execute on function public.auth_request_year_change(text, integer, text) to anon, authenticated;

-- 5. Rate-Limited Admin Login (5 failed attempts per 15 min per username; clears on valid sign-in)
create or replace function public.admin_log_in(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_key text := lower(btrim(coalesce(p_username, '')));
  v_pass text := coalesce(p_password, '');
  v_bucket text := 'admin-login:' || coalesce(nullif(v_key, ''), 'blank');
  v_rl record;
  v_admin public.admin_accounts;
  v_dummy text := '$2a$12$C6UzMDM.H6dfI/f/IKxGhu6C8M7xT7P1z8xN4M2P5W6Q9yH2vK3aW';
  v_tok text;
  v_hash text;
  v_exp timestamptz := now() + interval '12 hours';
begin
  select * into v_rl from public._check_rate_limit(v_bucket, 5, 900, false);
  if not coalesce(v_rl.allowed, true) then
    return jsonb_build_object(
      'ok', false,
      'code', 'RATE_LIMITED',
      'retry_after', v_rl.retry_after,
      'error', 'Too many failed admin login attempts. Please wait ' || v_rl.retry_after || ' seconds and try again.'
    );
  end if;

  select * into v_admin from public.admin_accounts where username_key = v_key;
  if v_admin.id is null or crypt(v_pass, coalesce(v_admin.password_hash, v_dummy)) <> coalesce(v_admin.password_hash, '') then
    perform public._check_rate_limit(v_bucket, 5, 900, true);
    insert into public.admin_audit_logs (actor, action, target, detail)
    values (coalesce(nullif(v_key, ''), 'unknown'), 'ADMIN_LOGIN_FAILED', 'Admin Console', 'Wrong username or password');
    return jsonb_build_object('ok', false, 'code', 'INVALID_ADMIN_CREDENTIALS', 'error', 'Invalid administrator username or password.');
  end if;

  perform public._clear_rate_limit(v_bucket);

  update public.admin_accounts set last_login_at = now() where id = v_admin.id;
  delete from public.admin_sessions where admin_id = v_admin.id and expires_at <= now();

  v_tok := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(convert_to(v_tok, 'utf8'), 'sha256'::text), 'hex');
  insert into public.admin_sessions (token_hash, admin_id, expires_at) values (v_hash, v_admin.id, v_exp);
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'ADMIN_LOGIN', 'Admin Console', 'Signed in via Cloud Database');

  return jsonb_build_object(
    'ok', true,
    'admin_token', v_tok,
    'expires_at', v_exp,
    'admin', jsonb_build_object('username', v_admin.display_name, 'role', v_admin.role)
  );
end;
$$;
revoke all on function public.admin_log_in(text, text) from public, anon, authenticated;
grant execute on function public.admin_log_in(text, text) to anon, authenticated;

-- 6. Throttled Leaderboard Submission (at most 1 write / 5s per user; silent no-op if identically bursted unless score improves)
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
  v_rl record;
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

  select * into v_rl from public._check_rate_limit('lb:' || v_user.id::text, 1, 5, true);
  if not coalesce(v_rl.allowed, true) then
    return;
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
