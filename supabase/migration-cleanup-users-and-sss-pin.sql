-- Cleanup: Remove all public.users accounts that are not on the Arcade leaderboard (public.leaderboard_entries),
-- and set/enforce password "123" (hashProfilePin('sss', '123') -> 'pin_8d2441bc307d3c4e') for user 'sss'.
-- Run this once in the Supabase SQL Editor (postgres / service role).

-- 1. Preview users that will be removed (optional read check)
-- select u.id, u.username_key, u.display_name, u.best_score, u.total_kills
-- from public.users u
-- where not exists (
--   select 1 from public.leaderboard_entries le where le.user_id = u.id
-- );

-- 2. Delete every user in public.users not linked to public.leaderboard_entries
-- (cascades to any orphaned pvp_leaderboard_entries rows via user_id FK)
delete from public.users u
where not exists (
  select 1
  from public.leaderboard_entries le
  where le.user_id = u.id
);

-- 3. Set password "123" for user 'sss' (matches index.js hashProfilePin('sss', '123'))
update public.users
set
  pin_hash = 'pin_8d2441bc307d3c4e',
  updated_at = now()
where username_key = 'sss';
