-- Bytebound Migration: Real-Time 1v1 Multiplayer Rooms TTL, Auto-Pruning & Lifecycle Sync
-- Run this script in the Supabase SQL Editor (after schema.sql and prior migrations).
-- Eliminates ghost/completed/stale rows from public.multiplayer_rooms, enables full
-- Realtime postgres_changes (INSERT / UPDATE / DELETE) payloads, and adds Admin close-room RPCs.

-- 1. Purge any already dead or stale rooms from prior sessions
delete from public.multiplayer_rooms
where status = 'closed'
   or updated_at < now() - interval '60 seconds';

-- 2. Add auto-expiring TTL column and index
alter table public.multiplayer_rooms
  add column if not exists expires_at timestamptz not null default (now() + interval '50 seconds');

update public.multiplayer_rooms
set expires_at = greatest(updated_at, now()) + interval '50 seconds';

create index if not exists multiplayer_rooms_expires_idx
  on public.multiplayer_rooms (expires_at);

-- 3. Enable REPLICA IDENTITY FULL + Realtime publication so DELETE events carry room code
alter table public.multiplayer_rooms replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.multiplayer_rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- 4. Keep updated_at and expires_at fresh on every INSERT/UPDATE
create or replace function public.trg_mp_rooms_touch_ttl()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'closed' then
    new.expires_at := now();
  else
    new.expires_at := now() + interval '50 seconds';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mp_rooms_touch_ttl on public.multiplayer_rooms;
create trigger trg_mp_rooms_touch_ttl
before insert or update on public.multiplayer_rooms
for each row
execute function public.trg_mp_rooms_touch_ttl();

-- 5. Safe stale-room pruner callable by lobby clients and Admin Console
create or replace function public.mp_prune_stale_rooms(
  p_ttl_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ttl integer := greatest(15, least(300, coalesce(p_ttl_seconds, 60)));
  v_deleted integer := 0;
begin
  delete from public.multiplayer_rooms
  where status = 'closed'
     or expires_at < now()
     or updated_at < now() - make_interval(secs => v_ttl);
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'pruned', v_deleted);
end;
$$;
revoke all on function public.mp_prune_stale_rooms(integer) from public, anon, authenticated;
grant execute on function public.mp_prune_stale_rooms(integer) to anon, authenticated;

-- 6. Host room keepalive heartbeat (extends TTL while actively waiting or in match)
create or replace function public.mp_heartbeat_room(
  p_code text,
  p_host_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_host text := btrim(coalesce(p_host_client_id, ''));
  v_updated integer := 0;
begin
  perform public.mp_prune_stale_rooms(60);

  if v_code !~ '^[A-Z0-9]{4,8}$' or v_host = '' then
    return jsonb_build_object('ok', false, 'alive', false);
  end if;

  update public.multiplayer_rooms
  set updated_at = now(),
      expires_at = now() + interval '50 seconds'
  where code = v_code
    and host_client_id = v_host
    and status <> 'closed';

  get diagnostics v_updated = row_count;
  return jsonb_build_object('ok', true, 'alive', v_updated > 0);
end;
$$;
revoke all on function public.mp_heartbeat_room(text, text) from public, anon, authenticated;
grant execute on function public.mp_heartbeat_room(text, text) to anon, authenticated;

-- 7. Admin RPC to forcibly close & delete a multiplayer room from Supabase + audit log it
create or replace function public.admin_close_multiplayer_room(
  p_admin_token text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_deleted integer := 0;
begin
  v_actor := public._resolve_admin_session(p_admin_token);
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_UNAUTHORIZED', 'error', 'Admin session expired or invalid.');
  end if;
  if v_code !~ '^[A-Z0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE', 'error', 'Invalid room code.');
  end if;

  delete from public.multiplayer_rooms where code = v_code;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.admin_audit_logs (actor, action, target, detail)
    values (v_actor, 'ROOM_CLOSED', v_code, 'Administrator closed live 1v1 room ' || v_code);
  end if;

  return jsonb_build_object('ok', true, 'code', v_code, 'deleted', v_deleted > 0);
end;
$$;
revoke all on function public.admin_close_multiplayer_room(text, text) from public, anon, authenticated;
grant execute on function public.admin_close_multiplayer_room(text, text) to anon, authenticated;

-- 8. Restrict RLS reads to live non-expired rooms and preserve strict room-code writes/deletes
drop policy if exists "Multiplayer rooms are readable" on public.multiplayer_rooms;
create policy "Multiplayer rooms are readable"
  on public.multiplayer_rooms
  for select
  to anon, authenticated
  using (status in ('waiting', 'full', 'in_match') and expires_at >= now() - interval '15 seconds');

drop policy if exists "Multiplayer rooms can be created" on public.multiplayer_rooms;
create policy "Multiplayer rooms can be created"
  on public.multiplayer_rooms
  for insert
  to anon, authenticated
  with check (code ~ '^[A-Z0-9]{4,8}$' and status in ('waiting', 'full', 'in_match') and char_length(btrim(host_name)) between 1 and 24);

drop policy if exists "Multiplayer rooms can be updated" on public.multiplayer_rooms;
create policy "Multiplayer rooms can be updated"
  on public.multiplayer_rooms
  for update
  to anon, authenticated
  using (code ~ '^[A-Z0-9]{4,8}$')
  with check (code ~ '^[A-Z0-9]{4,8}$' and status in ('waiting', 'full', 'in_match', 'closed') and char_length(btrim(host_name)) between 1 and 24);

drop policy if exists "Multiplayer rooms can be deleted" on public.multiplayer_rooms;
create policy "Multiplayer rooms can be deleted"
  on public.multiplayer_rooms
  for delete
  to anon, authenticated
  using (code ~ '^[A-Z0-9]{4,8}$');
