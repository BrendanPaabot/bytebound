# Supabase leaderboard setup

1. Create a Supabase project.
2. In the SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy the project URL and publishable key (or legacy anon key) into `supabase-config.js`:

   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://YOUR_PROJECT_ID.supabase.co',
     anonKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY',
   }
   ```

4. Serve the game from a local web server or deploy it to a site. Do not use a
   service-role or secret key in this browser app.
5. Open **Leaderboards** to load rankings. A completed kingdom run is submitted
   automatically; the button on the leaderboard page can refresh rankings or
   retry a failed submission.

The database calculates accuracy and score and bounds-checks submitted values.
However, run statistics originate in a browser game and can be altered by a
player. This public-demo setup is not cheat-proof and should not be used for
prizes or trusted competition. For that, add Supabase Auth and move run
verification/submission to a trusted server or Edge Function.
