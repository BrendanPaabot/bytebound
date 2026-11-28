# Supabase Users, Leaderboard & 1v1 Multiplayer Setup

1. Create or open your Supabase project.
2. In the **SQL Editor**, run these scripts in order:
   1. [`supabase/schema.sql`](./supabase/schema.sql) — creates `public.users`, `public.leaderboard_entries`, `public.pvp_leaderboard_entries`, and `public.multiplayer_rooms` + Realtime publication.
   2. [`supabase/migration-leaderboard-run-checks.sql`](./supabase/migration-leaderboard-run-checks.sql) — enforces server-side leaderboard run validation checks.
   3. [`supabase/migration-1v1-leaderboard.sql`](./supabase/migration-1v1-leaderboard.sql) — adds `public.pvp_leaderboard_entries` + `submit_pvp_match_result` and kill-gated Arcade submission.
   4. [`supabase/migration-password-auth.sql`](./supabase/migration-password-auth.sql) — restores password-based accounts with `pgcrypto` bcrypt salted password hashes in private `public.user_credentials`, opaque session tokens in `public.user_sessions`, and authoritative case/whitespace-insensitive username uniqueness (rejecting duplicates with no `#0001` auto-tagging) via `auth_sign_up`, `auth_log_in`, `auth_get_session`, `auth_logout`, `auth_save_profile`, and `auth_reset_profile`.
   5. [`supabase/migration-admin-console.sql`](./supabase/migration-admin-console.sql) — adds standalone administrator accounts, sessions, audit logs, forgot-password reset queue, academic year change requests, and Admin RPCs.
   6. [`supabase/migration-rate-limiting.sql`](./supabase/migration-rate-limiting.sql) — adds private sliding-window rate limiting (`public.api_rate_limits`) across login, admin login, forgot-password, year-change requests, and throttled leaderboard writes.
   7. [`supabase/migration-security-safety.sql`](./supabase/migration-security-safety.sql) — adds failed-login alerting, temporary-password change enforcement, global security banner broadcasts (`system_security_notices`), and tightened `multiplayer_rooms` RLS policies.
   8. [`supabase/migration-multiplayer-rooms-realtime.sql`](./supabase/migration-multiplayer-rooms-realtime.sql) — purges dead/stale rows from `public.multiplayer_rooms`, adds auto-expiring `expires_at` TTL + trigger, `REPLICA IDENTITY FULL` for live Realtime `DELETE` events, `mp_prune_stale_rooms()`, `mp_heartbeat_room()`, and `admin_close_multiplayer_room()`.
   9. [`supabase/migration-security-questions.sql`](./supabase/migration-security-questions.sql) — adds self-service multi-question password recovery (`public.user_security_questions`, requiring 2–3 distinct salted-bcrypt recovery questions at Sign Up or in Settings so users can verify any saved question to reset their password via `auth_get_security_questions`, `auth_reset_password_with_security_question`, and `auth_update_security_questions`) and removes Admin password-reset authority and reset-request RPCs (`admin_reset_user_password`, `admin_dismiss_reset_request`, `auth_request_password_reset`).
3. Verify the project URL and publishable key (or legacy anon key) in `supabase-config.js`:

   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://YOUR_PROJECT_ID.supabase.co',
     anonKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY',
   }
   ```

4. Ensure **Realtime** is enabled in your Supabase project (enabled by default in Supabase). BYTEBOUND uses Supabase Realtime (`bytebound:lobby:v1` Presence + Broadcast, per-room `bytebound:room:<CODE>` channels, and `public.multiplayer_rooms`) for cross-computer online 1v1 lobbies, invitation code verification, ready synchronization, and live 1v1 matches.
5. Serve the game from a local web server (`serve-local.cmd` / `serve-local.ps1`) or deploy it to a static host (GitHub Pages, Netlify, Vercel, etc.). Do not use a service-role or secret key in this browser app. When running locally with `serve-local.ps1`, `/api/auth/*` provides trusted server-side PBKDF2-SHA256 authentication offline or before the Supabase auth migration is applied, and `/api/mp/*` synchronizes local multiplayer clients.
6. Sign up or log in with a unique username and password on the welcome screen — click **1v1 Multiplayer** on the main menu to view online players, host public/private rooms, share invitation codes, ready up, and duel live.
