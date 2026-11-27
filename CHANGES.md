# CITCS Quest (Bytebound): Documentation & Changelog

> For the complete, live auto-synchronized capstone reference and revision log, see [`CAPSTONE_DOCUMENTATION.md`](./CAPSTONE_DOCUMENTATION.md).

## System Overview & Core Mechanics
- **Question Bank (240 Questions):** `4` IT/CS disciplines (`Computer Systems`, `Networking & Security`, `Programming`, `Database`) × `5` topics each × `3` difficulty tiers (`easy`, `medium`, `hard`) × `4` questions per tier (`80` easy, `80` medium, `80` hard = `240` total in `data/questions.json` → compiled to `js/data/questions.js`), each tagged with Academic Year (`year`: `1`–`4`).
- **Diagnostic Baseline vs. Post-Baseline Tracking:** The first `3` attempts per topic capture the student's **Diagnostic Baseline Accuracy** (`baselineCorrect` / `baselineAttempted`). Subsequent answers measure **Post-Baseline Accuracy** and learning gain (`+Delta%`), surfaced on the **Tracker** view at overall, discipline, and per-topic granularity.
- **Adaptive Difficulty Engine (`AdaptiveDifficulty` in `js/combat.js`):**
  - Tracks per-discipline difficulty levels (`0` Easy → `1` Medium → `2` Hard) calibrated from `topicProgress` (`calibrateFromProgress()`), plus a rolling recent-accuracy & consecutive-miss tracker powering **Comeback Assist** (`0.80×` enemy damage, `1.25×` HP recovery, `-1` question difficulty shift) and **Adaptive Mastery** (`+15%` foe HP / `+8%` foe ATK, `+1` question difficulty shift).
  - Escalates smoothly (Easy → Medium on `2` consecutive correct or `≥70%` recent accuracy; Medium → Hard on `2` consecutive correct) and drops Medium → Easy only after `2` misses so single slips do not ping-pong.
  - Dynamically scales question difficulty by room depth, enemy tier (`Drius`/`Boss`), card risk-reward (`Heavy Blow`, `Overclock`, Exclusives), and topic mastery—and rewards harder questions with **`1.0×` Easy (`+5 MP`)**, **`1.18×` Medium (`+8 MP`, `+2 HP`)**, and **`1.38×` Hard (`+12 MP`, `+4 HP`)** card power alongside reduced counter-attack damage on wrong Hard answers (`0.88×`).
  - Prioritizes weaker topics (`< 75%` accuracy) using weighted selection and schedules missed questions into a **spaced review queue** (`REVIEW_CHANCE = 0.30`, raised to `BOSS_REVIEW_CHANCE = 0.50` in boss rooms, returning after `REVIEW_DELAY = 3` answers).
  - Shuffles answer choices at render time (`withShuffledChoices`) across battles, Remedial Surge drills, and Topic Drills without altering `data/questions.json`.
- **Two Distinct Study / Rehearsal Modes:**
  - **Topic Drill (`02 · Topic Drill`, `js/practice.js`):** Dedicated non-combat study interface (defaulting to **Adaptive** per-discipline tier, plus `Mixed`, `Easy`, `Medium`, `Hard`) to drill `Weak Topic Spotlight`, individual CS topics, or the `Review missed` queue with zero HP risk. Updates Topic Tracker, Baseline/Post-Baseline accuracy, recalibrates adaptive difficulty, and awards Skill Points (`1 SP` per 5 correct answers).
  - **Practice Mode (`Practice Mode` button on Quest Hub):** Full sandbox combat run without saving run progress, leaderboard submissions, or profile mutations.
- **Learning Tracker & CSV Export (`03 · Tracker`):**
  - Displays overall/discipline/subtopic **Baseline vs. Post-Baseline Accuracy** (`+Delta%`), 4-axis SVG Capability Radar, adaptive tiers, and a 1-click **Export CSV** button (`bytebound-learning-report-<player>.csv`) for research/instructor evaluation.
- **World Biomes, Room Collisions & Interactive Campaign Map (`M`):**
  - `16` authored levels across `7` districts (`Data Center`, `BB Corp`, `BB Corp Street`, `Left Street` → `Net Cafe` / `Corp Supply`, `Right Street` → `Hospital` / `Bank`), including Rooms `01–05` (`Terminal Bay`, `Server Shaft`, `Control Deck`, `Office Wing`, `Executive Floor`), watertight boundary/platform geometry in `Room 02` (`js/data/collisions.js` + `js/classes/Player.js`), expandable cameras inside multi-floor buildings, bidirectional doors, and diagonal conveyor collision ramps.
  - Press **`M`** (or click `MAP · [M]`) in-game to open the draggable, zoomable RPG skill-tree Campaign Map with ambient particles, directional connection highlights, and hover preview tooltips showing each room's thumbnail, enemies, exits, and unlock/clear state.
- **Boss Progression & Final Boss:**
  - **Mini Boss Kor** guards the mid-loop executive checkpoint (`baseRoom === 5`, `Executive Floor`: Levels `5` and `21`).
  - **Mini Boss Grenu** appears on loop 2 in Level `19` (`Control Deck 2`, `baseRoom === 3 && cycle === 1`).
  - **Final Boss King Crolue** (`img/boss/kingcrolue-idle.png` & `img/boss/kingcrolue-attack.png`) guards all four branch finales (`baseRoom === 9` `Net Cafe Staff Room`, `baseRoom === 12` `Hospital Upper Floors`, `baseRoom === 14` `Bank Upper Floors`, `baseRoom === 16` `Corp Supply Management`, plus `n === RUN_LENGTH`). `RUN_LENGTH` defaults to `32` (`2` loops of `16` rooms).
- **Remedial Surge Recovery & Smart Low-MP Hand Guarantee:**
  - Solo runs start with `SOLO_STARTING_DECK` including `Charge Mana` (`0 MP`), `fillHand()` automatically swaps in an affordable/mana-restoring card from deck or discard whenever a drawn hand would be completely unplayable, and **Remedial Surge (`R`)** unlocks whenever `hero.mana <= 0` **or** no card in hand is currently playable (even with leftover MP like `12 MP`).
  - Rebalanced card economy: `Quick Jab` (`0.65×`, `+8 MP`), `Mend` (`12+ HP`), `Siphon` (`+16 MP` + `0.4×` chip damage), `Heavy Blow` (`25 MP`, `2.4×`), `Power Strike` (`1.55×`), `Fortify` (`+3 DEF`, `+4 MP`), and scaled wrong-answer enemy counters replacing the flat `24 HP` early-room floor.
  - Answer `2–5` remedial questions: answering all correctly grants **Perfect Remedial Surge** (full MP, `35%` HP, `+8 ATK`, `+4 DEF`); answering at least one correctly (`score > 0`, even if the last question is missed) grants proportional **Remedial Recovery**; `0` correct answers fizzles (`0 HP, 0 MP, no buffs`).
- **Card Battles, Streak-Charged Exclusive Active Skills & Kernel Aegis Accountability:**
  - Battle `.actions` cards span full panel width (`repeat(4, minmax(0, 1fr))` on desktop) across all turns.
  - All 4 exclusive capstone skills unlock via discipline Skill Trees (`U`): **`Kernel Aegis`** (Computer Systems), **`Packet Lockdown`** (Networking & Security), **`Overburn Execution`** (Programming), and **`Necromancy`** (Database, spending Mana scaled by enemy strength to raise up to `3` sequential undead allies that attack only when you answer correctly).
  - The 3 active Exclusive Skills (`Kernel Aegis`, `Packet Lockdown`, `Overburn Execution`) remain visible in solo combat with a **5-pip consecutive answer streak gauge**: charging at **`3/5` (`1.0×`)**, **Overcharged at `4/5` (`1.25×`)**, and **Max Overdrive at `5/5` (`1.5×`)**. Any wrong answer resets the charge to `0`; casting consumes the stored charge back to `0`.
  - `Kernel Aegis` blocks normal enemy hits for the run, **but careless wrong answers still impose consequences**: draining `-10 MP`, resetting streak/accuracy bonuses, shocking the hero (`-4 HP` Aegis overload), and piercing `Kernel Aegis` for `50%` breach damage during Boss battles.
- **Adaptive Procedural Web Audio (`js/audio.js`):**
  - Synthesizes soothing ambient felt bells and warm pads for menus/exploration (`dashboard`/`explore`), a chiptune-rock mix for regular battles (`battle`), and a high-energy complextro/breakcore-classical boss theme (`boss`) filtered cleanly to eliminate harsh chiptune highs.
- **Password Authentication, Academic Year Restrictions, Rate Limiting & Admin Console:**
  - Player accounts enforce unique case-insensitive usernames paired with salted PBKDF2-SHA256 (`serve-local.ps1`) or PostgreSQL `pgcrypto` bcrypt (`supabase/migration-password-auth.sql`) passwords, server-validated forgot-password requests (rejecting unknown usernames), and persistent user sessions.
  - Full-stack concurrency & rate-limit protections: sliding-window limits on auth/admin/request endpoints (`serve-local.ps1` HTTP `429` + `Retry-After` and `supabase/migration-rate-limiting.sql`), client `429`/`503` exponential backoff with jitter, milestone-throttled profile/leaderboard syncing with offline recovery queues, `45s` leaderboard TTL caching, and lazy 1v1 Multiplayer Realtime/polling (`idle` when closed, `1500ms` lobby, `450ms` active match).
  - User-facing data-safety warnings & hardening: HTTP security headers ([`_headers`](./_headers) & `serve-local.ps1`), Sign-Up password strength meter + common leaked-password blocker (`123456`, `password`, username match), password-reuse notice & **Privacy & Data Safety (RA 10173)** modal, **Shared computer** logout cache-wipe checkbox, post-login failed-attempt & temporary-password banners (`#accountSecurityAlert`), Admin **Security Notice Broadcast** (`#globalSecurityBanner`), localhost-only admin default credential/offline fallback gating, and tightened `multiplayer_rooms` RLS policies (`supabase/migration-security-safety.sql`).
  - Academic Year selection (`Year 1`–`Year 4`) strictly gates eligible curriculum questions and locks arbitrary year switching on the player side behind **Admin-approved Year Change Requests**.
  - Standalone Admin Management Console ([`admin.html`](./admin.html), [`js/admin.js`](./js/admin.js)) manages player accounts, forgot-password and year-change queues, persistent Activity Logs, paginated (`1…N`) Question Bank inspection, Arcade/1v1 Leaderboards, and active multiplayer rooms with `Auto (Cloud DB → Local Server)` backend fallback.
  - Clicking **Exit** cleanly logs out of the active account back to the login screen without closing the browser tab.

## Editing Questions & Auto-Updating Docs
1. Edit `data/questions.json` (each question requires `category`, `topic`, `year`, `q`, `choices`, `answer`, `explain`).
2. Run `node scripts/build-questions.js` to validate schema/counts, regenerate `js/data/questions.js`, and automatically sync [`CAPSTONE_DOCUMENTATION.md`](./CAPSTONE_DOCUMENTATION.md).
3. To keep documentation synced automatically during manual file edits, run `scripts/watch-capstone-docs.cmd` (`node scripts/update-capstone-docs.js --watch`).

## Supabase Database Setup (Migrations)
Run these scripts in order in the Supabase SQL Editor:
1. `supabase/schema.sql` (full base schema + RLS + `users`, Arcade leaderboard, 1v1 leaderboard, `multiplayer_rooms`, RPCs)
2. `supabase/migration-leaderboard-run-checks.sql` (leaderboard submission validation)
3. `supabase/migration-1v1-leaderboard.sql` (1v1 competitive leaderboard table + kill-gated Arcade submission)
4. `supabase/migration-password-auth.sql` (`pgcrypto` bcrypt password auth, `user_credentials`, `user_sessions`, `auth_sign_up`, `auth_log_in`, `auth_get_session`, `auth_logout`, `auth_save_profile`, `auth_reset_profile`)
5. `supabase/migration-admin-console.sql` (`admin_accounts`, `admin_sessions`, `admin_audit_logs`, `password_reset_requests`, `year_change_requests`, year-lock enforcement, and Admin RPCs)
6. `supabase/migration-rate-limiting.sql` (`api_rate_limits` sliding-window guards for player/admin login, password reset, year change, and throttled leaderboard submissions)
7. `supabase/migration-security-safety.sql` (`must_change_password`, failed-login counters, `system_security_notices` broadcast RPC, and tightened `multiplayer_rooms` RLS policies)

## Local Launch & Tunables
- **Local launch:** Run `serve-local.cmd` (`serve-local.ps1`) to serve on `localhost` with reliable Web Audio / BGM playback, local Auth/Admin APIs, and local multiplayer APIs.
- **Tunables:** `RUN_LENGTH` (`32`) and `ROOM_COUNT` (`16`) in `index.js`; `REVIEW_CHANCE` / `BOSS_REVIEW_CHANCE` / `REVIEW_DELAY` / `EXCLUSIVE_MIN_STREAK` / `EXCLUSIVE_MAX_STREAK` in `js/combat.js`; card definitions in `js/cards.js`; boss config in `js/classes/Boss.js`.
