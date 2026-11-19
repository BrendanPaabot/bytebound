# CITCS Quest (Bytebound): Documentation & Changelog

## System Overview & Core Mechanics
- **Question Bank (240 Questions):** `4` IT/CS disciplines (`Computer Systems`, `Networking & Security`, `Programming`, `Database`) × `5` topics each × `3` difficulty tiers (`easy`, `medium`, `hard`) × `4` questions per tier (`80` easy, `80` medium, `80` hard = `240` total in `data/questions.json` → compiled to `js/data/questions.js`).
- **Diagnostic Baseline vs. Post-Baseline Tracking:** The first `3` attempts per topic capture the student's **Diagnostic Baseline Accuracy** (`baselineCorrect` / `baselineAttempted`). Subsequent answers measure **Post-Baseline Accuracy** and learning gain (`+Delta%`), surfaced on the **Tracker** view at overall, discipline, and per-topic granularity.
- **Adaptive Difficulty Engine (`AdaptiveDifficulty` in `js/combat.js`):**
  - Tracks per-discipline difficulty levels (`0` Easy → `1` Medium → `2` Hard) calibrated from `topicProgress` (`calibrateFromProgress()`).
  - Escalates after **2 consecutive correct answers** (`mediumStreak`) and steps down automatically on a wrong answer.
  - Prioritizes weaker topics (`< 75%` accuracy) using weighted selection and schedules missed questions into a **spaced review queue** (`REVIEW_CHANCE = 0.30`, raised to `BOSS_REVIEW_CHANCE = 0.50` in boss rooms, returning after `REVIEW_DELAY = 3` answers).
  - Shuffles answer choices at render time (`withShuffledChoices`) across battles, Remedial Surge drills, and Topic Drills without altering `data/questions.json`.
- **Two Distinct Study / Rehearsal Modes:**
  - **Topic Drill (`02 · Topic Drill`, `js/practice.js`):** Dedicated non-combat study interface (defaulting to **Adaptive** per-discipline tier, plus `Mixed`, `Easy`, `Medium`, `Hard`) to drill `Weak Topic Spotlight`, individual CS topics, or the `Review missed` queue with zero HP risk. Updates Topic Tracker, Baseline/Post-Baseline accuracy, recalibrates adaptive difficulty, and awards Skill Points (`1 SP` per 5 correct answers).
  - **Practice Mode (`Practice Mode` button on Quest Hub):** Full sandbox combat run without saving run progress, leaderboard submissions, or profile mutations.
- **Learning Tracker & CSV Export (`03 · Tracker`):**
  - Displays overall/discipline/subtopic **Baseline vs. Post-Baseline Accuracy** (`+Delta%`), 4-axis SVG Capability Radar, adaptive tiers, and a 1-click **Export CSV** button (`bytebound-learning-report-<player>.csv`) for research/instructor evaluation.
- **World Biomes & Interactive RPG Skill-Tree Campaign Map (`M`):**
  - `16` authored levels across `7` districts (`Data Center`, `BB Corp`, `BB Corp Street`, `Left Street` → `Net Cafe` / `Corp Supply`, `Right Street` → `Hospital` / `Bank`), including Rooms `01–05` (`Terminal Bay`, `Server Shaft`, `Control Deck`, `Office Wing`, `Executive Floor`), expandable tracking cameras inside multi-floor buildings, bidirectional doors, and diagonal conveyor collision ramps.
  - Press **`M`** (or click `MAP · [M]`) in-game to open the draggable, zoomable RPG skill-tree Campaign Map with ambient particles, directional connection highlights, and hover preview tooltips showing each room's thumbnail, enemies, exits, and unlock/clear state.
- **Boss Progression & Final Boss:**
  - **Mini Boss Kor** guards the mid-loop executive checkpoint (`baseRoom === 5`, `Executive Floor`: Levels `5` and `21`).
  - **Mini Boss Grenu** appears on loop 2 in Level `19` (`Control Deck 2`, `baseRoom === 3 && cycle === 1`).
  - **Final Boss King Crolue** (`img/boss/kingcrolue-idle.png` & `img/boss/kingcrolue-attack.png`) guards all four branch finales (`baseRoom === 9` `Net Cafe Staff Room`, `baseRoom === 12` `Hospital Upper Floors`, `baseRoom === 14` `Bank Upper Floors`, `baseRoom === 16` `Corp Supply Management`, plus `n === RUN_LENGTH`). `RUN_LENGTH` defaults to `32` (`2` loops of `16` rooms).
- **Remedial Surge Recovery (`0 MP` Action):**
  - Answer `2–5` remedial questions at `0 MP`: answering all correctly grants **Perfect Remedial Surge** (full MP, `35%` HP, `+8 ATK`, `+4 DEF`); answering at least one correctly (`score > 0`, even if the last question is missed) grants proportional **Remedial Recovery**; `0` correct answers fizzles (`0 HP, 0 MP, no buffs`).
- **Card Battles, Exclusive Skills & Kernel Aegis Accountability:**
  - All 4 exclusive capstone skills unlock via discipline Skill Trees (`U`): **`Kernel Aegis`** (Computer Systems), **`Packet Lockdown`** (Networking & Security), **`Overburn Execution`** (Programming), and **`Necromancy`** (Database, spending Mana scaled by enemy strength to raise up to `3` sequential undead allies that attack only when you answer correctly).
  - `Kernel Aegis` blocks normal enemy hits for the run, **but careless wrong answers still impose consequences**: draining `-10 MP`, resetting streak/accuracy bonuses, shocking the hero (`-4 HP` Aegis overload), and piercing `Kernel Aegis` for `50%` breach damage during Boss battles.
- **Authentication, Privacy, & Persistence Scope:**
  - Designed as a classroom-ready prototype with **local storage** (`localStorage`) + optional **Supabase cloud sync** (`users`, `leaderboard_entries`, `pvp_leaderboard_entries`, `multiplayer_rooms`).
  - Profiles support an **optional `3–24` character Password / PIN** hashed client-side via `hashProfilePin()` (salted deterministic 64-bit FNV-1a + DJB2 hash, stored in `pin_hash` and enforced by Supabase `upsert_user_profile` / `reset_user_profile`). Blank Password/PIN permits quick classroom handles pending institutional OAuth/SSO.
  - Clicking **Exit** cleanly logs out of the active account back to the login screen without closing the browser tab.

## Editing Questions
1. Edit `data/questions.json` (each question requires `category`, `topic`, `q`, `choices`, `answer`, `explain`).
2. Run `node scripts/build-questions.js` to validate schema/counts and regenerate `js/data/questions.js`.

## Supabase Database Setup (Migrations)
Run these scripts in order in the Supabase SQL Editor:
1. `supabase/schema.sql` (full base schema + RLS + `users`, Arcade leaderboard, `multiplayer_rooms`, RPCs)
2. `supabase/migration-leaderboard-run-checks.sql` (leaderboard submission validation)
3. `supabase/migration-1v1-leaderboard.sql` (1v1 competitive leaderboard table + kill-gated Arcade submission)
4. `supabase/migration-profile-pin.sql` (adds `pin_hash` column + RPC enforcement)
5. `supabase/migration-cleanup-users-and-sss-pin.sql` (optional classroom seed cleanup)

## Local Launch & Tunables
- **Local launch:** Run `serve-local.cmd` (`serve-local.ps1`) to serve on `localhost` with reliable Web Audio / BGM playback and local multiplayer APIs.
- **Tunables:** `RUN_LENGTH` (`32`) and `ROOM_COUNT` (`16`) in `index.js`; `REVIEW_CHANCE` / `BOSS_REVIEW_CHANCE` / `REVIEW_DELAY` in `js/combat.js`; card definitions in `js/cards.js`; boss config in `js/classes/Boss.js`.
