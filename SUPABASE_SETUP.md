# Supabase Users, Leaderboard & 1v1 Multiplayer Setup

1. Create or open your Supabase project.
2. In the **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql). This creates:
   - `public.users` + `upsert_user_profile` / `reset_user_profile` RPCs for cloud-synced player profiles (topic tracker, skill tree, spaced-repetition review queue, and achievements).
   - `public.leaderboard_entries` + `submit_leaderboard_run` RPC for recording and updating both in-progress/partial gameplays and completed runs.
   - `public.multiplayer_rooms` + Realtime publication for cross-computer 1v1 public room discovery and private invitation code validation.
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
