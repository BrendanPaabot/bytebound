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
  - **Topic Drill (`02 · Topic Drill`, `js/practice.js`):** Dedicated non-combat study interface to drill `Mixed`, `Weak Topic Spotlight`, individual CS topics, or the `Review missed` queue with zero HP risk. Updates Topic Tracker, Baseline/Post-Baseline accuracy, and awards Skill Points (`1 SP` per 5 correct answers).
  - **Practice Mode (`Practice Mode` button on Quest Hub):** Full sandbox combat run without saving run progress, leaderboard submissions, or profile mutations.
- **World Biomes & Dead Cells–Style Map (`M`):**
  - `12` authored levels across `5` districts (`img/map/{datacenter,bbcorp,mainroad,netcafe,hospital}/`), including an expandable tracking-camera (`exploreCamera`) inside oversized buildings, bidirectional back-to-back doors, and `BB Corp Street` (`Room 06`) branching left (`Net Cafe` district) and right (`East Main Road` + `Hospital` district).
  - Press **`M`** (or click `MAP · [M]`) in-game to view the connected **Biome Route Map** with live room, visited, and cleared states.
- **Boss Progression & Final Boss:**
  - Every `BOSS_EVERY` (`10`) level (`10`, `20`) hosts a boss encounter using sprites in `img/boss/`, plus Level `15` hosts **Mini Boss Grenu**.
  - The final encounter on `RUN_LENGTH` (`20`) is **Malvex, Root Overlord** (`img/finalboss/final-boss.png` when provided, or fallback boss sprite).
- **Card Battles & Kernel Aegis Accountability:**
  - Exclusive active capstone skills (`Kernel Aegis`, `Packet Lockdown`, `Overburn Execution`) unlock via discipline Skill Trees (`U`).
  - `Kernel Aegis` blocks normal enemy hits for the run, **but careless wrong answers still impose consequences**: draining `-10 MP`, resetting streak/accuracy bonuses, shocking the hero (`-4 HP` Aegis overload), and piercing `Kernel Aegis` for `50%` breach damage during Boss battles.
- **Authentication, Privacy, & Persistence Scope:**
  - Designed as a classroom-ready prototype with **local storage** (`localStorage`) + optional **Supabase cloud sync** (`users`, `leaderboard_entries`, `pvp_leaderboard_entries`).
  - Profiles support an **optional salted SHA-256 4-digit PIN** (`pin_hash` checked locally and by Supabase `upsert_user_profile` / `reset_user_profile`). Blank PIN permits quick classroom/guest handles pending full institutional OAuth/SSO.

## Editing Questions
1. Edit `data/questions.json` (each question requires `category`, `topic`, `q`, `choices`, `answer`, `explain`).
2. Run `node scripts/build-questions.js` to validate schema/counts and regenerate `js/data/questions.js`.

## Supabase Database Setup (One-Time Migrations)
Run these scripts in order in the Supabase SQL Editor:
1. `supabase/schema.sql` (full base schema + RLS + `users`, Arcade & 1v1 leaderboards, RPCs)
2. `supabase/migration-leaderboard-run-checks.sql` (leaderboard submission validation)
3. `supabase/migration-profile-pin.sql` (adds hashed 4-digit PIN column `pin_hash` + RPC enforcement)

## Local Launch & Tunables
- **Local launch:** Run `serve-local.cmd` (`serve-local.ps1`) to serve on `localhost` with reliable Web Audio / BGM playback and local multiplayer APIs.
- **Tunables:** `RUN_LENGTH` (`20`) and `BOSS_EVERY` (`10`) in `index.js`; `REVIEW_CHANCE` / `BOSS_REVIEW_CHANCE` / `REVIEW_DELAY` in `js/combat.js`; card definitions in `js/cards.js`; boss config in `js/classes/Boss.js`.
