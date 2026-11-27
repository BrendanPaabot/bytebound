-- Supabase Security Warnings, Failed-Login Alerts, Temp-Password Enforcement, Broadcast Notice & RLS Hardening
-- Run AFTER supabase/migration-password-auth.sql, migration-admin-console.sql, and migration-rate-limiting.sql.

-- 1. Account security tracking columns on public.users
alter table public.users
  add column if not exists must_change_password boolean not null default false,
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists last_failed_login_at timestamptz;

-- 2. System-wide Security & Data-Safety Notice table (broadcast banner)
create table if not exists public.system_security_notices (
  id integer primary key check (id = 1),
  active boolean not null default false,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null default '',
  message text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

insert into public.system_security_notices (id, active, severity, title, message, updated_by)
values (1, false, 'info', '', '', 'system')
on conflict (id) do nothing;

alter table public.system_security_notices enable row level security;
revoke all on public.system_security_notices from public, anon, authenticated;
drop policy if exists "System security notices are public to read" on public.system_security_notices;
create policy "System security notices are public to read"
  on public.system_security_notices
  for select
  to anon, authenticated
  using (id = 1);
grant select on table public.system_security_notices to anon, authenticated;

-- 3. Update _serialize_auth_user with security flags
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
    'must_change_password', coalesce(p_user.must_change_password, false),
    'failed_login_count', coalesce(p_user.failed_login_count, 0),
    'last_failed_login_at', p_user.last_failed_login_at,
    'created_at', p_user.created_at,
    'updated_at', p_user.updated_at,
    'last_login_at', p_user.last_login_at
  );
$$;
revoke all on function public._serialize_auth_user(public.users) from public, anon, authenticated;

-- 4. Update auth_log_in to record & surface failed login attempts + temp password status
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
  v_recent_failed integer := 0;
  v_last_failed timestamptz := null;
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
    if v_user.id is not null then
      update public.users
      set failed_login_count = coalesce(failed_login_count, 0) + 1,
          last_failed_login_at = now()
      where id = v_user.id;
    end if;
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS', 'error', 'Invalid username or password.');
  end if;

  if coalesce(v_user.is_suspended, false) then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_SUSPENDED', 'error', 'This account has been locked by an administrator.');
  end if;

  v_recent_failed := coalesce(v_user.failed_login_count, 0);
  v_last_failed := v_user.last_failed_login_at;

  perform public._clear_rate_limit(v_bucket);

  update public.users
  set last_login_at = now(),
      failed_login_count = 0,
      last_failed_login_at = null
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
    'recent_failed_logins', v_recent_failed,
    'last_failed_login_at', v_last_failed,
    'must_change_password', coalesce(v_user.must_change_password, false),
    'user', public._serialize_auth_user(v_user)
  );
end;
$$;
revoke all on function public.auth_log_in(text, text) from public, anon, authenticated;
grant execute on function public.auth_log_in(text, text) to anon, authenticated;

-- 5. Flag must_change_password on admin password reset; clear on player change-password
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

  update public.users set must_change_password = true, updated_at = now() where id = v_user.id;

  delete from public.user_sessions where user_id = v_user.id;
  get diagnostics v_revoked = row_count;

  update public.password_reset_requests
  set status = 'resolved', resolved_at = now(), resolved_by = v_admin.display_name
  where username_key = v_user.username_key and status = 'pending';

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (v_admin.display_name, 'CHANGE_PASSWORD', v_user.display_name, 'Set temporary password & signed out ' || v_revoked || ' active login(s)');

  return jsonb_build_object('ok', true, 'temporaryPassword', v_pass, 'revokedSessions', v_revoked);
end;
$$;
revoke all on function public.admin_reset_user_password(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_reset_user_password(text, text, text) to anon, authenticated;

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

  update public.users set must_change_password = false, updated_at = now() where id = v_user_id;

  v_cur_token_hash := encode(digest(convert_to(btrim(p_session_token), 'utf8'), 'sha256'::text), 'hex');
  delete from public.user_sessions where user_id = v_user_id and token_hash <> v_cur_token_hash;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.auth_change_password(text, text, text) from public, anon, authenticated;
grant execute on function public.auth_change_password(text, text, text) to anon, authenticated;

-- 6. Admin Security Notice Broadcast RPC & Overview Integration
create or replace function public.admin_set_security_notice(
  p_admin_token text,
  p_active boolean,
  p_severity text default 'info',
  p_title text default '',
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin public.admin_accounts;
  v_sev text := case when lower(coalesce(p_severity, '')) in ('info', 'warning', 'critical') then lower(p_severity) else 'info' end;
  v_title text := left(btrim(coalesce(p_title, '')), 120);
  v_msg text := left(btrim(coalesce(p_message, '')), 400);
  v_active boolean := coalesce(p_active, false) and (v_title <> '' or v_msg <> '');
  v_notice public.system_security_notices;
begin
  v_admin := public._resolve_admin_session(p_admin_token);
  if v_admin.id is null then raise exception 'ADMIN_UNAUTHORIZED: Unauthorized.'; end if;

  update public.system_security_notices
  set active = v_active,
      severity = v_sev,
      title = v_title,
      message = v_msg,
      updated_at = now(),
      updated_by = v_admin.display_name
  where id = 1
  returning * into v_notice;

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (
    v_admin.display_name,
    'SECURITY_NOTICE_UPDATED',
    'System Banner',
    case when v_active then 'Published ' || upper(v_sev) || ' notice: ' || coalesce(nullif(v_title, ''), left(v_msg, 60)) else 'Cleared active security notice' end
  );

  return jsonb_build_object(
    'ok', true,
    'notice', jsonb_build_object(
      'active', v_notice.active,
      'severity', v_notice.severity,
      'title', v_notice.title,
      'message', v_notice.message,
      'updated_at', v_notice.updated_at,
      'updated_by', v_notice.updated_by
    )
  );
end;
$$;
revoke all on function public.admin_set_security_notice(text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_security_notice(text, boolean, text, text, text) to anon, authenticated;

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
  v_notice public.system_security_notices;
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

  select * into v_notice from public.system_security_notices where id = 1;

  return jsonb_build_object(
    'ok', true,
    'server', jsonb_build_object('provider', 'supabase', 'rateLimiting', true, 'activeSessions', v_active_sessions),
    'users', v_users,
    'resetRequests', v_reqs,
    'yearRequests', v_year_reqs,
    'auditLogs', v_logs,
    'securityNotice', case
      when v_notice.id is not null then jsonb_build_object(
        'active', v_notice.active,
        'severity', v_notice.severity,
        'title', v_notice.title,
        'message', v_notice.message,
        'updated_at', v_notice.updated_at,
        'updated_by', v_notice.updated_by
      )
      else jsonb_build_object('active', false, 'severity', 'info', 'title', '', 'message', '')
    end
  );
end;
$$;
revoke all on function public.admin_get_overview(text) from public, anon, authenticated;
grant execute on function public.admin_get_overview(text) to anon, authenticated;

-- 7. Tighten multiplayer_rooms RLS boundaries (prevent malformed codes or non-expired room tampering)
drop policy if exists "Multiplayer rooms can be created" on public.multiplayer_rooms;
create policy "Multiplayer rooms can be created"
  on public.multiplayer_rooms
  for insert
  to anon, authenticated
  with check (code ~ '^[A-Z0-9]{4,8}$' and status in ('waiting', 'full', 'in_match'));

drop policy if exists "Multiplayer rooms can be updated" on public.multiplayer_rooms;
create policy "Multiplayer rooms can be updated"
  on public.multiplayer_rooms
  for update
  to anon, authenticated
  using (code ~ '^[A-Z0-9]{4,8}$')
  with check (code ~ '^[A-Z0-9]{4,8}$' and status in ('waiting', 'full', 'in_match', 'closed'));

drop policy if exists "Multiplayer rooms can be deleted" on public.multiplayer_rooms;
create policy "Multiplayer rooms can be deleted"
  on public.multiplayer_rooms
  for delete
  to anon, authenticated
  using (code ~ '^[A-Z0-9]{4,8}$');
