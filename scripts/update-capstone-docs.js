#!/usr/bin/env node
/**
 * Auto-Synchronization Engine for BYTEBOUND (CITCS Quest) Capstone Documentation.
 *
 * Updates all <!-- AUTO:START:<section> --> ... <!-- AUTO:END:<section> --> blocks
 * inside CAPSTONE_DOCUMENTATION.md from live workspace sources and maintains a
 * SHA-256 diff-backed revision log in scripts/.capstone-doc-state.json.
 *
 * Modes:
 *   node scripts/update-capstone-docs.js [--note "summary"] [--trigger "manual"]
 *   node scripts/update-capstone-docs.js --watch
 *   node scripts/update-capstone-docs.js --from-hook   (Antigravity PostToolUse hook)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOC_PATH = path.join(ROOT, 'CAPSTONE_DOCUMENTATION.md');
const STATE_PATH = path.join(__dirname, '.capstone-doc-state.json');

const ROLE_DESCRIPTIONS = {
  'index.html': 'Main player SPA shell (Auth, Quest Hub, Practice, Battle Canvas, Tracker, Maps, Skill Tree, Settings)',
  'admin.html': 'Standalone Administrator Management Console shell and layout containers',
  'index.js': 'Game loop, 16-room engine, sprite/animation rendering, physics, save profiles, auth flows, achievements, Hub UI',
  'serve-local.ps1': 'Zero-dependency PowerShell HTTP server with PBKDF2-SHA256 Auth API, Admin API, and LAN 1v1 Multiplayer API',
  'serve-local.cmd': 'Windows one-click launcher for serve-local.ps1',
  'supabase-config.js': 'Supabase project URL and publishable/anon key configuration',
  'CHANGES.md': 'Concise changelog and migration overview aligned with live system revisions',
  'SUPABASE_SETUP.md': 'Cloud PostgreSQL and Realtime setup instructions',
  'css/styles.css': 'Complete responsive design system (Dark/Light themes, battle cards, skill tree, portrait/landscape media queries)',
  'css/admin.css': 'Styling and responsive grid layouts for the standalone Admin Management Console',
  'data/questions.json': 'Authoritative 240-question curriculum bank tagged by category, topic, year (1–4), and difficulty',
  'scripts/build-questions.js': 'Validates data/questions.json schema/coverage, compiles js/data/questions.js, and triggers doc sync',
  'js/combat.js': 'AdaptiveDifficulty engine, spaced review, Academic Year gating, Skill Trees, card combat, 3–5 streak exclusive skills',
  'js/cards.js': 'CARD_LIBRARY definitions, mana costs, dynamic damage/buff descriptions, and card role metadata',
  'js/practice.js': 'Non-combat Topic Drill study mode with Adaptive/Mixed/Tier filters and tracker updates',
  'js/audio.js': 'Procedural Web Audio synthesizer: SFX + adaptive BGM (ambient explore, chiptune-rock battle, complextro-classical boss)',
  'js/admin.js': 'Admin Console client controller (Supabase RPC + local server fallback, pagination, requests, logs, CRUD)',
  'js/arena.js': 'Battle arena biome canvas backdrop rendering themes',
  'js/eventListeners.js': 'Keyboard and battle hotkey dispatchers across explore, map, skill tree, and combat phases',
  'js/tutorials.js': '17 guided interactive page tours and onboarding lessons with Codex Laureate tracking',
  'js/mp-network.js': 'Cross-device Supabase Realtime + local HTTP 1v1 lobby, presence, and broadcast synchronization',
  'js/mp-matchmaking.js': '1v1 competitive room creation, invitation codes, Elo rating updates, and match lifecycle',
  'js/mp-ui.js': '1v1 Multiplayer lobby browser, room drawer, and HUD controls',
  'js/utils.js': 'Shared collision polygon, array, and canvas helper utilities',
  'js/font.js': 'Local bitmap/pixel webfont loader and fallback registration',
  'js/classes/Player.js': 'Player movement, gravity, horizontal/vertical collision pushout, sprite states, and door interaction',
  'js/classes/Enemy.js': 'Enemy patrol AI, sprite states, and encounter triggers',
  'js/classes/Boss.js': 'Mini Boss (Kor, Grenu) and Final Boss (King Crolue) combat stats and sprite state machines',
  'js/classes/CollisionBlock.js': 'Axis-aligned and polygonal collision platform/wall primitives',
  'js/classes/Sprite.js': 'Frame-based sprite sheet loader and animation renderer',
  'js/data/collisions.js': 'Compiled platform, wall, and conveyor collision geometry for all 16 authored rooms',
  'js/data/questions.js': 'Compiled browser-ready QUESTION_BANK bundle generated from data/questions.json',
};

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function collectTrackedFiles() {
  const results = new Set();
  const rootCandidates = [
    'index.html',
    'admin.html',
    'index.js',
    'serve-local.ps1',
    'serve-local.cmd',
    'supabase-config.js',
    'CHANGES.md',
    'SUPABASE_SETUP.md',
  ];
  for (const name of rootCandidates) {
    const full = path.join(ROOT, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      results.add(name);
    }
  }

  const scanDir = (relDir, exts) => {
    const fullDir = path.join(ROOT, relDir);
    if (!fs.existsSync(fullDir)) return;
    for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
      const rel = toPosix(path.join(relDir, entry.name));
      if (entry.isDirectory()) {
        scanDir(rel, exts);
      } else if (entry.isFile() && exts.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        results.add(rel);
      }
    }
  };

  scanDir('css', ['.css']);
  scanDir('js', ['.js']);
  scanDir('supabase', ['.sql']);

  if (fs.existsSync(path.join(ROOT, 'data', 'questions.json'))) {
    results.add('data/questions.json');
  }
  if (fs.existsSync(path.join(ROOT, 'scripts', 'build-questions.js'))) {
    results.add('scripts/build-questions.js');
  }

  return Array.from(results).sort();
}

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function formatLocalTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { branch: branch || 'unknown', commit: commit || 'unknown' };
  } catch {
    return { branch: 'local', commit: 'untracked' };
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      lastUpdated: parsed.lastUpdated || null,
      fileHashes: parsed.fileHashes && typeof parsed.fileHashes === 'object' ? parsed.fileHashes : {},
      revisionHistory: Array.isArray(parsed.revisionHistory) ? parsed.revisionHistory : [],
    };
  } catch {
    return { lastUpdated: null, fileHashes: {}, revisionHistory: [] };
  }
}

function categorizeChanges(files) {
  const tags = new Set();
  for (const f of files) {
    if (f === 'js/combat.js' || f === 'js/cards.js') tags.add('Combat & Exclusive Skills');
    else if (f === 'js/practice.js') tags.add('Topic Drill & Study Mode');
    else if (f === 'js/audio.js') tags.add('Adaptive Procedural Audio/BGM');
    else if (f === 'js/admin.js' || f === 'admin.html' || f === 'css/admin.css') tags.add('Admin Console');
    else if (f.startsWith('js/mp-') || f.includes('1v1')) tags.add('1v1 Multiplayer');
    else if (f === 'data/questions.json' || f === 'js/data/questions.js' || f === 'scripts/build-questions.js') tags.add('Curriculum Question Bank');
    else if (f === 'js/data/collisions.js' || f === 'js/classes/Player.js' || f === 'js/classes/Enemy.js' || f === 'js/classes/Boss.js') tags.add('World Physics, Collisions & Entities');
    else if (f.startsWith('supabase/') || f === 'serve-local.ps1' || f === 'supabase-config.js') tags.add('Auth, Backend & SQL Schema');
    else if (f.startsWith('css/') || f === 'index.html') tags.add('UI Shell & Styling');
    else if (f === 'index.js') tags.add('Core Engine & Hub');
    else if (f === 'js/tutorials.js') tags.add('Guided Tutorials');
    else tags.add('Documentation/Config');
  }
  return Array.from(tags);
}

function buildSnapshotSection(fileStats, questionsData, worldData) {
  const git = getGitInfo();
  const indexHtml = safeReadText(path.join(ROOT, 'index.html'));
  const adminHtml = safeReadText(path.join(ROOT, 'admin.html'));

  const assetVersions = [];
  const cssMatch = indexHtml.match(/href="css\/styles\.css\?v=([^"]+)"/);
  if (cssMatch) assetVersions.push(`\`styles.css?v=${cssMatch[1]}\``);
  const scriptMatches = [...indexHtml.matchAll(/src="(js\/[^"]+\?v=[^"]+|index\.js\?v=[^"]+)"/g)];
  const keyAssets = ['js/cards.js', 'js/combat.js', 'js/audio.js', 'js/practice.js', 'js/tutorials.js', 'index.js'];
  for (const m of scriptMatches) {
    if (keyAssets.some((k) => m[1].startsWith(k))) {
      assetVersions.push(`\`${m[1]}\``);
    }
  }
  const admCss = adminHtml.match(/href="css\/admin\.css\?v=([^"]+)"/);
  const admJs = adminHtml.match(/src="js\/admin\.js\?v=([^"]+)"/);
  if (admCss) assetVersions.push(`\`admin.css?v=${admCss[1]}\``);
  if (admJs) assetVersions.push(`\`admin.js?v=${admJs[1]}\``);

  const totalLines = fileStats.reduce((sum, item) => sum + item.lines, 0);
  const totalBytes = fileStats.reduce((sum, item) => sum + item.bytes, 0);

  return [
    '| Metric | Live Value |',
    '| :--- | :--- |',
    `| **Last Auto-Synced** | \`${formatLocalTimestamp()}\` |`,
    `| **Git Branch / HEAD** | \`${git.branch}\` @ \`${git.commit}\` |`,
    `| **Tracked Source Modules** | \`${fileStats.length}\` files (\`${totalLines.toLocaleString('en-US')}\` lines, \`${(totalBytes / 1024).toFixed(1)} KB\`) |`,
    `| **Question Bank Coverage** | \`${questionsData.total}\` questions across \`${questionsData.disciplines.length}\` disciplines & \`${questionsData.topicsCount}\` topics |`,
    `| **Campaign Structure** | \`${worldData.rooms.length}\` authored rooms · \`RUN_LENGTH = ${worldData.runLength}\` (${worldData.runLength / Math.max(1, worldData.rooms.length)} campaign loops) |`,
    `| **Achievements** | \`${worldData.achievementTotal}\` tracked milestones |`,
    `| **Active Asset Cache Versions** | ${assetVersions.join(', ') || 'None detected'} |`,
  ].join('\n');
}

function buildQuestionsSection() {
  const raw = safeReadText(path.join(ROOT, 'data', 'questions.json'));
  let source;
  try {
    source = JSON.parse(raw);
  } catch {
    return {
      total: 0,
      disciplines: [],
      topicsCount: 0,
      markdown: '_Unable to parse `data/questions.json`._',
    };
  }

  const levels = ['easy', 'medium', 'hard'];
  const countsByLevel = { easy: 0, medium: 0, hard: 0 };
  const yearCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const topicMap = new Map();
  const disciplines = new Set();

  for (const lvl of levels) {
    const arr = Array.isArray(source[lvl]) ? source[lvl] : [];
    countsByLevel[lvl] = arr.length;
    for (const q of arr) {
      const cat = String(q.category || 'Uncategorized').trim();
      const topic = String(q.topic || 'General').trim();
      disciplines.add(cat);
      const yr = Number.isInteger(q.year) && q.year >= 1 && q.year <= 4 ? q.year : null;
      if (yr) yearCounts[yr]++;

      const key = `${cat}|||${topic}`;
      if (!topicMap.has(key)) {
        topicMap.set(key, { category: cat, topic, easy: 0, medium: 0, hard: 0, years: new Set() });
      }
      const entry = topicMap.get(key);
      entry[lvl]++;
      if (yr) entry.years.add(`Y${yr}`);
    }
  }

  const total = countsByLevel.easy + countsByLevel.medium + countsByLevel.hard;
  const rows = Array.from(topicMap.values())
    .sort((a, b) => a.category.localeCompare(b.category) || a.topic.localeCompare(b.topic))
    .map((t) => {
      const rowTotal = t.easy + t.medium + t.hard;
      const yrs = Array.from(t.years).sort().join(', ') || '—';
      return `| ${t.category} | ${t.topic} | ${t.easy} | ${t.medium} | ${t.hard} | **${rowTotal}** | ${yrs} |`;
    });

  const md = [
    `- **Total Questions:** \`${total}\` (\`${countsByLevel.easy}\` Easy · \`${countsByLevel.medium}\` Medium · \`${countsByLevel.hard}\` Hard)`,
    `- **Academic Year Distribution:** Year 1: \`${yearCounts[1]}\` · Year 2: \`${yearCounts[2]}\` · Year 3: \`${yearCounts[3]}\` · Year 4: \`${yearCounts[4]}\``,
    '',
    '| Discipline | Topic | Easy | Medium | Hard | Total | Years |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :--- |',
    ...rows,
  ].join('\n');

  return {
    total,
    disciplines: Array.from(disciplines),
    topicsCount: topicMap.size,
    markdown: md,
  };
}

function buildCombatSection() {
  const cardsSrc = safeReadText(path.join(ROOT, 'js', 'cards.js'));
  const combatSrc = safeReadText(path.join(ROOT, 'js', 'combat.js'));

  const cardRows = [];
  const cardBlockMatch = cardsSrc.match(/const\s+CARD_LIBRARY\s*=\s*\{([\s\S]*?)\n\};/);
  if (cardBlockMatch) {
    const lines = cardBlockMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const id = trimmed.match(/id:\s*'([^']+)'/)?.[1];
      const name = trimmed.match(/name:\s*'([^']+)'/)?.[1];
      const costRaw = trimmed.match(/cost:\s*('[^']+'|\d+)/)?.[1];
      const kind = trimmed.match(/kind:\s*'([^']+)'/)?.[1];
      const isExcl = /exclusiveActive:\s*true/.test(trimmed);
      const streakMin = trimmed.match(/chargeMin:\s*(\d+)/)?.[1];
      const streakMax = trimmed.match(/chargeMax:\s*(\d+)/)?.[1];
      const textMatches = [...trimmed.matchAll(/text:\s*'((?:\\'|[^'])*)'/g)];
      const text = textMatches.length ? textMatches[textMatches.length - 1][1] : '';
      if (id && name) {
        const costLabel = costRaw === `'empower'` ? 'Empower (20+ MP)' : `${costRaw} MP`;
        const typeLabel = isExcl
          ? `Exclusive (${streakMin || 3}–${streakMax || 5} Streak)`
          : /start:\s*true/.test(trimmed)
            ? 'Starter Deck'
            : 'Unlockable Reward';
        cardRows.push(`| \`${id}\` | **${name}** | ${costLabel} | \`${kind}\` | ${typeLabel} | ${text.replace(/\\'/g, "'")} |`);
      }
    }
  }

  const treeRows = [];
  const treeBlockMatch = combatSrc.match(/const\s+SKILL_TREES\s*=\s*\{([\s\S]*?)\n\};/);
  if (treeBlockMatch) {
    const treeSrc = treeBlockMatch[1];
    const disciplineMatches = [...treeSrc.matchAll(/(\w+):\s*\{\s*\n\s*name:\s*'([^']+)',[\s\S]*?skills:\s*\[([\s\S]*?)\n\s*\],/g)];
    for (const dm of disciplineMatches) {
      const discName = dm[2];
      const skillsBlock = dm[3];
      const skillLines = skillsBlock.split(/\r?\n/);
      for (const sl of skillLines) {
        const sName = sl.match(/name:\s*'([^']+)'/)?.[1];
        const sEffect = sl.match(/effect:\s*'((?:\\'|[^'])*)'/)?.[1];
        if (!sName || !sEffect) continue;
        const isEx = /isExclusiveActive:\s*true/.test(sl);
        const maxRank = sl.match(/maxRank:\s*(\d+)/)?.[1] || '1+';
        treeRows.push(`| ${discName} | ${isEx ? `**★ ${sName}**` : sName} | ${isEx ? `Exclusive (Max R${maxRank})` : 'Passive'} | ${sEffect} |`);
      }
    }
  }

  const getConst = (name, fallback) => {
    const m = combatSrc.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;\\n]+)`));
    return m ? m[1].trim().replace(/\s*\/\/.*$/, '') : fallback;
  };

  return [
    '### Key Adaptive & Streak Mechanics Constants (`js/combat.js`)',
    `- **Review Scheduling:** \`REVIEW_CHANCE = ${getConst('REVIEW_CHANCE', '0.3')}\` · \`BOSS_REVIEW_CHANCE = ${getConst('BOSS_REVIEW_CHANCE', '0.5')}\` · \`REVIEW_DELAY = ${getConst('REVIEW_DELAY', '3')}\` answers · \`REVIEW_LIMIT = ${getConst('REVIEW_LIMIT', '25')}\``,
    `- **Diagnostic & Skill Economy:** \`BASELINE_ATTEMPTS = ${getConst('BASELINE_ATTEMPTS', '3')}\` attempts/topic · \`SKILL_POINT_INTERVAL = ${getConst('SKILL_POINT_INTERVAL', '5')}\` correct answers/SP · \`DEFEND_COOLDOWN_TURNS = ${getConst('DEFEND_COOLDOWN_TURNS', '2')}\``,
    `- **Exclusive Skill Streak Charge:** Unlocks at \`EXCLUSIVE_MIN_STREAK = ${getConst('EXCLUSIVE_MIN_STREAK', '3')}\` consecutive correct (\`1.0×\`), overcharges at \`4\` (\`1.25×\`), peaks at \`EXCLUSIVE_MAX_STREAK = ${getConst('EXCLUSIVE_MAX_STREAK', '5')}\` (\`1.5× Max Overdrive\`), resets to \`0\` on any wrong answer or cast.`,
    '',
    `### Combat Card Library (\`${cardRows.length}\` Cards — \`js/cards.js\`)`,
    '| ID | Card | Base Cost | Kind | Pool | Effect Summary |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...(cardRows.length ? cardRows : ['| — | No cards parsed | — | — | — | — |']),
    '',
    `### Discipline Skill Trees (\`${treeRows.length}\` Nodes — \`js/combat.js\`)`,
    '| Discipline | Skill Node | Type | Live Effect Summary |',
    '| :--- | :--- | :--- | :--- |',
    ...(treeRows.length ? treeRows : ['| — | No skills parsed | — | — |']),
  ].join('\n');
}

function buildWorldSection() {
  const indexSrc = safeReadText(path.join(ROOT, 'index.js'));
  const runLength = indexSrc.match(/const\s+RUN_LENGTH\s*=\s*(\d+)/)?.[1] || '32';

  const rooms = [];
  const levelsBlock = indexSrc.match(/const\s+LEVELS\s*=\s*\{([\s\S]*?)\n\}\s*\n\s*let\s+level\s*=/)?.[1] || '';
  const levelHeaders = [...levelsBlock.matchAll(/^\s{2}(\d+):\s*\{/gm)];
  for (let i = 0; i < levelHeaders.length; i++) {
    const startIdx = levelHeaders[i].index;
    const endIdx = i + 1 < levelHeaders.length ? levelHeaders[i + 1].index : levelsBlock.length;
    const chunk = levelsBlock.slice(startIdx, endIdx);
    const num = Number(levelHeaders[i][1]);
    const name = chunk.match(/name:\s*'([^']+)'/)?.[1] || `Room ${num}`;
    const theme = chunk.match(/arenaTheme:\s*'([^']+)'/)?.[1] || 'unknown';
    const pigs = chunk.match(/pigs:\s*(\d+)/)?.[1] || '0';
    const hasBoss = /bossPlacement\s*:|isBoss|baseRoom/.test(chunk) || num === 5 || num === 9 || num === 12 || num === 14 || num === 16;
    rooms.push({ num, name, theme, pigs, hasBoss });
  }

  const achCounts = { general: 0, study: 0, pvp: 0, exclusive: 0, tutorial: 0 };
  const achBlock = indexSrc.match(/const\s+ACHIEVEMENTS\s*=\s*\[([\s\S]*?)\n\]/)?.[1] || '';
  for (const m of achBlock.matchAll(/category:\s*'([^']+)'/g)) {
    const cat = m[1];
    achCounts[cat] = (achCounts[cat] || 0) + 1;
  }
  const achievementTotal = Object.values(achCounts).reduce((a, b) => a + b, 0);

  const md = [
    `- **Campaign Structure:** \`${rooms.length}\` unique rooms looped up to \`RUN_LENGTH = ${runLength}\` encounters (\`32\` rooms across \`2\` loops). Mini Boss **Kor** guards \`Executive Floor\` (Room \`5\`), **Grenu** spawns in \`Control Deck 2\` (Loop 2), and **Final Boss King Crolue** guards all 4 branch finales (Rooms \`9\`, \`12\`, \`14\`, \`16\`).`,
    `- **Achievements Breakdown (\`${achievementTotal}\` Total):** General: \`${achCounts.general}\` · Study/Tracker/Leaderboard: \`${achCounts.study}\` · 1v1 PvP: \`${achCounts.pvp}\` · Exclusive Mastery: \`${achCounts.exclusive}\` · Onboarding (\`Codex Laureate\`): \`${achCounts.tutorial}\`.`,
    '',
    '| Room | Name | District / Theme | Enemies (`pigs`) | Boss / Finale Checkpoint |',
    '| :---: | :--- | :--- | :---: | :--- |',
    ...rooms.map((r) => {
      let bossNote = '—';
      if (r.num === 5) bossNote = 'Mini Boss **Kor**';
      else if (r.num === 9 || r.num === 12 || r.num === 14 || r.num === 16) bossNote = 'Branch Finale / **King Crolue**';
      else if (r.num === 3) bossNote = 'Loop 2 Mini Boss **Grenu**';
      return `| ${String(r.num).padStart(2, '0')} | **${r.name}** | \`${r.theme}\` | ${r.pigs} | ${bossNote} |`;
    }),
  ].join('\n');

  return {
    rooms,
    runLength: Number(runLength),
    achievementTotal,
    markdown: md,
  };
}

function buildBackendSection() {
  const sqlDir = path.join(ROOT, 'supabase');
  const sqlFiles = fs.existsSync(sqlDir) ? fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort() : [];
  const allTables = new Set();
  const allFuncs = new Set();
  const sqlRows = [];

  for (const file of sqlFiles) {
    const content = safeReadText(path.join(sqlDir, file));
    const tables = [...content.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-z0-9_]+)/gi)].map((m) => m[1]);
    const funcs = [...content.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)].map((m) => m[1]);
    tables.forEach((t) => allTables.add(t));
    funcs.forEach((fn) => allFuncs.add(fn));
    sqlRows.push(`| \`supabase/${file}\` | ${tables.length ? tables.map((t) => `\`${t}\``).join(', ') : '—'} | ${funcs.length ? funcs.map((fn) => `\`${fn}()\``).join(', ') : '—'} |`);
  }

  const psSrc = safeReadText(path.join(ROOT, 'serve-local.ps1'));
  const routeSet = new Set();
  for (const m of psSrc.matchAll(/\$relativePath\s+-eq\s+'(api\/[^']+)'/g)) {
    routeSet.add('/' + m[1]);
  }
  const routes = Array.from(routeSet).sort();
  const authRoutes = routes.filter((r) => r.startsWith('/api/auth/'));
  const adminRoutes = routes.filter((r) => r.startsWith('/api/admin/'));
  const mpRoutes = routes.filter((r) => r.startsWith('/api/mp/'));

  return [
    `### Local Server HTTP Endpoints (\`serve-local.ps1\` — \`${routes.length}\` Routes)`,
    `- **Player Auth & Requests (\`${authRoutes.length}\`):** ${authRoutes.map((r) => `\`${r}\``).join(', ')}`,
    `- **Admin Console API (\`${adminRoutes.length}\`):** ${adminRoutes.map((r) => `\`${r}\``).join(', ')}`,
    `- **Multiplayer & PvP API (\`${mpRoutes.length}\`):** ${mpRoutes.map((r) => `\`${r}\``).join(', ')}`,
    '',
    `### Supabase PostgreSQL Migrations (\`${allTables.size}\` Tables · \`${allFuncs.size}\` RPC Functions across \`${sqlFiles.length}\` Files)`,
    '| Migration Script | Tables Created / Referenced | RPC Functions Defined |',
    '| :--- | :--- | :--- |',
    ...sqlRows,
  ].join('\n');
}

function buildInventorySection(fileStats) {
  const describeRole = (rel) => {
    if (ROLE_DESCRIPTIONS[rel]) return ROLE_DESCRIPTIONS[rel];
    if (rel.startsWith('supabase/')) return 'Supabase SQL schema / migration script';
    if (rel.startsWith('js/classes/')) return 'Game entity / geometry class module';
    if (rel.startsWith('js/data/')) return 'Compiled static level or quiz dataset';
    if (rel.startsWith('css/')) return 'Stylesheet module';
    return 'Project source module';
  };

  return [
    '| File Path | Lines | Size (KB) | Functional Role |',
    '| :--- | :---: | :---: | :--- |',
    ...fileStats.map((item) => `| [\`${item.rel}\`](file:///${toPosix(path.join(ROOT, item.rel)).replace(/ /g, '%20')}) | ${item.lines.toLocaleString('en-US')} | ${(item.bytes / 1024).toFixed(1)} | ${describeRole(item.rel)} |`),
  ].join('\n');
}

function seedBaselineHistoryIfEmpty(state) {
  if (state.revisionHistory.length > 0) return;
  state.revisionHistory = [
    {
      timestamp: formatLocalTimestamp(),
      trigger: 'baseline-sync',
      areas: 'Exclusive Active Skills, Battle Panel Layout',
      summary: 'Removed standalone Ultimate move; moved 3–5 consecutive correct streak scaling (1.0× / 1.25× / 1.5×) directly onto Exclusive Active Skills and fixed battle `.actions` full-width grid alignment.',
    },
    {
      timestamp: '2026-11-26 (Prior Milestone)',
      trigger: 'milestone',
      areas: 'Admin Console, Question Bank Pagination, Activity Log',
      summary: 'Added comprehensive standalone Admin Console (`admin.html`, `js/admin.js`, `migration-admin-console.sql`), non-existent forgot-password rejection, persistent Activity Log, and Question Bank page 1..N pagination.',
    },
    {
      timestamp: '2026-11-25 (Prior Milestone)',
      trigger: 'milestone',
      areas: 'Adaptive BGM Audio & Room 02 Collisions',
      summary: 'Added adaptive Web Audio BGM (ambient menu/explore, chiptune-rock battle, complextro-breakcore-classical boss themes) and fixed Room 02 platform/wall watertight collisions.',
    },
    {
      timestamp: '2026-11-24 (Prior Milestone)',
      trigger: 'milestone',
      areas: 'Academic Year Restrictions & Password Auth',
      summary: 'Restored bcrypt/PBKDF2 password authentication (`migration-password-auth.sql`) and enforced Academic Year 1–4 progression filtering with Admin-approved year change requests.',
    },
  ];
}

function buildRevisionsSection(history) {
  const rows = history.slice(0, 40).map((entry) => {
    const ts = String(entry.timestamp || '').replace(/\|/g, '/');
    const trig = String(entry.trigger || 'manual').replace(/\|/g, '/');
    const areas = String(entry.areas || 'Project').replace(/\|/g, '/');
    const summary = String(entry.summary || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
    return `| \`${ts}\` | \`${trig}\` | ${areas} | ${summary} |`;
  });

  return [
    '| Timestamp | Trigger | Changed Areas / Files | Revision Summary |',
    '| :--- | :--- | :--- | :--- |',
    ...rows,
  ].join('\n');
}

function replaceAutoBlocks(docContent, blocks) {
  let updated = docContent;
  for (const [key, body] of Object.entries(blocks)) {
    const startMarker = `<!-- AUTO:START:${key} -->`;
    const endMarker = `<!-- AUTO:END:${key} -->`;
    const startIdx = updated.indexOf(startMarker);
    const endIdx = updated.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const before = updated.slice(0, startIdx + startMarker.length);
      const after = updated.slice(endIdx);
      updated = `${before}\n${body}\n${after}`;
    }
  }
  return updated;
}

function syncDocumentation({ note = '', trigger = 'manual', silent = false } = {}) {
  const tracked = collectTrackedFiles();
  const currentHashes = {};
  const fileStats = [];

  for (const rel of tracked) {
    const full = path.join(ROOT, rel);
    const content = fs.readFileSync(full, 'utf8');
    currentHashes[rel] = sha256(content);
    fileStats.push({
      rel,
      bytes: Buffer.byteLength(content, 'utf8'),
      lines: content.length ? content.split(/\r?\n/).length : 0,
    });
  }

  const state = loadState();
  const isFirstRun = Object.keys(state.fileHashes).length === 0;
  seedBaselineHistoryIfEmpty(state);

  const changedFiles = [];
  if (!isFirstRun) {
    for (const rel of tracked) {
      if (state.fileHashes[rel] !== currentHashes[rel]) {
        changedFiles.push(rel);
      }
    }
    for (const prevRel of Object.keys(state.fileHashes)) {
      if (!currentHashes[prevRel]) {
        changedFiles.push(`${prevRel} (removed)`);
      }
    }
  }

  if (note || changedFiles.length > 0) {
    const categories = changedFiles.length ? categorizeChanges(changedFiles) : ['Documentation Sync'];
    const sampleFiles = changedFiles.slice(0, 4).map((f) => `\`${f}\``).join(', ');
    const moreCount = changedFiles.length > 4 ? ` (+${changedFiles.length - 4} more)` : '';
    const areasText = changedFiles.length
      ? `${categories.join(', ')} (${sampleFiles}${moreCount})`
      : categories.join(', ');
    const summaryText = note || `Updated ${changedFiles.length} tracked file(s) across ${categories.join(', ')}.`;

    const last = state.revisionHistory[0];
    const duplicateEntry =
      last &&
      last.summary === summaryText &&
      last.areas === areasText &&
      last.trigger === trigger;

    if (!duplicateEntry) {
      state.revisionHistory.unshift({
        timestamp: formatLocalTimestamp(),
        trigger,
        areas: areasText,
        summary: summaryText,
      });
      state.revisionHistory = state.revisionHistory.slice(0, 50);
    }
  }

  state.lastUpdated = formatLocalTimestamp();
  state.fileHashes = currentHashes;

  const questionsData = buildQuestionsSection();
  const worldData = buildWorldSection();
  const combatMd = buildCombatSection();
  const backendMd = buildBackendSection();
  const snapshotMd = buildSnapshotSection(fileStats, questionsData, worldData);
  const inventoryMd = buildInventorySection(fileStats);
  const revisionsMd = buildRevisionsSection(state.revisionHistory);

  let docUpdated = false;
  if (fs.existsSync(DOC_PATH)) {
    const origDoc = fs.readFileSync(DOC_PATH, 'utf8');
    const nextDoc = replaceAutoBlocks(origDoc, {
      snapshot: snapshotMd,
      questions: questionsData.markdown,
      combat: combatMd,
      world: worldData.markdown,
      backend: backendMd,
      inventory: inventoryMd,
      revisions: revisionsMd,
    });
    if (nextDoc !== origDoc) {
      fs.writeFileSync(DOC_PATH, nextDoc, 'utf8');
      docUpdated = true;
    }
  }

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');

  if (!silent) {
    console.log(
      `Capstone documentation sync complete (${changedFiles.length} changed file(s), docUpdated=${docUpdated}).`
    );
  }
  return { changedFiles, docUpdated };
}

function handleHookMode() {
  try {
    let rawStdin = '';
    try {
      rawStdin = fs.readFileSync(0, 'utf8');
    } catch {
      rawStdin = '';
    }
    let payload = {};
    if (rawStdin.trim()) {
      try {
        payload = JSON.parse(rawStdin);
      } catch {
        payload = {};
      }
    }

    const editedPath = payload?.toolCall?.args?.Path || payload?.toolCall?.args?.path || '';
    if (editedPath) {
      const resolved = path.resolve(editedPath);
      const rel = toPosix(path.relative(ROOT, resolved));
      const isOutside = rel.startsWith('..') || path.isAbsolute(rel);
      const shouldIgnore =
        isOutside ||
        rel === 'CAPSTONE_DOCUMENTATION.md' ||
        rel === 'scripts/.capstone-doc-state.json' ||
        rel === 'scripts/update-capstone-docs.js' ||
        rel.startsWith('.agents/') ||
        rel.startsWith('.git/') ||
        rel.startsWith('Manuscript_Revision/');

      if (shouldIgnore) {
        process.stdout.write('{}\n');
        return;
      }

      syncDocumentation({
        trigger: 'agent-edit',
        note: `Auto-synced after agent update to \`${rel}\`.`,
        silent: true,
      });
    } else {
      syncDocumentation({ trigger: 'agent-edit', silent: true });
    }
  } catch {
    // Never fail PostToolUse hook execution
  }
  process.stdout.write('{}\n');
}

function startWatcher() {
  syncDocumentation({ trigger: 'watch-start', silent: false });
  const watchTargets = [
    ROOT,
    path.join(ROOT, 'css'),
    path.join(ROOT, 'js'),
    path.join(ROOT, 'js', 'classes'),
    path.join(ROOT, 'js', 'data'),
    path.join(ROOT, 'data'),
    path.join(ROOT, 'supabase'),
    path.join(ROOT, 'scripts'),
  ].filter((dir) => fs.existsSync(dir));

  let timer = null;
  let lastTriggerRel = '';

  const scheduleSync = (rel) => {
    lastTriggerRel = rel;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        syncDocumentation({
          trigger: 'file-watch',
          note: lastTriggerRel ? `Live watcher detected revision in \`${lastTriggerRel}\`.` : '',
          silent: false,
        });
      } catch (err) {
        console.error('[watch-capstone-docs] Sync error:', err.message);
      }
    }, 700);
  };

  for (const dir of watchTargets) {
    fs.watch(dir, { persistent: true }, (_eventType, filename) => {
      if (!filename) return;
      const full = path.join(dir, String(filename));
      const rel = toPosix(path.relative(ROOT, full));
      if (
        rel === 'CAPSTONE_DOCUMENTATION.md' ||
        rel === 'scripts/.capstone-doc-state.json' ||
        rel === 'scripts/update-capstone-docs.js' ||
        rel.startsWith('.git/') ||
        rel.startsWith('.agents/') ||
        rel.startsWith('Manuscript_Revision/')
      ) {
        return;
      }
      if (!/\.(html|js|css|json|sql|ps1|cmd|md)$/i.test(rel)) return;
      scheduleSync(rel);
    });
  }

  console.log(`Watching ${watchTargets.length} directories for BYTEBOUND changes. Press Ctrl+C to stop.`);
}

function parseArgs(argv) {
  const opts = { note: '', trigger: 'manual', watch: false, fromHook: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--watch') opts.watch = true;
    else if (a === '--from-hook') opts.fromHook = true;
    else if (a === '--note' && argv[i + 1]) opts.note = argv[++i];
    else if (a === '--trigger' && argv[i + 1]) opts.trigger = argv[++i];
  }
  return opts;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.fromHook) {
    handleHookMode();
  } else if (args.watch) {
    startWatcher();
  } else {
    syncDocumentation({ note: args.note, trigger: args.trigger, silent: false });
  }
}

module.exports = { syncDocumentation };
