# Supabase Users, Leaderboard & 1v1 Multiplayer Setup

1. Create or open your Supabase project.
2. In the **SQL Editor**, run these scripts in order:
   1. [`supabase/schema.sql`](./supabase/schema.sql) — creates `public.users` + `upsert_user_profile` / `reset_user_profile` RPCs, `public.leaderboard_entries` + `submit_leaderboard_run`, and `public.multiplayer_rooms` + Realtime publication.
   2. [`supabase/migration-leaderboard-run-checks.sql`](./supabase/migration-leaderboard-run-checks.sql) — enforces server-side leaderboard run validation checks.
   3. [`supabase/migration-1v1-leaderboard.sql`](./supabase/migration-1v1-leaderboard.sql) — adds `public.pvp_leaderboard_entries` + `submit_pvp_match_result` and kill-gated Arcade submission.
   4. [`supabase/migration-profile-pin.sql`](./supabase/migration-profile-pin.sql) — adds optional hashed Password/PIN protection (`pin_hash`) on `public.users` and profile RPCs.
   5. [`supabase/migration-cleanup-users-and-sss-pin.sql`](./supabase/migration-cleanup-users-and-sss-pin.sql) — optional cleanup script for legacy test handles.
3. Verify the project URL and publishable key (or legacy anon key) in `supabase-config.js`:

   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://YOUR_PROJECT_ID.supabase.co',
     anonKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY',
   }
   ```

4. Ensure **Realtime** is enabled in your Supabase project (enabled by default in Supabase). BYTEBOUND uses Supabase Realtime (`bytebound:lobby:v1` Presence + Broadcast, per-room `bytebound:room:<CODE>` channels, and `public.multiplayer_rooms`) for cross-computer online 1v1 lobbies, invitation code verification, ready synchronization, and live 1v1 matches.
5. Serve the game from a local web server (`serve-local.cmd` / `serve-local.ps1`) or deploy it to a static host (GitHub Pages, Netlify, Vercel, etc.). Do not use a service-role or secret key in this browser app. When running locally with `serve-local.ps1`, `/api/mp/*` endpoints also synchronize multiple local clients immediately even without internet access.
6. Log in with any username on the welcome screen — click **1v1 Multiplayer** on the main menu to view online players, host public/private rooms, share invitation codes, ready up, and duel live.
