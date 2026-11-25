# Supabase Users, Leaderboard & 1v1 Multiplayer Setup

1. Create or open your Supabase project.
2. In the **SQL Editor**, run these scripts in order:
   1. [`supabase/schema.sql`](./supabase/schema.sql) — creates `public.users`, `public.leaderboard_entries`, `public.pvp_leaderboard_entries`, and `public.multiplayer_rooms` + Realtime publication.
   2. [`supabase/migration-leaderboard-run-checks.sql`](./supabase/migration-leaderboard-run-checks.sql) — enforces server-side leaderboard run validation checks.
   3. [`supabase/migration-1v1-leaderboard.sql`](./supabase/migration-1v1-leaderboard.sql) — adds `public.pvp_leaderboard_entries` + `submit_pvp_match_result` and kill-gated Arcade submission.
   4. [`supabase/migration-password-auth.sql`](./supabase/migration-password-auth.sql) — restores password-based accounts with `pgcrypto` bcrypt salted password hashes in private `public.user_credentials`, opaque session tokens in `public.user_sessions`, and authoritative case/whitespace-insensitive username uniqueness (rejecting duplicates with no `#0001` auto-tagging) via `auth_sign_up`, `auth_log_in`, `auth_get_session`, `auth_logout`, `auth_save_profile`, and `auth_reset_profile`.
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
