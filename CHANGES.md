# CITCS Quest: v2 changes

## What's new
- **Boss rooms:** every 10th level (10 and 20) has a mini boss. The mini boss uses the sprites in `img/miniboss/`.
- **Final boss:** when you have the final boss art, save it as `img/finalboss/final-boss.png`. It appears automatically on the last level of the run. Until then the mini boss is used.
- **Card battles:** your moves are cards in a deck. Each battle draws a hand of 4 from your deck. After each win you choose one of 3 cards to add. Some cards unlock as you play; see the Achievements page for the card collection.
- **Adaptive learning:** questions adjust by difficulty, weak topic, and review history so every answer requires critical thinking.
- **Unified theme toggle:** the login screen and dashboard share one saved Light/Dark preference, with Light mode as the default.
- **Smooth login theme changes:** switching themes cross-fades the login screen and eases the switch and text colors.
- **Quest Hub overview:** the Welcome panel highlights the start action, adaptive difficulty, current quest, progress, next objective, and quick controls.
- **Skill Tree dashboard:** open the radial, topic-based skill map from the new Skill Tree navigation tab; in-game access with U remains available.
- **Adventure Practice Mode:** start a full adaptive run from the Quest Hub. Death and retry still apply, but the practice run, learning progress, achievements, skills, and leaderboard results are temporary and discarded on exit.
- **Run stats placement:** HP and MP stay in the active gameplay HUD; Kills and Accuracy are shown on the Tracker instead of the Quest Hub or battle HUD.
- **Quest preview title:** the larger, high-contrast text-only BYTEBOUND title and caption use theme-matched gradients: ivory/gold in Light mode and forest green/gold in Dark mode, with the interface's pixel font.
- **Light-mode text and header:** labels use neutral charcoal/slate; a paper-white gradient, stronger BYTEBOUND wordmark, and right-aligned player name replace the dark header. Profile switching now lives in Settings.
- **Mobile navigation:** tabs stay above the page content in a spaced two-row grid on narrow screens.
- **Responsive login layout:** PC-sized screens use a larger intro, card, text, and controls; mobile places login first and the intro below, without the three onboarding steps.
- **Wide-screen dashboard text:** navigation, headings, controls, and tab content scale fluidly on desktop-sized screens without changing mobile typography.
- **Settings polish:** the theme switch is compact, and Controls labels use high-contrast dark text in Light mode.
- **Dashboard tab transitions:** changing tabs fades and gently pops the new panel into view; clicking the active tab again does nothing.
- **Login screen polish:** removed the bottom callout badges and added subtle floating particles that match the active theme.
- **Button feedback:** buttons, dropdown summaries, and native selects have crisp, moderate-volume synthesized hover and click cues; login inputs and the theme toggle use the same cues, battle choices lift and press, and the Sound setting controls the cues.
- **Sound-effect volume:** effects default to 50% and can be adjusted independently.
- **Dashboard music:** the bundled `bgm/bgmdashboard.mp3` track plays at 20% volume on the dashboard and pauses when gameplay music starts or sound is disabled.
- **Separate volume settings:** persistent Music and Sound Effects sliders, defaulting to 20% and 50%; saved master-volume preferences are migrated to both controls.
- **Quieter audio mix:** synthesized sound effects and gameplay music are reduced by 25%.
- **Local launch:** run `serve-local.cmd` instead of opening `index.html` directly; it serves the app on localhost for reliable music playback.
- **Dark-mode Practice Mode button:** its dark card surface and gold text now match the dashboard palette.
- **Theme-aware Skill Tree:** the map, nodes, detail panel, and overlay now follow the selected Light or Dark theme.
- **Skill Tree zoom:** scroll to zoom and drag to pan; zoom-out below 100% unlocks after spending 5 skill points.
- **Skill Tree selection:** selecting a skill updates its details without rebuilding the whole map, avoiding the brief flash.
- **Defend cooldown and feedback:** Defend is unavailable for the next two player turns after use; a correct defense adds a brief pixel shield, spark, shake, and “BLOCKED!” popup.
- **Starter healing card:** Mend replaces Charge in the initial four-card deck, while Charge remains available in the reward pool.
- **Attack impact timing:** attack damage now applies when the projectile hits; the Continue action waits for that impact instead of advancing early.
- **Animation efficiency:** the canvas loop idles on the login screen and when its scene is inactive, pauses in hidden tabs and overlays, and caps the dashboard scene preview at 30 FPS.
- **Healing feedback:** healing shows a mint +HP popup and hero flash, while HP bars use a delayed ghost fill and heal/damage-specific timing.
- **Light-mode background:** softened the dashboard gradient and toned down the top-right color patch for a more even warm-paper surface.
- **Achievement unlocks:** newly earned achievements show a queued toast that overshoots in from the right in 150 ms, then slides away.
- **Damage feedback:** enemy hits grant 0.6 seconds of invincibility with two-frame blinking, knock the hero back 56 pixels along a 20-pixel arc, and apply a red tint that fades over 0.3 seconds.
- **Combat hit feedback:** attacks launch pixel projectiles; Power Strike charges with gathering sparks, contracting rings, a meter, staged glows and dust. Impacts add pixel sprays, afterimages, color inversion, expanding rings and a brief camera zoom, push and shake.
- **Enemy defeat animation:** lethal hits flatten and fade the body while a pale, swaying soul rises.
- **Practice mode:** full adventure gameplay with automatic adaptive questions and no saved practice progress.
- **Review queue:** missed questions come back a few answers later, during battles and in practice. The Tracker page shows how many are waiting.
- **Smarter question picking:** topics you're weaker at come up more often.
- **Sound:** sound effects and music are generated in the browser. Turn them off in Settings.
- **Question bank:** 135 questions, at least 3 per topic per difficulty.

## Editing questions
1. Edit `data/questions.json` (each question has `category`, `topic`, `q`, `choices`, `answer`, `explain`).
2. From the project folder, run `node scripts/build-questions.js`. It checks the file and writes `js/data/questions.js`. It won't write anything if there are errors.

## Leaderboard checks (one-time)
Run `supabase/migration-leaderboard-run-checks.sql` once in the Supabase SQL editor. It tightens the rules for submitted runs.

## Settings you can tune
- `RUN_LENGTH` (20) and `BOSS_EVERY` (10): in `index.js`. Set `RUN_LENGTH` to 0 to keep going forever.
- `REVIEW_CHANCE`, `REVIEW_DELAY`: in `js/combat.js`.
- Card costs, effects, and unlock rules: in `js/cards.js`.
- Mini boss stats and sprite layout: in `js/classes/Boss.js` and the Boss constructor.
