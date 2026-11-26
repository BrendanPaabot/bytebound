-- Migration: Comprehensive Bytebound Admin Console + Forgot/Change Password + Account Controls.
-- Run once in the Supabase SQL Editor after schema.sql and migration-password-auth.sql.
-- Safe to re-run (idempotent).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1. Account suspension flag on public.users
alter table public.users
  add column if not exists is_suspended boolean not null default false;

-- Update user serializer to include is_suspended
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
    'is_suspended', coalesce(p_user.is_suspended, false),
    'created_at', p_user.created_at,
    'updated_at', p_user.updated_at,
    'last_login_at', p_user.last_login_at
  );
$$;
revoke all on function public._serialize_auth_user(public.users) from public, anon, authenticated;

-- Enforce suspension check inside session resolver
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
  join public.users u on u.id = s.user_id
  where s.token_hash = v_token_hash
    and s.expires_at > now()
    and coalesce(u.is_suspended, false) = false;

  return v_user_id;
end;
$$;
revoke all on function public._resolve_session_user_id(text) from public, anon, authenticated;

-- Enforce suspension check on login
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

  v_computed := crypt(v_password, coalesce(v_password_hash, v_dummy_hash));

  if v_user.id is null or v_password_hash is null or v_computed <> v_password_hash then
    raise exception 'AUTH_INVALID_CREDENTIALS: Invalid username or password.';
  end if;

  if coalesce(v_user.is_suspended, false) then
    raise exception 'AUTH_ACCOUNT_SUSPENDED: This account has been locked by an administrator.';
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

-- 2. Password Reset Requests table (populated when a player clicks "Forgot password?")
create table if not exists public.password_reset_requests (
  id bigint generated always as identity primary key,
  user_id bigint references public.users(id) on delete cascade,
  username_key text not null,
  display_name text not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists password_reset_requests_status_idx
  on public.password_reset_requests (status, created_at desc);

alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from public, anon, authenticated;

-- 2B. Year Level Change Requests table (players locked to sign-up year can request changes here)
create table if not exists public.year_change_requests (
  id bigint generated always as identity primary key,
  user_id bigint references public.users(id) on delete cascade,
  username_key text not null,
  display_name text not null,
  current_year integer not null check (current_year between 1 and 4),
  requested_year integer not null check (requested_year between 1 and 4),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists year_change_requests_status_idx
  on public.year_change_requests (status, created_at desc);

alter table public.year_change_requests enable row level security;
revoke all on public.year_change_requests from public, anon, authenticated;

-- 2C. Player RPC: Request Year Level Change (from Settings)
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

-- 3. Player RPC: Request Password Reset ("Forgot password?" on login screen)
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
begin
  if char_length(v_name) not between 1 and 24 then
    raise exception 'AUTH_INVALID_USERNAME: Enter your username (1 to 24 characters).';
  end if;

  select * into v_user from public.users where username_key = v_key;
  if v_user.id is null then
    raise exception 'AUTH_ACCOUNT_NOT_FOUND: No account found with username "%". Please check the spelling or sign up first.', v_name;
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

-- 4. Player RPC: Change Password (while logged in, from Settings)
create or replace function public.auth_change_password(
  p_session_token text,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id bigint;
  v_stored_hash text;
  v_cur text := coalesce(p_current_password, '');
  v_new text := coalesce(p_new_password, '');
  v_cur_token_hash text;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);
  if v_user_id is null then
    raise exception 'AUTH_SESSION_INVALID: Your session has expired. Please log in again.';
  end if;

  if char_length(v_new) < 6 or char_length(v_new) > 72 or char_length(btrim(v_new)) = 0 then
    raise exception 'AUTH_INVALID_PASSWORD: New password must be between 6 and 72 characters.';
  end if;

  select password_hash into v_stored_hash from public.user_credentials where user_id = v_user_id;
  if v_stored_hash is null or crypt(v_cur, v_stored_hash) <> v_stored_hash then
    raise exception 'AUTH_INVALID_CREDENTIALS: Current password is incorrect.';
  end if;

  update public.user_credentials
  set password_hash = crypt(v_new, gen_salt('bf'::text, 12)), updated_at = now()
  where user_id = v_user_id;

  v_cur_token_hash := encode(digest(convert_to(btrim(p_session_token), 'utf8'), 'sha256'::text), 'hex');
  delete from public.user_sessions where user_id = v_user_id and token_hash <> v_cur_token_hash;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.auth_change_password(text, text, text) from public, anon, authenticated;
grant execute on function public.auth_change_password(text, text, text) to anon, authenticated;

-- 5. Server-only Admin Accounts, Sessions, and Audit Logs
create table if not exists public.admin_accounts (
  id bigint generated always as identity primary key,
  username_key text not null unique check (char_length(btrim(username_key)) between 3 and 32),
  display_name text not null check (char_length(btrim(display_name)) between 3 and 32),
  role text not null default 'superadmin' check (role in ('superadmin', 'ops', 'moderator')),
  password_hash text not null check (password_hash ~ '^\$2[aby]\$[0-9]{2}\$'),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table public.admin_accounts enable row level security;
revoke all on public.admin_accounts from public, anon, authenticated;

create table if not exists public.admin_sessions (
  token_hash text primary key,
  admin_id bigint not null references public.admin_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from public, anon, authenticated;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from public, anon, authenticated;

insert into public.admin_accounts (username_key, display_name, role, password_hash)
values ('sysadmin', 'sysadmin', 'superadmin', extensions.crypt('bytebound-admin', extensions.gen_salt('bf'::text, 12)))
on conflict (username_key) do update
set password_hash = excluded.password_hash;

create or replace function public._resolve_admin_session(p_admin_token text)
returns public.admin_accounts
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tok text := btrim(coalesce(p_admin_token, ''));
  v_hash text;
  v_admin public.admin_accounts;
begin
  if char_length(v_tok) < 32 then return null; end if;
  v_hash := encode(digest(convert_to(v_tok, 'utf8'), 'sha256'::text), 'hex');
  select a.* into v_admin
  from public.admin_sessions s
  join public.admin_accounts a on a.id = s.admin_id
  where s.token_hash = v_hash and s.expires_at > now();
  return v_admin;
end;
$$;
revoke all on function public._resolve_admin_session(text) from public, anon, authenticated;

-- 6. Admin Login
create or replace function public.admin_log_in(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_key text := lower(btrim(coalesce(p_username, '')));
  v_pass text := coalesce(p_password, '');
  v_admin public.admin_accounts;
  v_dummy text := '$2a$12$C6UzMDM.H6dfI/f/IKxGhu6C8M7xT7P1z8xN4M2P5W6Q9yH2vK3aW';
  v_tok text;
  v_hash text;
  v_exp timestamptz := now() + interval '12 hours';
begin
  select * into v_admin from public.admin_accounts where username_key = v_key;
  if v_admin.id is null or crypt(v_pass, coalesce(v_admin.password_hash, v_dummy)) <> coalesce(v_admin.password_hash, '') then
    insert into public.admin_audit_logs (actor, action, target, detail)
    values (coalesce(nullif(v_key, ''), 'unknown'), 'ADMIN_LOGIN_FAILED', 'Admin Console', 'Wrong username or password');
    raise exception 'ADMIN_INVALID_CREDENTIALS: Invalid administrator username or password.';
  end if;

  update public.admin_accounts set last_login_at = now() where id = v_admin.id;
  delete from public.admin_sessions where admin_id = v_admin.id and expires_at <= now();

  v_tok := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(convert_to(v_tok, 'utf8'), 'sha256'::text), 'hex');
  insert into public.admin_sessions (token_hash, admin_id, expires_at) values (v_hash, v_admin.id, v_exp);
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'ADMIN_LOGIN', 'Admin Console', 'Signed in via Cloud Database');

  return jsonb_build_object(
    'admin_token', v_tok,
    'expires_at', v_exp,
    'admin', jsonb_build_object('username', v_admin.display_name, 'role', v_admin.role)
  );
end;
$$;
revoke all on function public.admin_log_in(text, text) from public, anon, authenticated;
grant execute on function public.admin_log_in(text, text) to anon, authenticated;

-- 7. Admin Overview (Users + Reset Requests + Audit Logs + Active Sessions)
create or replace function public.admin_get_overview(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_users jsonb;
  v_reqs jsonb;
  v_year_reqs jsonb;
  v_logs jsonb;
  v_active_sessions integer;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Admin session expired.'; end if;

  select count(*)::integer into v_active_sessions from public.user_sessions where expires_at > now();

  select coalesce(jsonb_agg(
    public._serialize_auth_user(u) || jsonb_build_object(
      'active_sessions', (select count(*)::integer from public.user_sessions s where s.user_id = u.id and s.expires_at > now()),
      'source', 'supabase'
    ) order by u.last_login_at desc
  ), '[]'::jsonb) into v_users from public.users u;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'username_key', r.username_key,
    'display_name', r.display_name,
    'note', r.note,
    'status', r.status,
    'created_at', r.created_at,
    'resolved_at', r.resolved_at,
    'resolved_by', r.resolved_by
  ) order by case when r.status = 'pending' then 0 else 1 end, r.created_at desc), '[]'::jsonb) into v_reqs
  from (select * from public.password_reset_requests order by created_at desc limit 100) r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', y.id,
    'username_key', y.username_key,
    'display_name', y.display_name,
    'current_year', y.current_year,
    'requested_year', y.requested_year,
    'reason', y.reason,
    'status', y.status,
    'created_at', y.created_at,
    'resolved_at', y.resolved_at,
    'resolved_by', y.resolved_by
  ) order by case when y.status = 'pending' then 0 else 1 end, y.created_at desc), '[]'::jsonb) into v_year_reqs
  from (select * from public.year_change_requests order by created_at desc limit 100) y;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'aud-' || l.id,
    'timestamp', l.created_at,
    'actor', l.actor,
    'action', l.action,
    'target', l.target,
    'detail', l.detail
  ) order by l.created_at desc), '[]'::jsonb) into v_logs
  from (select * from public.admin_audit_logs order by created_at desc limit 120) l;

  return jsonb_build_object(
    'ok', true,
    'server', jsonb_build_object('provider', 'supabase', 'activeSessions', v_active_sessions),
    'users', v_users,
    'resetRequests', v_reqs,
    'yearRequests', v_year_reqs,
    'auditLogs', v_logs
  );
end;
$$;
revoke all on function public.admin_get_overview(text) from public, anon, authenticated;
grant execute on function public.admin_get_overview(text) to anon, authenticated;

-- 8. Admin Create Player Account
create or replace function public.admin_create_user(p_admin_token text, p_username text, p_password text, p_year integer default 4)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_display text := btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
  v_key text := lower(v_display);
  v_year integer := greatest(1, least(4, coalesce(p_year, 4)));
  v_user public.users;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  if char_length(v_display) not between 1 and 24 then raise exception 'INVALID_USERNAME: Username must be 1 to 24 characters.'; end if;
  if char_length(coalesce(p_password, '')) not between 6 and 72 then raise exception 'INVALID_PASSWORD: Password must be 6 to 72 characters.'; end if;

  insert into public.users (username_key, display_name, review_store, last_login_at, updated_at)
  values (v_key, v_display, jsonb_build_object('academicYear', v_year), now(), now())
  returning * into v_user;

  insert into public.user_credentials (user_id, password_hash)
  values (v_user.id, crypt(p_password, gen_salt('bf'::text, 12)));

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'CREATE_ACCOUNT', v_user.display_name, 'Created new Year ' || v_year || ' account');

  return jsonb_build_object('ok', true, 'user', public._serialize_auth_user(v_user));
end;
$$;
revoke all on function public.admin_create_user(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_create_user(text, text, text, integer) to anon, authenticated;

-- 9. Admin Reset/Change Player Password (also resolves pending Forgot Password requests)
create or replace function public.admin_reset_user_password(p_admin_token text, p_username_key text, p_new_password text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_user public.users;
  v_pass text := coalesce(nullif(btrim(p_new_password), ''), 'BB-' || upper(encode(gen_random_bytes(4), 'hex')));
  v_revoked integer;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  select * into v_user from public.users where username_key = lower(btrim(coalesce(p_username_key, '')));
  if v_user.id is null then raise exception 'USER_NOT_FOUND: User account not found.'; end if;

  insert into public.user_credentials (user_id, password_hash, updated_at)
  values (v_user.id, crypt(v_pass, gen_salt('bf'::text, 12)), now())
  on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now();

  delete from public.user_sessions where user_id = v_user.id;
  get diagnostics v_revoked = row_count;

  update public.password_reset_requests
  set status = 'resolved', resolved_at = now(), resolved_by = v_admin.display_name
  where username_key = v_user.username_key and status = 'pending';

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'CHANGE_PASSWORD', v_user.display_name, 'Set new password & signed out ' || v_revoked || ' active login(s)');

  return jsonb_build_object('ok', true, 'temporaryPassword', v_pass, 'revokedSessions', v_revoked);
end;
$$;
revoke all on function public.admin_reset_user_password(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_reset_user_password(text, text, text) to anon, authenticated;

-- 10. Admin Dismiss Forgot Password Request
create or replace function public.admin_dismiss_reset_request(p_admin_token text, p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  update public.password_reset_requests
  set status = 'dismissed', resolved_at = now(), resolved_by = v_admin.display_name
  where id = p_request_id;
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'DISMISS_RESET_REQ', 'Request #' || p_request_id, 'Dismissed password reset request');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_dismiss_reset_request(text, bigint) from public, anon, authenticated;
grant execute on function public.admin_dismiss_reset_request(text, bigint) to anon, authenticated;

-- 11. Admin Change User Academic Year (resolves any pending year requests for that player)
create or replace function public.admin_set_user_year(p_admin_token text, p_username_key text, p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_year integer := greatest(1, least(4, coalesce(p_year, 4)));
  v_user public.users;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  update public.users
  set review_store = coalesce(review_store, '{}'::jsonb) || jsonb_build_object('academicYear', v_year),
      updated_at = now()
  where username_key = lower(btrim(coalesce(p_username_key, '')))
  returning * into v_user;
  if v_user.id is null then raise exception 'USER_NOT_FOUND: User account not found.'; end if;
  update public.year_change_requests
  set status = 'approved', resolved_at = now(), resolved_by = v_admin.display_name
  where username_key = v_user.username_key and status = 'pending';
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'CHANGE_YEAR_LEVEL', v_user.display_name, 'Updated academic year to Year ' || v_year);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_user_year(text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_set_user_year(text, text, integer) to anon, authenticated;

-- 11B. Admin Approve Year Change Request
create or replace function public.admin_approve_year_request(p_admin_token text, p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_req public.year_change_requests;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  select * into v_req from public.year_change_requests where id = p_request_id;
  if v_req.id is null then raise exception 'REQUEST_NOT_FOUND: Year change request not found.'; end if;

  update public.users
  set review_store = coalesce(review_store, '{}'::jsonb) || jsonb_build_object('academicYear', v_req.requested_year),
      updated_at = now()
  where username_key = v_req.username_key;

  update public.year_change_requests
  set status = 'approved', resolved_at = now(), resolved_by = v_admin.display_name
  where id = v_req.id;

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'APPROVE_YEAR_REQ', v_req.display_name, 'Approved Year ' || v_req.current_year || ' -> Year ' || v_req.requested_year);
  return jsonb_build_object('ok', true, 'academicYear', v_req.requested_year);
end;
$$;
revoke all on function public.admin_approve_year_request(text, bigint) from public, anon, authenticated;
grant execute on function public.admin_approve_year_request(text, bigint) to anon, authenticated;

-- 11C. Admin Dismiss Year Change Request
create or replace function public.admin_dismiss_year_request(p_admin_token text, p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  update public.year_change_requests
  set status = 'dismissed', resolved_at = now(), resolved_by = v_admin.display_name
  where id = p_request_id and status = 'pending';
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'DISMISS_YEAR_REQ', 'Request #' || p_request_id, 'Dismissed year change request');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_dismiss_year_request(text, bigint) from public, anon, authenticated;
grant execute on function public.admin_dismiss_year_request(text, bigint) to anon, authenticated;

-- 12. Admin Lock / Unlock (Suspend) User
create or replace function public.admin_toggle_suspend_user(p_admin_token text, p_username_key text, p_suspended boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_user public.users;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  update public.users
  set is_suspended = coalesce(p_suspended, false), updated_at = now()
  where username_key = lower(btrim(coalesce(p_username_key, '')))
  returning * into v_user;
  if v_user.id is null then raise exception 'USER_NOT_FOUND: User account not found.'; end if;
  if v_user.is_suspended then
    delete from public.user_sessions where user_id = v_user.id;
  end if;
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, case when v_user.is_suspended then 'LOCK_ACCOUNT' else 'UNLOCK_ACCOUNT' end, v_user.display_name, case when v_user.is_suspended then 'Suspended account & ended logins' else 'Restored account access' end);
  return jsonb_build_object('ok', true, 'is_suspended', v_user.is_suspended);
end;
$$;
revoke all on function public.admin_toggle_suspend_user(text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_toggle_suspend_user(text, text, boolean) to anon, authenticated;

-- 13. Admin Reset Player Progress (keeps login)
create or replace function public.admin_reset_user_progress(p_admin_token text, p_username_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_user public.users;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  update public.users
  set best_score = 0, total_kills = 0, total_correct = 0, total_answers = 0,
      topic_progress = '{}'::jsonb, skill_progress = '{}'::jsonb,
      review_store = jsonb_build_object('academicYear', coalesce((review_store->>'academicYear')::int, 4)),
      achievements = '{}'::jsonb, updated_at = now()
  where username_key = lower(btrim(coalesce(p_username_key, '')))
  returning * into v_user;
  if v_user.id is null then raise exception 'USER_NOT_FOUND: User account not found.'; end if;
  delete from public.leaderboard_entries where user_id = v_user.id;
  delete from public.pvp_leaderboard_entries where lower(btrim(player_name)) = v_user.username_key;
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'RESET_PROGRESS', v_user.display_name, 'Cleared game stats, tracker, and scores');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_reset_user_progress(text, text) from public, anon, authenticated;
grant execute on function public.admin_reset_user_progress(text, text) to anon, authenticated;

-- 14. Admin Force Log Out (Revoke Sessions)
create or replace function public.admin_revoke_user_sessions(p_admin_token text, p_username_key text default null, p_all boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_revoked integer := 0;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  if p_all then
    delete from public.user_sessions;
    get diagnostics v_revoked = row_count;
  else
    delete from public.user_sessions s using public.users u
    where s.user_id = u.id and u.username_key = lower(btrim(coalesce(p_username_key, '')));
    get diagnostics v_revoked = row_count;
  end if;
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'FORCE_LOGOUT', case when p_all then 'All Players' else coalesce(p_username_key, '') end, 'Signed out ' || v_revoked || ' active login(s)');
  return jsonb_build_object('ok', true, 'revokedSessions', v_revoked);
end;
$$;
revoke all on function public.admin_revoke_user_sessions(text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(text, text, boolean) to anon, authenticated;

-- 15. Admin Delete User Account
create or replace function public.admin_delete_user(p_admin_token text, p_username_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_user public.users;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  select * into v_user from public.users where username_key = lower(btrim(coalesce(p_username_key, '')));
  if v_user.id is null then raise exception 'USER_NOT_FOUND: User account not found.'; end if;
  delete from public.users where id = v_user.id;
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'DELETE_ACCOUNT', v_user.display_name, 'Permanently deleted account and records');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_delete_user(text, text) from public, anon, authenticated;
grant execute on function public.admin_delete_user(text, text) to anon, authenticated;

-- 16. Admin Delete Leaderboard Entry
create or replace function public.admin_delete_leaderboard_entry(p_admin_token text, p_table text, p_entry_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;
  if p_table = 'arcade' then delete from public.leaderboard_entries where id = p_entry_id;
  elsif p_table = 'pvp' then delete from public.pvp_leaderboard_entries where id = p_entry_id;
  else raise exception 'INVALID_TABLE: Unknown leaderboard table.'; end if;
  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'REMOVE_SCORE', p_table || ' #' || p_entry_id, 'Removed leaderboard entry');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_delete_leaderboard_entry(text, text, bigint) from public, anon, authenticated;
grant execute on function public.admin_delete_leaderboard_entry(text, text, bigint) to anon, authenticated;
