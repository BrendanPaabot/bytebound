// Bytebound 3-Page Quest System + Refresh Cycles, Supply Crates & 13 Prestige Titles:
// 1. Adaptive Study Quests (Daily reset + topic reroll, auto-targeted from Year Level, Topic Tracker & Review Queue + Daily Study Streak)
// 2. Campaign & District Bounties (Weekly reset + 1x weekly bonus refresh)
// 3. Arena & Discipline Quests (Weekly reset + 1x weekly bonus refresh)
// 4. Prestige Wardrobe & Campaign Supply Crates (13 permanent unique titles + Solo Run Boons)
(function (global) {
  const QUEST_STORAGE_PREFIX = 'bytebound-quests-v1';
  const TITLE_REGISTRY_KEY = 'bytebound-player-titles-v1';
  const AUTO_SWIPE_MS = 3000;
  const BOUNTY_IDS = ['terminal_lockdown', 'clutch_recovery', 'flawless_execution', 'citadel_sovereign'];
  const ARENA_IDS = ['friendly_spar', 'full_stack_defender', 'rising_challenger'];

  const QUEST_PAGES = [
    {
      id: 'adaptive',
      index: 0,
      themeClass: 'quest-theme-adaptive',
      eyebrow: 'DAILY',
      title: 'Adaptive Quests',
      subtitle: 'Tailored daily study objectives.',
      badge: 'DAILY',
    },
    {
      id: 'bounties',
      index: 1,
      themeClass: 'quest-theme-bounties',
      eyebrow: 'WEEKLY',
      title: 'Campaign Bounties',
      subtitle: 'Room clears & boss challenges.',
      badge: 'WEEKLY',
    },
    {
      id: 'arena',
      index: 2,
      themeClass: 'quest-theme-arena',
      eyebrow: 'WEEKLY',
      title: 'Arena & Mastery',
      subtitle: '1v1 duels & discipline mastery.',
      badge: 'WEEKLY',
    },
  ];

  const OVERLAY_PAGES = [
    ...QUEST_PAGES,
    {
      id: 'prestige',
      index: 3,
      themeClass: 'quest-theme-prestige',
      eyebrow: 'PRESTIGE',
      title: 'Titles & Crates',
      subtitle: 'Equip prestige titles or inspect crates.',
      badge: 'PRESTIGE',
    },
  ];

  const PRESTIGE_TITLES = [
    {
      id: 'bug_hunter',
      name: 'Bug Hunter',
      label: '[Bug Hunter]',
      themeClass: 'pt-bug-hunter',
      category: 'Quest Mastery',
      requirement: 'Claim "Patch the Vulnerability" or answer 3 Review Queue questions correctly.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="4" y="2" width="4" height="2" fill="currentColor"/><rect x="3" y="4" width="6" height="5" fill="currentColor"/><rect x="1" y="4" width="2" height="1" fill="currentColor"/><rect x="9" y="4" width="2" height="1" fill="currentColor"/><rect x="1" y="7" width="2" height="1" fill="currentColor"/><rect x="9" y="7" width="2" height="1" fill="currentColor"/><rect x="5" y="5" width="2" height="2" fill="#071a12"/></svg>',
    },
    {
      id: 'packet_warden',
      name: 'Packet Warden',
      label: '[Packet Warden]',
      themeClass: 'pt-packet-warden',
      category: 'Network Defense',
      requirement: 'Claim "Full-Stack Defender", unlock Packet Lockdown, or answer 15 Networking questions correctly.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="1" width="8" height="2" fill="currentColor"/><rect x="1" y="3" width="10" height="4" fill="currentColor"/><rect x="2" y="7" width="8" height="2" fill="currentColor"/><rect x="4" y="9" width="4" height="2" fill="currentColor"/><rect x="4" y="4" width="4" height="3" fill="#06222c"/><rect x="5" y="5" width="2" height="1" fill="#9ef8ff"/></svg>',
    },
    {
      id: 'zero_miss',
      name: 'Zero-Miss Tactician',
      label: '[Zero-Miss Tactician]',
      themeClass: 'pt-zero-miss',
      category: 'Precision Combat',
      requirement: 'Complete "Flawless Execution" by winning a battle without missing a question.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="2" fill="currentColor"/><rect x="5" y="9" width="2" height="2" fill="currentColor"/><rect x="1" y="5" width="2" height="2" fill="currentColor"/><rect x="9" y="5" width="2" height="2" fill="currentColor"/><rect x="3" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/><rect x="5" y="5" width="2" height="2" fill="#ffe47a"/></svg>',
    },
    {
      id: 'citadel_champion',
      name: 'Citadel Champion',
      label: '[Citadel Champion]',
      themeClass: 'pt-citadel-champion',
      category: 'Boss Conquest',
      requirement: 'Complete "Citadel Sovereign" by defeating Final Boss King Crolue.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="3" width="2" height="5" fill="currentColor"/><rect x="5" y="2" width="2" height="6" fill="currentColor"/><rect x="9" y="3" width="2" height="5" fill="currentColor"/><rect x="1" y="7" width="10" height="3" fill="currentColor"/><rect x="5" y="5" width="2" height="2" fill="#ff5268"/></svg>',
    },
    {
      id: 'grand_cartographer',
      name: 'Grand Cartographer',
      label: '[Grand Cartographer]',
      themeClass: 'pt-cartographer',
      category: 'Full Map Clear',
      requirement: 'Clear every sector across the entire 16-room Bytebound Campaign Map.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="10" fill="currentColor"/><rect x="1" y="5" width="10" height="2" fill="currentColor"/><rect x="3" y="3" width="2" height="2" fill="#f6c767"/><rect x="7" y="7" width="2" height="2" fill="#f6c767"/><rect x="5" y="5" width="2" height="2" fill="#fff6d0"/></svg>',
    },
    {
      id: 'apex_sovereign',
      name: 'Apex Sovereign',
      label: '[Apex Sovereign]',
      themeClass: 'pt-apex-sovereign',
      category: 'Top #1 Rank',
      requirement: 'Claim the #1 Rank on the Weekly or All-Time Arcade or 1v1 Competitive Leaderboard.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="2" width="8" height="2" fill="currentColor"/><rect x="3" y="4" width="6" height="3" fill="currentColor"/><rect x="5" y="7" width="2" height="2" fill="currentColor"/><rect x="3" y="9" width="6" height="2" fill="currentColor"/><rect x="5" y="4" width="2" height="2" fill="#ffffff"/></svg>',
    },
    {
      id: 'codex_laureate',
      name: 'Codex Laureate',
      label: '[Codex Laureate]',
      themeClass: 'pt-codex-laureate',
      category: 'All Tutorials',
      requirement: 'Complete all guided Bytebound tours and tutorials end-to-end.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="2" width="8" height="8" fill="currentColor"/><rect x="1" y="2" width="1" height="2" fill="#fff0ba"/><rect x="10" y="8" width="1" height="2" fill="#fff0ba"/><rect x="4" y="4" width="4" height="1" fill="#1b2654"/><rect x="4" y="6" width="4" height="1" fill="#1b2654"/></svg>',
    },
    {
      id: 'campaign_vanguard',
      name: 'Campaign Vanguard',
      label: '[Campaign Vanguard]',
      themeClass: 'pt-vanguard',
      category: 'General Mastery',
      requirement: 'Unlock every achievement in the General Milestones section.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="8" y="1" width="3" height="3" fill="currentColor"/><rect x="6" y="3" width="3" height="3" fill="currentColor"/><rect x="4" y="5" width="3" height="3" fill="currentColor"/><rect x="2" y="7" width="3" height="3" fill="currentColor"/><rect x="1" y="9" width="2" height="2" fill="#ffba7a"/></svg>',
    },
    {
      id: 'scholar_prime',
      name: 'Scholar Prime',
      label: '[Scholar Prime]',
      themeClass: 'pt-scholar-prime',
      category: 'Study Mastery',
      requirement: 'Unlock every achievement in the Topic Drill, Tracker & Leaderboard section.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="2" fill="#b4ffe8"/><rect x="3" y="3" width="6" height="4" fill="currentColor"/><rect x="2" y="7" width="8" height="3" fill="#195c48"/><rect x="4" y="4" width="4" height="2" fill="#fff"/></svg>',
    },
    {
      id: 'arena_gladiator',
      name: 'Arena Gladiator',
      label: '[Arena Gladiator]',
      themeClass: 'pt-gladiator',
      category: '1v1 Mastery',
      requirement: 'Unlock every achievement in the 1v1 Competitive Arena section.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="2" width="2" height="2" fill="currentColor"/><rect x="3" y="4" width="2" height="2" fill="currentColor"/><rect x="9" y="2" width="2" height="2" fill="#ff8ce8"/><rect x="7" y="4" width="2" height="2" fill="#ff8ce8"/><rect x="5" y="6" width="2" height="2" fill="#ffffff"/><rect x="3" y="8" width="2" height="2" fill="currentColor"/><rect x="7" y="8" width="2" height="2" fill="#ff8ce8"/></svg>',
    },
    {
      id: 'arcane_architect',
      name: 'Arcane Architect',
      label: '[Arcane Architect]',
      themeClass: 'pt-arcane',
      category: 'Role Mastery',
      requirement: 'Unlock every achievement in the Role & Exclusive Skill Paths section.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="2" fill="#ffd97d"/><rect x="3" y="3" width="6" height="6" fill="currentColor"/><rect x="5" y="5" width="2" height="2" fill="#7cf7ff"/><rect x="5" y="9" width="2" height="2" fill="#ffd97d"/></svg>',
    },
    {
      id: 'flamekeeper',
      name: 'Flamekeeper',
      label: '[Flamekeeper]',
      themeClass: 'pt-flamekeeper',
      category: 'Daily Streak',
      requirement: 'Reach a 3-Day Daily Study Streak by completing 3 Adaptive Quests per day.',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="3" fill="#ff8826"/><rect x="3" y="4" width="6" height="5" fill="currentColor"/><rect x="4" y="6" width="4" height="3" fill="#fff199"/><rect x="3" y="9" width="6" height="2" fill="#7d190e"/></svg>',
    },
    {
      id: 'arena_contender',
      name: 'Arena Contender',
      label: '[Arena Contender]',
      themeClass: 'pt-contender',
      category: 'Sportsmanship',
      requirement: 'Complete 1 online 1v1 Multiplayer duel ("Friendly Spar").',
      iconSvg: '<svg class="pt-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="2" width="6" height="5" fill="currentColor"/><rect x="2" y="4" width="2" height="4" fill="#92d4ff"/><rect x="8" y="4" width="2" height="4" fill="#92d4ff"/><rect x="4" y="8" width="4" height="2" fill="#ffe07a"/></svg>',
    },
  ];

  const TITLE_BY_ID = Object.fromEntries(PRESTIGE_TITLES.map((t) => [t.id, t]));

  const DISCIPLINE_KEYS = [
    'Computer Systems',
    'Networking & Security',
    'Programming',
    'Database',
    'Discrete Mathematics',
    'Software Engineering',
    'Web & Mobile Development',
  ];
  const SHORT_DISC = {
    'Computer Systems': 'CS',
    'Networking & Security': 'NET',
    Programming: 'PROG',
    Database: 'DB',
    'Discrete Mathematics': 'DISC',
    'Software Engineering': 'SWE',
    'Web & Mobile Development': 'WEB',
  };

  function localDayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function prevDayKey(dayKey) {
    const [y, m, d] = String(dayKey || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    return localDayKey(dt);
  }

  function getMondayStartOfWeek(date = new Date()) {
    const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    return dt;
  }

  function localWeekKey(date = new Date()) {
    const mon = getMondayStartOfWeek(date);
    const utcMon = new Date(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()));
    utcMon.setUTCDate(utcMon.getUTCDate() + 3); // Thursday of ISO week
    const yearStart = new Date(Date.UTC(utcMon.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((utcMon - yearStart) / 86400000 + 1) / 7);
    return `${utcMon.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function getDailyResetCountdown(now = new Date()) {
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const totalMin = Math.max(1, Math.floor((nextMidnight.getTime() - now.getTime()) / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  function getWeeklyResetCountdown(now = new Date()) {
    const mon = getMondayStartOfWeek(now);
    const nextMon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7, 0, 0, 0, 0);
    const totalMin = Math.max(1, Math.floor((nextMon.getTime() - now.getTime()) / 60000));
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  }

  function getWeekWindow(date = new Date()) {
    const mon = getMondayStartOfWeek(date);
    return {
      weekKey: localWeekKey(date),
      weekStartMs: mon.getTime(),
      countdown: getWeeklyResetCountdown(date),
    };
  }

  function storageKeyFor(profileId) {
    const norm = String(profileId || '').trim().toLowerCase();
    return norm ? `${QUEST_STORAGE_PREFIX}:${encodeURIComponent(norm)}` : QUEST_STORAGE_PREFIX;
  }

  function defaultState() {
    const today = localDayKey();
    const weekKey = localWeekKey();
    return {
      dailyDayKey: today,
      weeklyKey: weekKey,
      weakRerollDay: '',
      weeklyBonusRefreshes: { bounties: 0, arena: 0 },
      dailyCompleted: 0,
      dailyStreak: 0,
      lastStreakDay: '',
      weakTarget: null, // { category, topic, year }
      supplyCrates: 0,
      equippedTitle: '',
      unlockedTitles: {},
      lifetime: {
        roomsCleared: [],
        reviewCorrect: 0,
        netCorrect: 0,
        flawlessWins: 0,
        crolueKills: 0,
        pvpPlayed: 0,
        topOneReached: false,
      },
      progress: {
        // Page 1: Adaptive Study Quests (Daily)
        patch_vulnerability: 0,
        weak_topic_specialist: 0,
        hard_mode_scholar: 0,
        combo_architect: 0,
        // Page 2: Campaign & District Bounties (Weekly)
        terminal_lockdown: { rooms: [], korDefeated: false },
        clutch_recovery: 0,
        flawless_execution: 0,
        citadel_sovereign: 0,
        // Page 3: Arena & Discipline Quests (Weekly)
        friendly_spar: 0,
        full_stack_defender: Object.fromEntries(DISCIPLINE_KEYS.map((d) => [d, 0])),
        rising_challenger: { wins: 0, highAccMatch: false },
      },
      claimed: {},
    };
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let activeProfileId = '';
  let store = defaultState();
  let overlayOpen = false;
  let overlayPage = 0;
  let hubPage = 0;
  let hubPaused = false;
  let hubHovered = false;
  let hubTimer = 0;
  let returnFocusEl = null;
  let crateReturnFocusEl = null;
  let crateModalOpen = false;
  let crateDraftChoices = null;
  let crateMessage = '';
  let eventsBound = false;

  function ensureWeakTarget() {
    const yr = typeof global.getActiveAcademicYear === 'function' ? global.getActiveAcademicYear() : 4;
    if (store.weakTarget && store.weakTarget.topic && store.weakTarget.year === yr) {
      return store.weakTarget;
    }
    let picked = null;
    if (typeof adaptive !== 'undefined' && typeof adaptive?.getWeakestTarget === 'function') {
      picked = adaptive.getWeakestTarget(null, yr);
    }
    store.weakTarget = picked
      ? { category: picked.category, topic: picked.topic, year: yr }
      : { category: 'Programming', topic: 'Programming', year: yr };
    return store.weakTarget;
  }

  function resetPageProgress(pageId) {
    if (pageId === 'bounties') {
      store.progress.terminal_lockdown = { rooms: [], korDefeated: false };
      store.progress.clutch_recovery = 0;
      store.progress.flawless_execution = 0;
      store.progress.citadel_sovereign = 0;
      for (const id of BOUNTY_IDS) delete store.claimed[id];
    } else if (pageId === 'arena') {
      store.progress.friendly_spar = 0;
      store.progress.full_stack_defender = Object.fromEntries(DISCIPLINE_KEYS.map((d) => [d, 0]));
      store.progress.rising_challenger = { wins: 0, highAccMatch: false };
      for (const id of ARENA_IDS) delete store.claimed[id];
    }
  }

  function normalizeDailyWindow() {
    const today = localDayKey();
    if (store.dailyDayKey === today) return false;
    // Missed yesterday resets active daily streak
    if (store.lastStreakDay && store.lastStreakDay !== prevDayKey(today) && store.lastStreakDay !== today) {
      store.dailyStreak = 0;
    }
    store.dailyDayKey = today;
    store.dailyCompleted = 0;
    store.weakRerollDay = '';
    store.weakTarget = null;
    for (const id of ['patch_vulnerability', 'weak_topic_specialist', 'hard_mode_scholar', 'combo_architect']) {
      store.progress[id] = 0;
      delete store.claimed[id];
    }
    ensureWeakTarget();
    return true;
  }

  function normalizeWeeklyWindow() {
    const curWeek = localWeekKey();
    if (store.weeklyKey === curWeek) return false;
    store.weeklyKey = curWeek;
    store.weeklyBonusRefreshes = { bounties: 0, arena: 0 };
    resetPageProgress('bounties');
    resetPageProgress('arena');
    return true;
  }

  function readTitleRegistry() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TITLE_REGISTRY_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function syncPlayerTitleRegistry() {
    const fallbackName = typeof activePlayerName === 'string' ? activePlayerName : '';
    const key = String(activeProfileId || fallbackName).trim().toLowerCase();
    if (!key) return;
    try {
      const map = readTitleRegistry();
      if (store.equippedTitle && TITLE_BY_ID[store.equippedTitle]) {
        map[key] = store.equippedTitle;
      } else {
        delete map[key];
      }
      localStorage.setItem(TITLE_REGISTRY_KEY, JSON.stringify(map));
    } catch {}
  }

  function getPlayerTitle(playerName) {
    const key = String(playerName || '').trim().toLowerCase();
    if (!key) return '';
    if (activeProfileId && key === activeProfileId) return store.equippedTitle || '';
    const map = readTitleRegistry();
    return TITLE_BY_ID[map[key]] ? map[key] : '';
  }

  function save() {
    try {
      localStorage.setItem(storageKeyFor(activeProfileId), JSON.stringify(store));
      syncPlayerTitleRegistry();
    } catch {}
  }

  function load(profileId = '') {
    activeProfileId = String(profileId || '').trim().toLowerCase();
    const base = defaultState();
    try {
      const raw = JSON.parse(localStorage.getItem(storageKeyFor(activeProfileId)) || 'null');
      if (raw && typeof raw === 'object') {
        base.dailyDayKey = typeof raw.dailyDayKey === 'string' ? raw.dailyDayKey : base.dailyDayKey;
        base.weeklyKey = typeof raw.weeklyKey === 'string' ? raw.weeklyKey : base.weeklyKey;
        base.weakRerollDay = typeof raw.weakRerollDay === 'string' ? raw.weakRerollDay : '';
        if (raw.weeklyBonusRefreshes && typeof raw.weeklyBonusRefreshes === 'object') {
          base.weeklyBonusRefreshes = {
            bounties: Math.max(0, Number(raw.weeklyBonusRefreshes.bounties) || 0),
            arena: Math.max(0, Number(raw.weeklyBonusRefreshes.arena) || 0),
          };
        }
        base.dailyCompleted = Number.isFinite(Number(raw.dailyCompleted)) ? Math.max(0, Number(raw.dailyCompleted)) : 0;
        base.dailyStreak = Number.isFinite(Number(raw.dailyStreak)) ? Math.max(0, Number(raw.dailyStreak)) : 0;
        base.lastStreakDay = typeof raw.lastStreakDay === 'string' ? raw.lastStreakDay : '';
        base.supplyCrates = Number.isFinite(Number(raw.supplyCrates)) ? Math.max(0, Number(raw.supplyCrates)) : 0;
        base.equippedTitle = typeof raw.equippedTitle === 'string' && TITLE_BY_ID[raw.equippedTitle] ? raw.equippedTitle : '';
        if (raw.unlockedTitles && typeof raw.unlockedTitles === 'object') {
          for (const [tid, ts] of Object.entries(raw.unlockedTitles)) {
            if (TITLE_BY_ID[tid] && ts) base.unlockedTitles[tid] = String(ts);
          }
        }
        if (raw.lifetime && typeof raw.lifetime === 'object') {
          const rc = Array.isArray(raw.lifetime.roomsCleared)
            ? [...new Set(raw.lifetime.roomsCleared.map(Number).filter((n) => n >= 1 && n <= 16))]
            : [];
          base.lifetime = {
            roomsCleared: rc,
            reviewCorrect: Math.max(0, Number(raw.lifetime.reviewCorrect) || 0),
            netCorrect: Math.max(0, Number(raw.lifetime.netCorrect) || 0),
            flawlessWins: Math.max(0, Number(raw.lifetime.flawlessWins) || 0),
            crolueKills: Math.max(0, Number(raw.lifetime.crolueKills) || 0),
            pvpPlayed: Math.max(0, Number(raw.lifetime.pvpPlayed) || 0),
            topOneReached: Boolean(raw.lifetime.topOneReached),
          };
        }
        if (raw.weakTarget && typeof raw.weakTarget === 'object' && raw.weakTarget.topic) {
          base.weakTarget = {
            category: String(raw.weakTarget.category || 'Programming'),
            topic: String(raw.weakTarget.topic),
            year: Number(raw.weakTarget.year) || 4,
          };
        }
        if (raw.progress && typeof raw.progress === 'object') {
          for (const k of ['patch_vulnerability', 'weak_topic_specialist', 'hard_mode_scholar', 'combo_architect', 'clutch_recovery', 'flawless_execution', 'citadel_sovereign', 'friendly_spar']) {
            if (Number.isFinite(Number(raw.progress[k]))) {
              base.progress[k] = Math.max(0, Number(raw.progress[k]));
            }
          }
          if (raw.progress.terminal_lockdown && typeof raw.progress.terminal_lockdown === 'object') {
            const rms = Array.isArray(raw.progress.terminal_lockdown.rooms)
              ? [...new Set(raw.progress.terminal_lockdown.rooms.map(Number).filter((n) => n >= 1 && n <= 5))]
              : [];
            base.progress.terminal_lockdown = {
              rooms: rms,
              korDefeated: Boolean(raw.progress.terminal_lockdown.korDefeated),
            };
          }
          if (raw.progress.full_stack_defender && typeof raw.progress.full_stack_defender === 'object') {
            for (const d of DISCIPLINE_KEYS) {
              const v = Number(raw.progress.full_stack_defender[d]) || 0;
              base.progress.full_stack_defender[d] = Math.max(0, Math.min(5, v));
            }
          }
          if (raw.progress.rising_challenger && typeof raw.progress.rising_challenger === 'object') {
            base.progress.rising_challenger = {
              wins: Math.max(0, Number(raw.progress.rising_challenger.wins) || 0),
              highAccMatch: Boolean(raw.progress.rising_challenger.highAccMatch),
            };
          }
        }
        if (raw.claimed && typeof raw.claimed === 'object') {
          base.claimed = { ...raw.claimed };
        }
      }
    } catch {}
    store = base;
    normalizeDailyWindow();
    normalizeWeeklyWindow();
    ensureWeakTarget();
    evaluatePrestigeTitles({ silent: true });
    save();
  }

  function evaluatePrestigeTitles({ unlockedMap = null, achievementList = null, silent = false } = {}) {
    const achUnlocked = unlockedMap || (typeof unlockedAchievements !== 'undefined' ? unlockedAchievements : {}) || {};
    const achCatalog = Array.isArray(achievementList)
      ? achievementList
      : (typeof ACHIEVEMENTS !== 'undefined' && Array.isArray(ACHIEVEMENTS) ? ACHIEVEMENTS : []);

    const sectionComplete = (secKey) => {
      const items = achCatalog.filter((a) => (a.category || 'general') === secKey);
      return items.length > 0 && items.every((a) => Boolean(achUnlocked[a.id]));
    };

    const tutDone = Boolean(
      achUnlocked['codex-laureate'] ||
      (global.ByteboundTutorial &&
        typeof global.ByteboundTutorial.getCompletedTutorialCount === 'function' &&
        global.ByteboundTutorial.getCompletedTutorialCount() >= (global.ByteboundTutorial.REQUIRED_TUTORIAL_IDS?.length || 17))
    );

    const netMastered = Boolean(
      store.claimed.full_stack_defender ||
      (store.lifetime?.netCorrect || 0) >= 15 ||
      (typeof exclusiveSkillTree !== 'undefined' && exclusiveSkillTree === 'networkingSecurity') ||
      (typeof skillProgress !== 'undefined' && (skillProgress?.networkingSecurity?.ranks?.packetLockdown || 0) > 0)
    );

    const checks = {
      bug_hunter: Boolean(store.claimed.patch_vulnerability || (store.lifetime?.reviewCorrect || 0) >= 3),
      packet_warden: netMastered,
      zero_miss: Boolean(store.claimed.flawless_execution || (store.progress.flawless_execution || 0) >= 1 || (store.lifetime?.flawlessWins || 0) >= 1),
      citadel_champion: Boolean(store.claimed.citadel_sovereign || (store.progress.citadel_sovereign || 0) >= 1 || (store.lifetime?.crolueKills || 0) >= 1),
      grand_cartographer: Boolean((store.lifetime?.roomsCleared?.length || 0) >= 16 || (typeof clearedRooms !== 'undefined' && clearedRooms?.size >= 16)),
      apex_sovereign: Boolean(store.lifetime?.topOneReached),
      codex_laureate: tutDone,
      campaign_vanguard: sectionComplete('general'),
      scholar_prime: sectionComplete('study'),
      arena_gladiator: sectionComplete('pvp'),
      arcane_architect: sectionComplete('exclusive'),
      flamekeeper: (store.dailyStreak || 0) >= 3,
      arena_contender: Boolean(store.claimed.friendly_spar || (store.progress.friendly_spar || 0) >= 1 || (store.lifetime?.pvpPlayed || 0) >= 1),
    };

    let unlockedNow = false;
    const nowIso = new Date().toISOString();
    for (const title of PRESTIGE_TITLES) {
      if (checks[title.id] && !store.unlockedTitles[title.id]) {
        store.unlockedTitles[title.id] = nowIso;
        unlockedNow = true;
        if (!store.equippedTitle) {
          store.equippedTitle = title.id;
        }
      }
    }
    if (unlockedNow && !silent) {
      save();
      if (typeof global.syncPlayerTitleUi === 'function') global.syncPlayerTitleUi();
    }
    return unlockedNow;
  }

  function equipTitle(titleId = '') {
    const clean = String(titleId || '').trim();
    if (clean && (!TITLE_BY_ID[clean] || !store.unlockedTitles[clean])) return false;
    store.equippedTitle = clean;
    save();
    if (typeof global.syncPlayerTitleUi === 'function') global.syncPlayerTitleUi();
    const curDash = typeof dashboardView !== 'undefined' ? dashboardView : '';
    if (typeof global.renderDashboard === 'function' && (curDash === 'leaderboards' || curDash === 'settings')) {
      global.renderDashboard();
    }
    if (global.mpUI?.network?.localProfile) {
      global.mpUI.network.localProfile.titleId = clean;
      global.mpUI.network.updatePresence?.({ titleId: clean });
    }
    syncAllUi();
    return true;
  }

  function renderTitleBadgeHtml(titleId, { compact = false } = {}) {
    const t = TITLE_BY_ID[titleId];
    if (!t) return '';
    return `<span class="prestige-title-badge ${esc(t.themeClass)}${compact ? ' is-compact' : ''}" title="${esc(`${t.label} — ${t.requirement}`)}">${t.iconSvg}<span>${esc(t.name)}</span></span>`;
  }

  function rerollWeakTopic() {
    normalizeDailyWindow();
    const today = localDayKey();
    if (store.weakRerollDay === today || store.claimed.weak_topic_specialist || (store.progress.weak_topic_specialist || 0) > 0) {
      return false;
    }
    const yr = typeof global.getActiveAcademicYear === 'function' ? global.getActiveAcademicYear() : 4;
    const curTopic = ensureWeakTarget().topic;
    const cats = typeof CATEGORY_TOPICS !== 'undefined' ? CATEGORY_TOPICS : null;
    const candidates = [];
    if (cats) {
      for (const [category, topics] of Object.entries(cats)) {
        for (const topic of topics) {
          const count = typeof global.getEligibleTopicCount === 'function'
            ? global.getEligibleTopicCount(category, topic, yr)
            : 1;
          if (count > 0) candidates.push({ category, topic, year: yr });
        }
      }
    }
    if (!candidates.length) return false;
    const curIdx = candidates.findIndex((c) => c.topic === curTopic);
    const next = candidates[(curIdx + 1) % candidates.length] || candidates[0];
    if (next.topic === curTopic && candidates.length > 1) {
      store.weakTarget = candidates[(curIdx + 2) % candidates.length];
    } else {
      store.weakTarget = next;
    }
    store.weakRerollDay = today;
    syncAllUi();
    return true;
  }

  function canRefreshWeeklyPage(pageId) {
    if (pageId !== 'bounties' && pageId !== 'arena') return false;
    const ids = pageId === 'bounties' ? BOUNTY_IDS : ARENA_IDS;
    const allClaimed = ids.every((id) => Boolean(store.claimed[id]));
    const usedBonus = Number(store.weeklyBonusRefreshes?.[pageId] || 0);
    return allClaimed && usedBonus < 1;
  }

  function refreshWeeklyPage(pageId) {
    normalizeWeeklyWindow();
    if (!canRefreshWeeklyPage(pageId)) return false;
    store.weeklyBonusRefreshes[pageId] = (store.weeklyBonusRefreshes[pageId] || 0) + 1;
    resetPageProgress(pageId);
    syncAllUi();
    return true;
  }

  function buildQuestList() {
    normalizeDailyWindow();
    normalizeWeeklyWindow();
    const weak = ensureWeakTarget();
    const tl = store.progress.terminal_lockdown || { rooms: [], korDefeated: false };
    const tlCount = Math.min(5, (tl.rooms || []).length) + (tl.korDefeated ? 1 : 0);
    const fs = store.progress.full_stack_defender || {};
    const fsDoneCount = DISCIPLINE_KEYS.filter((d) => (fs[d] || 0) >= 5).length;
    const rc = store.progress.rising_challenger || { wins: 0, highAccMatch: false };
    const rcValue = rc.highAccMatch ? 2 : Math.min(2, rc.wins || 0);

    return [
      // Page 0: Adaptive Study Quests (Daily)
      {
        id: 'patch_vulnerability',
        page: 'adaptive',
        title: 'Patch the Vulnerability',
        desc: 'Answer 3 missed Review Queue questions correctly.',
        current: Math.min(3, store.progress.patch_vulnerability || 0),
        target: 3,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.patch_vulnerability),
      },
      {
        id: 'weak_topic_specialist',
        page: 'adaptive',
        title: 'Weak-Topic Specialist',
        desc: `Answer 5 ${weak.topic} (${SHORT_DISC[weak.category] || weak.category}) questions.`,
        current: Math.min(5, store.progress.weak_topic_specialist || 0),
        target: 5,
        rewardType: weak.category,
        rewardAmount: 1,
        rewardLabel: `+1 ${SHORT_DISC[weak.category] || 'Disc'} SP`,
        claimed: Boolean(store.claimed.weak_topic_specialist),
      },
      {
        id: 'hard_mode_scholar',
        page: 'adaptive',
        title: 'Hard-Mode Scholar',
        desc: 'Answer 3 Medium or Hard questions correctly in one run.',
        current: Math.min(3, store.progress.hard_mode_scholar || 0),
        target: 3,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.hard_mode_scholar),
      },
      {
        id: 'combo_architect',
        page: 'adaptive',
        title: 'Combo Architect',
        desc: 'Reach 4/5 or 5/5 Exclusive Skill charge.',
        current: Math.min(1, store.progress.combo_architect || 0),
        target: 1,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.combo_architect),
      },

      // Page 1: Campaign & District Bounties
      {
        id: 'terminal_lockdown',
        page: 'bounties',
        title: 'Terminal Lockdown',
        desc: 'Clear Rooms 01–05 and defeat Mini Boss Kor.',
        current: Math.min(6, tlCount),
        target: 6,
        progressLabel: `${Math.min(5, (tl.rooms || []).length)}/5 Rooms · ${tl.korDefeated ? 'Kor ✓' : 'Kor 0/1'}`,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.terminal_lockdown),
      },
      {
        id: 'clutch_recovery',
        page: 'bounties',
        title: 'Clutch Recovery',
        desc: 'Complete a Perfect Remedial Surge when low on Mana.',
        current: Math.min(1, store.progress.clutch_recovery || 0),
        target: 1,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.clutch_recovery),
      },
      {
        id: 'flawless_execution',
        page: 'bounties',
        title: 'Flawless Execution',
        desc: 'Win any battle with zero missed questions.',
        current: Math.min(1, store.progress.flawless_execution || 0),
        target: 1,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.flawless_execution),
      },
      {
        id: 'citadel_sovereign',
        page: 'bounties',
        title: 'Citadel Sovereign',
        desc: 'Defeat Final Boss King Crolue.',
        current: Math.min(1, store.progress.citadel_sovereign || 0),
        target: 1,
        rewardType: 'wildcard',
        rewardAmount: 2,
        rewardLabel: '+2 Wild SP',
        claimed: Boolean(store.claimed.citadel_sovereign),
      },

      // Page 2: Arena & Discipline Quests
      {
        id: 'friendly_spar',
        page: 'arena',
        title: 'Friendly Spar',
        desc: 'Finish 1 online 1v1 Multiplayer duel.',
        current: Math.min(1, store.progress.friendly_spar || 0),
        target: 1,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.friendly_spar),
      },
      {
        id: 'full_stack_defender',
        page: 'arena',
        title: 'Full-Stack Defender',
        desc: 'Get 5 correct answers in any 4 disciplines.',
        current: Math.min(4, fsDoneCount),
        target: 4,
        progressLabel: `${Math.min(4, fsDoneCount)}/4 Disciplines`,
        rewardType: 'all',
        rewardAmount: 1,
        rewardLabel: '+1 All SP',
        claimed: Boolean(store.claimed.full_stack_defender),
      },
      {
        id: 'rising_challenger',
        page: 'arena',
        title: 'Rising Challenger',
        desc: 'Win 2 1v1 duels or score ≥ 75% duel accuracy.',
        current: rcValue,
        target: 2,
        progressLabel: rc.highAccMatch ? '75%+ Achieved ✓' : `${Math.min(2, rc.wins || 0)}/2 Wins`,
        rewardType: 'wildcard',
        rewardAmount: 1,
        rewardLabel: '+1 Wild SP',
        claimed: Boolean(store.claimed.rising_challenger),
      },
    ];
  }

  function getClaimableCount() {
    return buildQuestList().filter((q) => !q.claimed && q.current >= q.target).length;
  }

  function syncAllUi() {
    evaluatePrestigeTitles({ silent: true });
    save();
    syncHudBadgeDot();
    syncCrateHudButton();
    if (typeof global.syncPlayerTitleUi === 'function') global.syncPlayerTitleUi();
    if (overlayOpen) renderOverlay();
    syncHubWidgetDom();
  }

  function syncHudBadgeDot() {
    const claimable = getClaimableCount();
    const dot = document.getElementById('questsHudDot');
    const btn = document.getElementById('questsHudButton');
    if (dot) {
      dot.hidden = claimable <= 0;
      dot.textContent = claimable > 0 ? String(claimable) : '';
    }
    if (btn) {
      btn.classList.toggle('has-claimable', claimable > 0);
      const isMp = typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive;
      btn.hidden = Boolean(isMp);
    }
  }

  function isSoloCampaignCrateEligible() {
    if (typeof playViewActive === 'undefined' || !playViewActive) return false;
    if (typeof practiceRunActive !== 'undefined' && practiceRunActive) return false;
    if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive) return false;
    if (typeof mode === 'undefined' || mode === 'menu' || mode === 'end') return false;
    if (typeof battle !== 'undefined' && mode === 'battle' && battle?.phase && battle.phase !== 'choose') {
      return false;
    }
    return true;
  }

  function syncCrateHudButton() {
    const btn = document.getElementById('cratesHudButton');
    const textEl = document.getElementById('cratesHudText');
    if (!btn) return;
    const isMp = typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive;
    const isPractice = typeof practiceRunActive !== 'undefined' && practiceRunActive;
    const inPlay = typeof playViewActive !== 'undefined' && playViewActive;
    const crates = store.supplyCrates || 0;
    const relics = typeof hero !== 'undefined' ? (hero?.focusRelicCharges || 0) : 0;
    const show = Boolean(inPlay && !isMp && !isPractice && (crates > 0 || relics > 0));
    btn.hidden = !show;
    btn.classList.toggle('has-crates', crates > 0);
    if (textEl && show) {
      textEl.textContent = crates > 0
        ? `CRATES · ${crates}${relics > 0 ? ` (${relics}★)` : ''}`
        : `RELIC · ${relics}`;
    }
  }

  function claimQuest(questId) {
    const list = buildQuestList();
    const quest = list.find((q) => q.id === questId);
    if (!quest || quest.claimed || quest.current < quest.target) return false;

    store.claimed[quest.id] = new Date().toISOString();
    store.supplyCrates = (store.supplyCrates || 0) + 1;

    if (quest.page === 'adaptive') {
      const prevDaily = store.dailyCompleted || 0;
      store.dailyCompleted = Math.min(3, prevDaily + 1);
      if (prevDaily < 3 && store.dailyCompleted >= 3) {
        // Bonus Supply Crate for finishing 3/3 Daily Adaptive Quests
        store.supplyCrates += 1;
      }
      const today = localDayKey();
      if (store.dailyCompleted >= 3 && store.lastStreakDay !== today) {
        if (store.lastStreakDay === prevDayKey(today)) {
          store.dailyStreak = (store.dailyStreak || 0) + 1;
        } else {
          store.dailyStreak = 1;
        }
        store.lastStreakDay = today;
      }
    }

    evaluatePrestigeTitles({ silent: true });
    if (typeof global.grantBonusSkillPoint === 'function') {
      global.grantBonusSkillPoint(quest.rewardType, quest.rewardAmount, quest.title);
    }
    syncAllUi();
    return true;
  }

  // ===== Gameplay Progress Hooks =====
  function onQuestionAnswered({ question, correct, fromReview = false, difficulty = '', source = 'combat' } = {}) {
    if (!question) return;
    normalizeDailyWindow();
    normalizeWeeklyWindow();
    const weak = ensureWeakTarget();

    // Weak-Topic Specialist counts questions in the targeted weak topic (Combat or Topic Drill)
    if (question.topic === weak.topic && !store.claimed.weak_topic_specialist) {
      store.progress.weak_topic_specialist = Math.min(5, (store.progress.weak_topic_specialist || 0) + 1);
    }

    if (correct) {
      if (fromReview || source === 'review') {
        store.progress.patch_vulnerability = Math.min(3, (store.progress.patch_vulnerability || 0) + 1);
        store.lifetime.reviewCorrect = (store.lifetime.reviewCorrect || 0) + 1;
      }
      const diffKey = String(difficulty || '').toLowerCase();
      if (diffKey === 'medium' || diffKey === 'hard') {
        store.progress.hard_mode_scholar = Math.min(3, (store.progress.hard_mode_scholar || 0) + 1);
      }
      if (DISCIPLINE_KEYS.includes(question.category)) {
        store.progress.full_stack_defender[question.category] = Math.min(
          5,
          (store.progress.full_stack_defender[question.category] || 0) + 1,
        );
        if (question.category === 'Networking & Security') {
          store.lifetime.netCorrect = (store.lifetime.netCorrect || 0) + 1;
        }
      }
    }
    syncAllUi();
  }

  function onExclusiveChargeReached(charge) {
    if (Number(charge) >= 4) {
      normalizeDailyWindow();
      store.progress.combo_architect = 1;
      syncAllUi();
    }
  }

  function onPerfectRemedialSurge() {
    normalizeWeeklyWindow();
    store.progress.clutch_recovery = 1;
    syncAllUi();
  }

  function recordLifetimeRooms(clearedRooms = null, fallbackRoom = null) {
    if (!Array.isArray(store.lifetime.roomsCleared)) store.lifetime.roomsCleared = [];
    const set = new Set(store.lifetime.roomsCleared);
    if (clearedRooms && typeof clearedRooms[Symbol.iterator] === 'function') {
      for (const r of clearedRooms) {
        const base = ((Number(r) - 1) % 16) + 1;
        if (base >= 1 && base <= 16) set.add(base);
      }
    }
    if (fallbackRoom != null) {
      const base = ((Number(fallbackRoom) - 1) % 16) + 1;
      if (base >= 1 && base <= 16) set.add(base);
    }
    store.lifetime.roomsCleared = [...set].sort((a, b) => a - b);
  }

  function onBattleWon({ enemy, roomLevel = 1, clearedRooms = null, flawless = false } = {}) {
    normalizeWeeklyWindow();
    if (flawless) {
      store.progress.flawless_execution = 1;
      store.lifetime.flawlessWins = (store.lifetime.flawlessWins || 0) + 1;
    }
    const baseRoom = ((Number(roomLevel) - 1) % 16) + 1;
    recordLifetimeRooms(clearedRooms, baseRoom);
    if (clearedRooms && typeof clearedRooms.has === 'function') {
      for (let r = 1; r <= 5; r++) {
        if (clearedRooms.has(r) && !store.progress.terminal_lockdown.rooms.includes(r)) {
          store.progress.terminal_lockdown.rooms.push(r);
        }
      }
    } else if (baseRoom >= 1 && baseRoom <= 5 && !store.progress.terminal_lockdown.rooms.includes(baseRoom)) {
      store.progress.terminal_lockdown.rooms.push(baseRoom);
    }
    if (enemy?.kor) {
      store.progress.terminal_lockdown.korDefeated = true;
    }
    if (enemy?.isFinal) {
      store.progress.citadel_sovereign = 1;
      store.lifetime.crolueKills = (store.lifetime.crolueKills || 0) + 1;
    }
    syncAllUi();
  }

  function onRoomsUpdated(clearedRooms = null) {
    recordLifetimeRooms(clearedRooms, null);
    syncAllUi();
  }

  function onLeaderboardRankChecked({ arcadeRank = 0, pvpRank = 0 } = {}) {
    if (arcadeRank === 1 || pvpRank === 1) {
      if (!store.lifetime.topOneReached) {
        store.lifetime.topOneReached = true;
        syncAllUi();
      } else {
        evaluatePrestigeTitles({ silent: false });
      }
    }
  }

  function onAchievementsSynced(unlockedMap, achievementList) {
    if (evaluatePrestigeTitles({ unlockedMap, achievementList, silent: true })) {
      save();
      if (typeof global.syncPlayerTitleUi === 'function') global.syncPlayerTitleUi();
      if (overlayOpen) renderOverlay();
    }
  }

  function onRunReset() {
    if (!store.claimed.hard_mode_scholar) {
      store.progress.hard_mode_scholar = 0;
    }
    syncAllUi();
  }

  function onPvpMatchFinished({ outcome, correct = 0, total = 0 } = {}) {
    normalizeWeeklyWindow();
    store.progress.friendly_spar = 1;
    store.lifetime.pvpPlayed = (store.lifetime.pvpPlayed || 0) + 1;
    if (outcome === 'won') {
      store.progress.rising_challenger.wins = Math.min(2, (store.progress.rising_challenger.wins || 0) + 1);
    }
    if (total > 0 && (correct / total) >= 0.75) {
      store.progress.rising_challenger.highAccMatch = true;
    }
    syncAllUi();
  }

  // ===== UI Rendering =====
  function renderQuestCardHtml(q, compact = false) {
    const done = q.current >= q.target;
    const pct = Math.max(0, Math.min(100, Math.round((q.current / Math.max(1, q.target)) * 100)));
    const statusText = q.progressLabel || `${q.current} / ${q.target}`;
    let actionHtml = '';
    if (q.claimed) {
      actionHtml = `<span class="quest-status-chip is-claimed">✓ Claimed</span>`;
    } else if (done) {
      actionHtml = `<button type="button" class="quest-claim-btn" data-quest-claim="${esc(q.id)}">Claim</button>`;
    } else if (!compact && q.id === 'weak_topic_specialist' && q.current === 0 && store.weakRerollDay !== localDayKey()) {
      actionHtml = `<button type="button" class="quest-reroll-btn" data-quest-reroll-weak title="Reroll today's weak topic once">↻ Reroll</button>`;
    }

    return `<article class="quest-item-card${done ? ' is-ready' : ''}${q.claimed ? ' is-claimed' : ''}${compact ? ' is-compact' : ''}">
      <div class="quest-item-top">
        <div class="quest-item-copy">
          <h4>${esc(q.title)}</h4>
          <p>${esc(q.desc)}</p>
        </div>
        <span class="quest-reward-pill" title="${esc(q.rewardLabel)} + 1 Supply Crate">${esc(q.rewardLabel)} · ▣</span>
      </div>
      <div class="quest-item-foot">
        <div class="quest-progress-wrap" aria-label="Progress ${q.current} of ${q.target}">
          <div class="quest-progress-bar"><i style="width:${pct}%"></i></div>
          <small>${esc(statusText)}</small>
        </div>
        ${actionHtml}
      </div>
    </article>`;
  }

  function renderPageTabsHtml(activeIndex, scopeAttr) {
    const allQuests = buildQuestList();
    const pages = scopeAttr === 'quest-overlay' ? OVERLAY_PAGES : QUEST_PAGES;
    const labels = { adaptive: 'Adaptive', bounties: 'Bounties', arena: 'Arena', prestige: 'Titles & Crates' };
    return pages.map((pg, idx) => {
      const readyInPage = pg.id === 'prestige'
        ? (store.supplyCrates || 0)
        : allQuests.filter((q) => q.page === pg.id && !q.claimed && q.current >= q.target).length;
      return `<button type="button" class="quest-page-tab ${pg.themeClass}${activeIndex === idx ? ' is-active' : ''}" data-${scopeAttr}-page="${idx}" aria-pressed="${activeIndex === idx}">
        <span>${idx + 1}. ${esc(labels[pg.id] || pg.id)}</span>
        ${readyInPage > 0 ? `<em class="quest-tab-badge" title="${pg.id === 'prestige' ? `${readyInPage} Supply Crate(s)` : `${readyInPage} ready to claim`}">${readyInPage}</em>` : ''}
      </button>`;
    }).join('');
  }

  function renderPixelFireSvg(streakCount = 0, sizeClass = '') {
    const count = Math.max(0, Number(streakCount) || 0);
    const cls = [
      'quest-pixel-fire-svg',
      sizeClass || '',
      count > 0 ? 'is-ignited' : '',
      count >= 3 ? 'is-blazing' : '',
    ].filter(Boolean).join(' ');

    return `<svg class="${cls}" viewBox="0 0 24 28" shape-rendering="crispEdges" focusable="false" aria-hidden="true">
      <!-- Charred Pixel Hearth & Glowing Embers -->
      <rect x="4" y="25" width="16" height="2" fill="#260906" />
      <rect x="5" y="24" width="14" height="1" fill="#3d100a" />
      <rect x="6" y="25" width="3" height="1" fill="#a31c15" />
      <rect x="9" y="25" width="4" height="1" fill="#ff6e1a" />
      <rect x="13" y="25" width="3" height="1" fill="#ffc933" />
      <rect x="16" y="25" width="2" height="1" fill="#a31c15" />
      <rect x="7" y="24" width="2" height="1" fill="#661910" />
      <rect x="10" y="24" width="4" height="1" fill="#ffe45e" />
      <rect x="15" y="24" width="2" height="1" fill="#661910" />

      <!-- Outer Dark Flame Outline Silhouette -->
      <rect x="6" y="23" width="12" height="1" fill="#260906" />
      <rect x="4" y="20" width="2" height="4" fill="#260906" />
      <rect x="18" y="20" width="2" height="4" fill="#260906" />
      <rect x="3" y="15" width="1" height="6" fill="#260906" />
      <rect x="20" y="15" width="1" height="6" fill="#260906" />
      <rect x="4" y="12" width="1" height="4" fill="#3d100a" />
      <rect x="19" y="12" width="1" height="4" fill="#3d100a" />
      <rect x="5" y="9" width="1" height="4" fill="#3d100a" />
      <rect x="18" y="10" width="1" height="3" fill="#3d100a" />
      <rect x="7" y="7" width="1" height="3" fill="#3d100a" />
      <rect x="16" y="7" width="1" height="4" fill="#3d100a" />
      <rect x="9" y="5" width="1" height="3" fill="#3d100a" />
      <rect x="14" y="5" width="1" height="3" fill="#3d100a" />
      <rect x="10" y="3" width="3" height="2" fill="#3d100a" />

      <!-- Deep Crimson Outer Flame Mass -->
      <rect x="6" y="21" width="12" height="3" fill="#a31c15" />
      <rect x="4" y="16" width="16" height="5" fill="#cf2d1d" />
      <rect x="5" y="13" width="14" height="4" fill="#cf2d1d" />
      <rect x="4" y="13" width="1" height="3" fill="#a31c15" />
      <rect x="19" y="14" width="1" height="3" fill="#a31c15" />
      <rect x="6" y="10" width="12" height="4" fill="#e6441c" />
      <rect x="8" y="7" width="8" height="4" fill="#e6441c" />
      <rect x="10" y="5" width="4" height="3" fill="#cf2d1d" />
      <rect x="5" y="10" width="1" height="2" fill="#a31c15" />
      <rect x="18" y="11" width="1" height="2" fill="#a31c15" />

      <!-- Animated Upper Flame Tongues (Flicker Layer A) -->
      <g class="pf-flicker-a">
        <rect x="11" y="2" width="2" height="2" fill="#e6441c" />
        <rect x="11" y="3" width="2" height="2" fill="#ff841a" />
        <rect x="12" y="1" width="1" height="1" fill="#f7641b" />
        <rect x="6" y="8" width="1" height="3" fill="#f7641b" />
        <rect x="5" y="7" width="1" height="2" fill="#cf2d1d" />
      </g>

      <!-- Animated Side Licks (Flicker Layer B) -->
      <g class="pf-flicker-b">
        <rect x="17" y="8" width="1" height="3" fill="#f7641b" />
        <rect x="18" y="7" width="1" height="2" fill="#e6441c" />
        <rect x="9" y="4" width="1" height="2" fill="#ff841a" />
        <rect x="14" y="6" width="1" height="2" fill="#ffa324" />
        <rect x="10" y="5" width="2" height="2" fill="#ffa324" />
      </g>

      <!-- Swirling Vermilion & Tangerine Mid-Body -->
      <rect x="6" y="18" width="12" height="5" fill="#e6441c" />
      <rect x="7" y="15" width="10" height="7" fill="#f7641b" />
      <rect x="6" y="15" width="2" height="4" fill="#ff841a" />
      <rect x="16" y="16" width="2" height="4" fill="#ff841a" />
      <rect x="8" y="12" width="8" height="6" fill="#ff841a" />
      <rect x="9" y="9" width="6" height="4" fill="#ffa324" />
      <rect x="10" y="7" width="4" height="3" fill="#ffa324" />
      <rect x="7" y="11" width="2" height="3" fill="#ffa324" />
      <rect x="15" y="13" width="2" height="3" fill="#ffa324" />

      <!-- Pulsing Molten Gold & Incandescent Core -->
      <g class="pf-core">
        <rect x="8" y="17" width="8" height="6" fill="#ffc933" />
        <rect x="9" y="14" width="6" height="5" fill="#ffc933" />
        <rect x="10" y="11" width="4" height="4" fill="#ffe45e" />
        <rect x="9" y="17" width="6" height="5" fill="#ffe45e" />
        <rect x="11" y="10" width="2" height="2" fill="#ffe45e" />
        <rect x="10" y="18" width="4" height="4" fill="#fff6c4" />
        <rect x="11" y="15" width="2" height="4" fill="#fff6c4" />
        <rect x="11" y="19" width="2" height="3" fill="#ffffff" />
        <rect x="12" y="17" width="1" height="2" fill="#ffffff" />
      </g>

      <!-- Specular Spark Accents -->
      <rect x="7" y="18" width="1" height="1" fill="#ffe45e" />
      <rect x="16" y="19" width="1" height="1" fill="#ffe45e" />
      <rect x="9" y="12" width="1" height="1" fill="#ffe45e" />
      <rect x="14" y="13" width="1" height="1" fill="#ffc933" />

      <!-- Floating Rising Pixel Sparks -->
      <g class="pf-sparks">
        <rect class="pf-spark pf-s1" x="6" y="4" width="1" height="1" fill="#ffc933" />
        <rect class="pf-spark pf-s2" x="17" y="4" width="1" height="1" fill="#ff841a" />
        <rect class="pf-spark pf-s3" x="12" y="0" width="1" height="1" fill="#ffe45e" />
      </g>
    </svg>`;
  }

  function renderStreakBannerHtml() {
    const wildcardCount = typeof global.getWildcardSkillPoints === 'function' ? global.getWildcardSkillPoints() : 0;
    const streakCount = store.dailyStreak || 0;
    const equippedHtml = store.equippedTitle ? renderTitleBadgeHtml(store.equippedTitle, { compact: true }) : '';
    return `<div class="quest-meta-strip">
      <div class="quest-streak-card">
        <span class="quest-streak-fire${streakCount > 0 ? ' is-ignited' : ''}" aria-hidden="true">${renderPixelFireSvg(streakCount)}</span>
        <div class="quest-streak-copy">
          <strong>${streakCount}d Streak ${equippedHtml}</strong>
          <small>Daily ${Math.min(3, store.dailyCompleted || 0)}/3 · Crates ${store.supplyCrates || 0}</small>
        </div>
      </div>
      <div class="quest-banner-chips">
        <button type="button" class="quest-wildcard-chip" data-open-skill-tree title="Open Skill Tree [U]">
          <span>★ Wild SP</span>
          <strong>${wildcardCount}</strong>
        </button>
      </div>
    </div>`;
  }

  function renderHubCycleBadge(pageId) {
    return pageId === 'adaptive'
      ? `Daily · ${getDailyResetCountdown()}`
      : `Weekly · ${getWeeklyResetCountdown()}`;
  }

  function renderHubSlidesHtml(allQuests = buildQuestList()) {
    return QUEST_PAGES.map((pg, idx) => {
      const questsForPage = allQuests.filter((q) => q.page === pg.id);
      const isActive = idx === hubPage;
      const refreshBar = pg.id !== 'adaptive' && canRefreshWeeklyPage(pg.id)
        ? `<div class="quest-refresh-row"><button type="button" class="quest-weekly-refresh-btn" data-quest-weekly-refresh="${esc(pg.id)}">↻ Bonus Weekly Cycle</button></div>`
        : '';
      return `<div class="quest-hub-slide ${pg.themeClass}${isActive ? ' is-active-slide' : ''}" data-quest-page-key="${esc(pg.id)}" data-slide-index="${idx}" aria-hidden="${isActive ? 'false' : 'true'}">
        <div class="quest-hub-list">${refreshBar}${questsForPage.map((q) => renderQuestCardHtml(q, true)).join('')}</div>
      </div>`;
    }).join('');
  }

  function renderHubWidgetInner() {
    const pageMeta = QUEST_PAGES[hubPage] || QUEST_PAGES[0];
    const allQuests = buildQuestList();
    const claimable = allQuests.filter((q) => !q.claimed && q.current >= q.target).length;

    return `
      <header class="quest-hub-head">
        <div class="quest-hub-title-wrap">
          <div class="quest-hub-title-row">
            <h2 data-hub-title>${esc(pageMeta.title)}</h2>
            <span class="quest-cycle-pill" data-hub-cycle>${esc(renderHubCycleBadge(pageMeta.id))}</span>
          </div>
        </div>
        <div class="quest-hub-controls">
          <button type="button" class="quest-mini-btn" data-quest-hub-step="-1" aria-label="Previous quest page">◀</button>
          <button type="button" class="quest-mini-btn" data-quest-hub-toggle data-hub-toggle aria-label="${hubPaused ? 'Resume auto-swipe' : 'Pause auto-swipe'}">${hubPaused ? '▶' : '⏸'}</button>
          <button type="button" class="quest-mini-btn" data-quest-hub-step="1" aria-label="Next quest page">▶</button>
        </div>
      </header>
      <div data-hub-meta>${renderStreakBannerHtml()}</div>
      <div class="quest-page-tabs is-compact" data-hub-tabs role="tablist" aria-label="Quest categories">${renderPageTabsHtml(hubPage, 'quest-hub')}</div>
      <div class="quest-hub-viewport">
        <div class="quest-hub-track" data-hub-track style="transform: translate3d(-${hubPage * 100}%, 0, 0);">
          ${renderHubSlidesHtml(allQuests)}
        </div>
      </div>
      <footer class="quest-hub-foot">
        <button type="button" class="quest-open-modal-btn" data-open-quests-overlay data-hub-open-btn>
          Quest Board [O]${claimable > 0 ? ` · ${claimable} Ready` : ''}
        </button>
        <small data-hub-foot-note>${hubPaused ? 'Auto-swipe paused' : 'Auto-swipes every 3s'}</small>
      </footer>`;
  }

  function renderHubWidget() {
    ensureDomEventsBound();
    const pageMeta = QUEST_PAGES[hubPage] || QUEST_PAGES[0];
    return `<section class="quest-hub-carousel ${pageMeta.themeClass}" id="questHubCarousel" data-active-page="${esc(pageMeta.id)}" data-active-index="${hubPage}" aria-label="Active Quests Carousel">
      ${renderHubWidgetInner()}
    </section>`;
  }

  function syncHubWidgetDom({ slideOnly = false } = {}) {
    const el = document.getElementById('questHubCarousel');
    if (!el) return;
    const pageMeta = QUEST_PAGES[hubPage] || QUEST_PAGES[0];
    const track = el.querySelector('[data-hub-track]');
    const slides = track ? [...track.querySelectorAll('.quest-hub-slide')] : [];

    if (!track || slides.length !== QUEST_PAGES.length) {
      el.className = `quest-hub-carousel ${pageMeta.themeClass}`;
      el.dataset.activePage = pageMeta.id;
      el.dataset.activeIndex = String(hubPage);
      el.innerHTML = renderHubWidgetInner();
      return;
    }

    el.className = `quest-hub-carousel ${pageMeta.themeClass}`;
    el.dataset.activePage = pageMeta.id;
    el.dataset.activeIndex = String(hubPage);

    const eyebrowEl = el.querySelector('[data-hub-eyebrow]');
    const cycleEl = el.querySelector('[data-hub-cycle]');
    const titleEl = el.querySelector('[data-hub-title]');
    const toggleEl = el.querySelector('[data-hub-toggle]');
    const footNoteEl = el.querySelector('[data-hub-foot-note]');

    if (eyebrowEl) eyebrowEl.textContent = pageMeta.eyebrow;
    if (cycleEl) cycleEl.textContent = renderHubCycleBadge(pageMeta.id);
    if (titleEl) titleEl.textContent = pageMeta.title;
    if (toggleEl) {
      toggleEl.textContent = hubPaused ? '▶' : '⏸';
      toggleEl.setAttribute('aria-label', hubPaused ? 'Resume auto-swipe' : 'Pause auto-swipe');
    }
    if (footNoteEl) footNoteEl.textContent = hubPaused ? 'Auto-swipe paused' : 'Auto-swipes every 3s';

    track.style.transform = `translate3d(-${hubPage * 100}%, 0, 0)`;

    slides.forEach((slideEl, idx) => {
      const isActive = idx === hubPage;
      slideEl.classList.toggle('is-active-slide', isActive);
      slideEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    if (slideOnly) {
      const tabs = el.querySelectorAll('[data-quest-hub-page]');
      tabs.forEach((tabEl) => {
        const isActive = Number(tabEl.dataset.questHubPage) === hubPage;
        tabEl.classList.toggle('is-active', isActive);
        tabEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      return;
    }

    const allQuests = buildQuestList();
    const claimable = allQuests.filter((q) => !q.claimed && q.current >= q.target).length;
    const metaEl = el.querySelector('[data-hub-meta]');
    const tabsEl = el.querySelector('[data-hub-tabs]');
    const openBtnEl = el.querySelector('[data-hub-open-btn]');

    if (metaEl) metaEl.innerHTML = renderStreakBannerHtml();
    if (tabsEl) tabsEl.innerHTML = renderPageTabsHtml(hubPage, 'quest-hub');
    if (openBtnEl) {
      openBtnEl.textContent = `Quest Board [O]${claimable > 0 ? ` · ${claimable} Ready` : ''}`;
    }

    slides.forEach((slideEl, idx) => {
      const pg = QUEST_PAGES[idx];
      const listEl = slideEl.querySelector('.quest-hub-list');
      if (!pg || !listEl) return;
      const questsForPage = allQuests.filter((q) => q.page === pg.id);
      const refreshBar = pg.id !== 'adaptive' && canRefreshWeeklyPage(pg.id)
        ? `<div class="quest-refresh-row"><button type="button" class="quest-weekly-refresh-btn" data-quest-weekly-refresh="${esc(pg.id)}">↻ Start Bonus Weekly Cycle</button></div>`
        : '';
      listEl.innerHTML = refreshBar + questsForPage.map((q) => renderQuestCardHtml(q, true)).join('');
    });
  }

  function stepHubPage(delta = 1) {
    hubPage = (hubPage + delta + QUEST_PAGES.length) % QUEST_PAGES.length;
    syncHubWidgetDom({ slideOnly: true });
  }

  function setHubPage(index) {
    const next = Math.max(0, Math.min(QUEST_PAGES.length - 1, Number(index) || 0));
    hubPage = next;
    syncHubWidgetDom({ slideOnly: true });
  }

  function startHubAutoSwipe() {
    if (hubTimer) return;
    hubTimer = global.setInterval(() => {
      if (hubPaused || hubHovered || overlayOpen) return;
      const appEl = document.getElementById('app');
      if (!appEl || appEl.hidden || appEl.classList.contains('is-playing')) return;
      if (typeof dashboardView !== 'undefined' && dashboardView !== 'quest') return;
      if (!document.getElementById('questHubCarousel')) return;
      stepHubPage(1);
    }, AUTO_SWIPE_MS);
  }

  function stopHubAutoSwipe() {
    if (hubTimer) {
      global.clearInterval(hubTimer);
      hubTimer = 0;
    }
  }

  function toggleHubAutoSwipe() {
    hubPaused = !hubPaused;
    syncHubWidgetDom({ slideOnly: true });
  }

  function renderPrestigeWardrobeSlideHtml() {
    const crates = store.supplyCrates || 0;
    const relics = typeof hero !== 'undefined' ? (hero?.focusRelicCharges || 0) : 0;
    const eligibleNow = isSoloCampaignCrateEligible();
    const unlockedCount = PRESTIGE_TITLES.filter((t) => Boolean(store.unlockedTitles[t.id])).length;
    const cardsHtml = PRESTIGE_TITLES.map((t) => {
      const unlocked = Boolean(store.unlockedTitles[t.id]);
      const equipped = unlocked && store.equippedTitle === t.id;
      const actionBtn = equipped
        ? `<button type="button" class="prestige-equip-btn is-equipped" data-equip-title="">Equipped ✓</button>`
        : unlocked
          ? `<button type="button" class="prestige-equip-btn" data-equip-title="${esc(t.id)}">Equip</button>`
          : `<span class="prestige-lock-chip">Locked</span>`;
      const footLeft = unlocked
        ? `<small>${new Date(store.unlockedTitles[t.id]).toLocaleDateString()}</small>`
        : `<small class="is-muted">${esc(t.category)}</small>`;
      return `<article class="prestige-wardrobe-card${unlocked ? ' is-unlocked' : ' is-locked'}${equipped ? ' is-equipped' : ''}">
        <div class="prestige-wardrobe-top">
          ${renderTitleBadgeHtml(t.id)}
          ${actionBtn}
        </div>
        <p class="prestige-wardrobe-req">${esc(t.requirement)}</p>
        <div class="prestige-wardrobe-foot">
          ${footLeft}
        </div>
      </article>`;
    }).join('');

    return `
      <div class="crate-stash-bar">
        <div class="crate-stash-copy">
          <strong>▣ ${crates} Supply Crate${crates === 1 ? '' : 's'}${relics > 0 ? ` · ★ ${relics} Focus Relic` : ''}</strong>
          <p>Solo run boons: +25 HP &amp; Mana, Bonus Card Draft, or 1/5 Exclusive Charge.</p>
        </div>
        ${eligibleNow && crates > 0
          ? `<button type="button" class="quest-claim-btn" data-open-supply-crate>Open Crate</button>`
          : `<span class="quest-status-chip">${crates > 0 ? 'Use CRATES in Solo Run' : 'Earn via Quests'}</span>`}
      </div>
      <div class="prestige-wardrobe-head">
        <strong>Prestige Titles · ${unlockedCount}/${PRESTIGE_TITLES.length}</strong>
        <small>Shown on Profile, Leaderboards &amp; 1v1 Arena</small>
      </div>
      <div class="prestige-wardrobe-grid">${cardsHtml}</div>`;
  }

  function renderOverlaySlideBody(pg, allQuests) {
    if (pg.id === 'prestige') {
      return renderPrestigeWardrobeSlideHtml();
    }
    const questsForPage = allQuests.filter((q) => q.page === pg.id);
    const canReroll = pg.id === 'adaptive' && !store.claimed.weak_topic_specialist && (store.progress.weak_topic_specialist || 0) === 0 && store.weakRerollDay !== localDayKey();
    const canBonusWeekly = pg.id !== 'adaptive' && canRefreshWeeklyPage(pg.id);
    const actionBar = canReroll
      ? `<div class="quest-cycle-bar"><span>Daily · ${esc(getDailyResetCountdown())}</span><button type="button" class="quest-reroll-btn" data-quest-reroll-weak>↻ Reroll Weak Topic</button></div>`
      : canBonusWeekly
        ? `<div class="quest-cycle-bar"><span>Weekly · ${esc(getWeeklyResetCountdown())}</span><button type="button" class="quest-weekly-refresh-btn" data-quest-weekly-refresh="${esc(pg.id)}">↻ Start Bonus Weekly Cycle</button></div>`
        : '';
    return `${actionBar}<div class="quest-overlay-grid">${questsForPage.map((q) => renderQuestCardHtml(q, false)).join('')}</div>`;
  }

  function renderOverlaySlidesHtml(allQuests = buildQuestList()) {
    return OVERLAY_PAGES.map((pg, idx) => {
      const isActive = idx === overlayPage;
      return `<div class="quest-overlay-slide ${pg.themeClass}${isActive ? ' is-active-slide' : ''}" data-overlay-page-key="${esc(pg.id)}" data-slide-index="${idx}" aria-hidden="${isActive ? 'false' : 'true'}">
        <div class="quest-overlay-slide-body">${renderOverlaySlideBody(pg, allQuests)}</div>
      </div>`;
    }).join('');
  }

  function renderOverlayCycleLabel(pageId) {
    if (pageId === 'adaptive') return `Daily · ${getDailyResetCountdown()}`;
    if (pageId === 'prestige') return 'Titles & Boons';
    return `Weekly · ${getWeeklyResetCountdown()}`;
  }

  function renderOverlay({ slideOnly = false } = {}) {
    const overlay = document.getElementById('questOverlay');
    if (!overlay) return;
    const pageMeta = OVERLAY_PAGES[overlayPage] || OVERLAY_PAGES[0];
    const shell = overlay.querySelector('[data-overlay-shell]');
    const track = overlay.querySelector('[data-overlay-track]');
    const slides = track ? [...track.querySelectorAll('.quest-overlay-slide')] : [];

    if (!shell || !track || slides.length !== OVERLAY_PAGES.length) {
      const allQuests = buildQuestList();
      overlay.innerHTML = `<div class="quest-shell ${pageMeta.themeClass}" data-overlay-shell data-active-page="${esc(pageMeta.id)}" data-active-index="${overlayPage}" role="dialog" aria-modal="true" aria-labelledby="questOverlayTitle">
        <header class="quest-shell-header">
          <div class="quest-shell-title-row">
            <h1 id="questOverlayTitle" data-overlay-title>${esc(pageMeta.title)}</h1>
            <span class="quest-cycle-pill" data-overlay-cycle>${esc(renderOverlayCycleLabel(pageMeta.id))}</span>
          </div>
          <div class="quest-shell-actions">
            <button type="button" class="quest-nav-btn" data-quest-overlay-step="-1" aria-label="Previous quest page">◀</button>
            <button type="button" class="quest-nav-btn" data-quest-overlay-step="1" aria-label="Next quest page">▶</button>
            <button type="button" class="quest-close-btn" id="closeQuestOverlayBtn">Close · O</button>
          </div>
        </header>
        <div data-overlay-meta>${renderStreakBannerHtml()}</div>
        <div class="quest-page-tabs quest-overlay-tabs" data-overlay-tabs role="tablist" aria-label="Quest Pages">${renderPageTabsHtml(overlayPage, 'quest-overlay')}</div>
        <div class="quest-overlay-viewport">
          <div class="quest-overlay-track" data-overlay-track style="transform: translate3d(-${overlayPage * 100}%, 0, 0);">
            ${renderOverlaySlidesHtml(allQuests)}
          </div>
        </div>
        <footer class="quest-shell-footer">
          <span>◀ / ▶ Switch pages · [O] Close</span>
        </footer>
      </div>`;
      return;
    }

    shell.className = `quest-shell ${pageMeta.themeClass}`;
    shell.dataset.activePage = pageMeta.id;
    shell.dataset.activeIndex = String(overlayPage);

    const titleEl = shell.querySelector('[data-overlay-title]');
    const cycleEl = shell.querySelector('[data-overlay-cycle]');
    if (titleEl) titleEl.textContent = pageMeta.title;
    if (cycleEl) cycleEl.textContent = renderOverlayCycleLabel(pageMeta.id);

    track.style.transform = `translate3d(-${overlayPage * 100}%, 0, 0)`;

    slides.forEach((slideEl, idx) => {
      const isActive = idx === overlayPage;
      slideEl.classList.toggle('is-active-slide', isActive);
      slideEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    if (slideOnly) {
      const tabs = shell.querySelectorAll('[data-quest-overlay-page]');
      tabs.forEach((tabEl) => {
        const isActive = Number(tabEl.dataset.questOverlayPage) === overlayPage;
        tabEl.classList.toggle('is-active', isActive);
        tabEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      return;
    }

    const allQuests = buildQuestList();
    const metaEl = shell.querySelector('[data-overlay-meta]');
    const tabsEl = shell.querySelector('[data-overlay-tabs]');
    if (metaEl) metaEl.innerHTML = renderStreakBannerHtml();
    if (tabsEl) tabsEl.innerHTML = renderPageTabsHtml(overlayPage, 'quest-overlay');

    slides.forEach((slideEl, idx) => {
      const pg = OVERLAY_PAGES[idx];
      const bodyEl = slideEl.querySelector('.quest-overlay-slide-body');
      if (!pg || !bodyEl) return;
      bodyEl.innerHTML = renderOverlaySlideBody(pg, allQuests);
    });
  }

  // ===== Campaign Supply Crate Modal & Solo Boons =====
  function buildSupplyDraftChoices() {
    const lib = typeof CARD_LIBRARY !== 'undefined' ? CARD_LIBRARY : {};
    const curStats = typeof stats !== 'undefined' ? stats : {};
    const unlockedIds = typeof global.unlockedCardIds === 'function'
      ? global.unlockedCardIds({ kills: curStats.kills || 0, correct: curStats.correct || 0, bosses: 0 })
      : Object.keys(lib);
    const pool = unlockedIds.filter((id) => lib[id] && !lib[id].exclusiveActive);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  function renderSupplyCrateModal() {
    const overlay = document.getElementById('supplyCrateOverlay');
    if (!overlay) return;
    const crates = store.supplyCrates || 0;
    const h = typeof hero !== 'undefined' ? hero : { hp: 100, maxHp: 100, mana: 100, maxMana: 100, ultCharge: 0, focusRelicCharges: 0 };
    const eligible = isSoloCampaignCrateEligible();

    let bodyHtml = '';
    if (!eligible) {
      bodyHtml = `<p class="crate-modal-empty">Campaign Supply Crates can only be redeemed during an active Solo Campaign run (outside battle questions or 1v1 duels).</p>`;
    } else if (crates <= 0) {
      bodyHtml = `<p class="crate-modal-empty">No Supply Crates remaining. Complete and claim any Quest to earn +1 Crate (and +1 Bonus Crate for 3/3 Daily Adaptive Quests)!</p>`;
    } else if (Array.isArray(crateDraftChoices) && crateDraftChoices.length) {
      const lib = typeof CARD_LIBRARY !== 'undefined' ? CARD_LIBRARY : {};
      const cardsHtml = crateDraftChoices.map((cardId) => {
        const card = lib[cardId];
        if (!card) return '';
        const role = typeof global.getCardRoleMeta === 'function' ? global.getCardRoleMeta(card) : { tone: 'offense', label: 'CARD' };
        const costLabel = typeof global.cardCostLabel === 'function' ? global.cardCostLabel(card, h) : `${card.cost || 0} MP`;
        const desc = typeof global.describeCard === 'function' ? global.describeCard(card, h) : card.text;
        return `<button type="button" class="crate-draft-card card-tone-${esc(role.tone)}" data-crate-pick-card="${esc(cardId)}">
          <div class="crate-draft-head">
            <span class="crate-draft-role">${esc(role.label)}</span>
            <span class="crate-draft-cost">${esc(costLabel)}</span>
          </div>
          <strong>${esc(card.name)}</strong>
          <small>${esc(desc)}</small>
        </button>`;
      }).join('');
      bodyHtml = `<div class="crate-draft-headbar">
        <strong>Choose 1 Bonus Card to Add to Your Solo Deck</strong>
        <button type="button" class="quest-nav-btn" data-crate-draft-cancel>← Back to Boons</button>
      </div>
      <div class="crate-draft-grid">${cardsHtml}</div>`;
    } else {
      const inBattle = typeof mode !== 'undefined' && mode === 'battle';
      bodyHtml = `<div class="crate-boon-grid">
        <button type="button" class="crate-boon-card is-vitality" data-crate-boon="vitality">
          <span class="crate-boon-tag">RECOVERY BOON</span>
          <strong>Vitality Cell (+25 HP / +25 MP)</strong>
          <p>Immediately restore +25 HP (${h.hp}/${h.maxHp}) and +25 MP (${h.mana}/${h.maxMana}) during this run.</p>
          <em>Consume 1 Crate →</em>
        </button>
        <button type="button" class="crate-boon-card is-cache" data-crate-boon="draft">
          <span class="crate-boon-tag">DECK EXPANSION</span>
          <strong>Tactical Cache (Bonus Card Draft)</strong>
          <p>Draft 1 free card from 3 unlocked combat cards directly into your deck for this Solo Run.</p>
          <em>Consume 1 Crate →</em>
        </button>
        <button type="button" class="crate-boon-card is-relic" data-crate-boon="relic">
          <span class="crate-boon-tag">EXCLUSIVE CHARGE</span>
          <strong>Focus Relic (+1/5 Exclusive Charge)</strong>
          <p>${inBattle ? 'Gain +1 Exclusive Skill Charge right now in battle (up to 5/5)!' : 'Arm a Relic so your next Solo Battle starts with 1/5 Exclusive Skill charge.'}</p>
          <em>Consume 1 Crate →</em>
        </button>
      </div>`;
    }

    overlay.innerHTML = `<div class="supply-crate-shell" role="dialog" aria-modal="true" aria-labelledby="supplyCrateTitle">
      <header class="supply-crate-head">
        <div>
          <span class="eyebrow">SOLO CAMPAIGN LOGISTICS // SUPPLY DROP</span>
          <h2 id="supplyCrateTitle">Campaign Supply Crates (${crates} Available)</h2>
        </div>
        <button type="button" class="quest-close-btn" id="closeSupplyCrateBtn">Close · Esc</button>
      </header>
      ${crateMessage ? `<div class="crate-feedback-banner" role="status">${esc(crateMessage)}</div>` : ''}
      <div class="supply-crate-body">${bodyHtml}</div>
    </div>`;
  }

  function openSupplyCrateModal() {
    ensureDomEventsBound();
    const overlay = document.getElementById('supplyCrateOverlay');
    if (!overlay) return;
    if (overlayOpen) closeOverlay();
    crateModalOpen = true;
    crateDraftChoices = null;
    crateMessage = '';
    crateReturnFocusEl = document.activeElement;
    if (typeof keys !== 'undefined') {
      if (keys.a) keys.a.pressed = false;
      if (keys.d) keys.d.pressed = false;
    }
    renderSupplyCrateModal();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('closeSupplyCrateBtn')?.focus();
  }

  function closeSupplyCrateModal() {
    const overlay = document.getElementById('supplyCrateOverlay');
    if (!overlay || !crateModalOpen) return;
    crateModalOpen = false;
    crateDraftChoices = null;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    if (crateReturnFocusEl && typeof crateReturnFocusEl.focus === 'function') {
      try { crateReturnFocusEl.focus(); } catch {}
    }
    crateReturnFocusEl = null;
  }

  function redeemSupplyCrateBoon(boonType, cardId = '') {
    if (!isSoloCampaignCrateEligible() || (store.supplyCrates || 0) <= 0) return false;
    const h = typeof hero !== 'undefined' ? hero : null;
    if (!h) return false;
    const curMode = typeof mode !== 'undefined' ? mode : 'menu';
    const curBattle = typeof battle !== 'undefined' ? battle : null;
    const curSfx = typeof Sound !== 'undefined' ? Sound : null;

    if (boonType === 'vitality') {
      store.supplyCrates -= 1;
      const beforeHp = h.hp || 0;
      const beforeMp = h.mana || 0;
      h.hp = Math.min(h.maxHp || 100, beforeHp + 25);
      h.mana = Math.min(h.maxMana || 100, beforeMp + 25);
      crateMessage = `Vitality Cell used: +${h.hp - beforeHp} HP, +${h.mana - beforeMp} MP restored!`;
      if (typeof global.popup === 'function') {
        global.popup('hero', '+25 HP/+25 MP', '#74e8a6');
      }
      if (curMode === 'battle' && curBattle) {
        curBattle.log = crateMessage;
        if (typeof global.renderBattle === 'function') global.renderBattle();
      }
      curSfx?.play?.('heal');
    } else if (boonType === 'draft' && !cardId) {
      crateDraftChoices = buildSupplyDraftChoices();
      crateMessage = '';
      renderSupplyCrateModal();
      return true;
    } else if (boonType === 'pick_card' && cardId) {
      const lib = typeof CARD_LIBRARY !== 'undefined' ? CARD_LIBRARY : {};
      if (!lib[cardId]) return false;
      store.supplyCrates -= 1;
      if (typeof runDeck !== 'undefined' && Array.isArray(runDeck)) {
        runDeck.push(cardId);
      }
      if (curBattle && Array.isArray(curBattle.drawPile)) {
        curBattle.drawPile.push(cardId);
      }
      if (typeof stats !== 'undefined') {
        stats.cardsTaken = (stats.cardsTaken || 0) + 1;
      }
      crateDraftChoices = null;
      crateMessage = `Tactical Cache: Added ${lib[cardId].name} to your deck!`;
      if (curMode === 'battle' && curBattle) {
        curBattle.log = crateMessage;
        if (typeof global.renderBattle === 'function') global.renderBattle();
      }
      curSfx?.play?.('unlock');
    } else if (boonType === 'relic') {
      store.supplyCrates -= 1;
      if (curMode === 'battle' && (h.ultCharge || 0) < 5) {
        h.ultCharge = Math.min(5, (h.ultCharge || 0) + 1);
        crateMessage = `Focus Relic surged: Exclusive Charge is now ${h.ultCharge}/5!`;
        if (typeof global.popup === 'function') global.popup('hero', 'FOCUS 1/5 ★', '#ffe07a');
        if (curBattle) curBattle.log = crateMessage;
        if (typeof global.renderBattle === 'function') global.renderBattle();
      } else {
        h.focusRelicCharges = (h.focusRelicCharges || 0) + 1;
        crateMessage = `Focus Relic armed (${h.focusRelicCharges} queued): Your next Solo Battle starts with 1/5 Exclusive Charge!`;
      }
      curSfx?.play?.('unlock');
    } else {
      return false;
    }

    if (typeof global.saveCurrentRunSlot === 'function') global.saveCurrentRunSlot();
    if (typeof global.renderHud === 'function') global.renderHud();
    syncAllUi();
    if (crateModalOpen) renderSupplyCrateModal();
    return true;
  }

  function openOverlay(pageIndex = null) {
    ensureDomEventsBound();
    const appEl = document.getElementById('app');
    const overlay = document.getElementById('questOverlay');
    if (!appEl || appEl.hidden || !overlay) return;
    if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive) return;

    if (overlayOpen && pageIndex === null) {
      closeOverlay();
      return;
    }
    if (crateModalOpen) closeSupplyCrateModal();
    if (typeof global.hideUiHoverBubble === 'function') global.hideUiHoverBubble();
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen && typeof global.closeWorldMap === 'function') {
      global.closeWorldMap();
    }
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen && typeof global.closeSkillTree === 'function') {
      global.closeSkillTree();
    }
    if (pageIndex !== null) {
      overlayPage = Math.max(0, Math.min(OVERLAY_PAGES.length - 1, Number(pageIndex) || 0));
    }
    overlayOpen = true;
    returnFocusEl = document.activeElement;
    if (typeof keys !== 'undefined') {
      if (keys.a) keys.a.pressed = false;
      if (keys.d) keys.d.pressed = false;
    }
    evaluatePrestigeTitles({ silent: true });
    renderOverlay();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('closeQuestOverlayBtn')?.focus();
  }

  function closeOverlay() {
    const overlay = document.getElementById('questOverlay');
    if (!overlay || !overlayOpen) return;
    overlayOpen = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
      try { returnFocusEl.focus(); } catch {}
    }
    returnFocusEl = null;
  }

  function ensureDomEventsBound() {
    if (eventsBound) return;
    eventsBound = true;

    document.addEventListener('click', (event) => {
      const claimBtn = event.target.closest('[data-quest-claim]');
      if (claimBtn) {
        claimQuest(claimBtn.dataset.questClaim);
        return;
      }
      if (event.target.closest('[data-quest-reroll-weak]')) {
        rerollWeakTopic();
        return;
      }
      const weeklyRefreshBtn = event.target.closest('[data-quest-weekly-refresh]');
      if (weeklyRefreshBtn) {
        refreshWeeklyPage(weeklyRefreshBtn.dataset.questWeeklyRefresh);
        return;
      }
      const equipBtn = event.target.closest('[data-equip-title]');
      if (equipBtn) {
        equipTitle(equipBtn.dataset.equipTitle);
        return;
      }
      if (event.target.closest('[data-open-supply-crate]')) {
        openSupplyCrateModal();
        return;
      }
      const boonBtn = event.target.closest('[data-crate-boon]');
      if (boonBtn) {
        redeemSupplyCrateBoon(boonBtn.dataset.crateBoon);
        return;
      }
      const pickCardBtn = event.target.closest('[data-crate-pick-card]');
      if (pickCardBtn) {
        redeemSupplyCrateBoon('pick_card', pickCardBtn.dataset.cratePickCard);
        return;
      }
      if (event.target.closest('[data-crate-draft-cancel]')) {
        crateDraftChoices = null;
        renderSupplyCrateModal();
        return;
      }
      if (event.target.closest('#closeSupplyCrateBtn') || (crateModalOpen && event.target.id === 'supplyCrateOverlay')) {
        closeSupplyCrateModal();
        return;
      }
      const openBtn = event.target.closest('[data-open-quests-overlay]');
      if (openBtn) {
        openOverlay(hubPage);
        return;
      }
      if (event.target.closest('[data-open-skill-tree]')) {
        if (overlayOpen) closeOverlay();
        global.openSkillTree?.();
        return;
      }
      const hubTab = event.target.closest('[data-quest-hub-page]');
      if (hubTab) {
        setHubPage(Number(hubTab.dataset.questHubPage));
        return;
      }
      const hubStep = event.target.closest('[data-quest-hub-step]');
      if (hubStep) {
        stepHubPage(Number(hubStep.dataset.questHubStep) || 1);
        return;
      }
      if (event.target.closest('[data-quest-hub-toggle]')) {
        toggleHubAutoSwipe();
        return;
      }
      const ovTab = event.target.closest('[data-quest-overlay-page]');
      if (ovTab) {
        overlayPage = Math.max(0, Math.min(OVERLAY_PAGES.length - 1, Number(ovTab.dataset.questOverlayPage) || 0));
        renderOverlay({ slideOnly: true });
        return;
      }
      const ovStep = event.target.closest('[data-quest-overlay-step]');
      if (ovStep) {
        overlayPage = (overlayPage + (Number(ovStep.dataset.questOverlayStep) || 1) + OVERLAY_PAGES.length) % OVERLAY_PAGES.length;
        renderOverlay({ slideOnly: true });
        return;
      }
      if (event.target.closest('#closeQuestOverlayBtn')) {
        closeOverlay();
        return;
      }
      if (overlayOpen && event.target.id === 'questOverlay') {
        closeOverlay();
      }
    });

    const aside = document.getElementById('dashboardAside');
    if (aside) {
      let wheelIdleTimer = 0;
      aside.addEventListener('mouseenter', () => { hubHovered = true; });
      aside.addEventListener('mouseleave', () => {
        if (wheelIdleTimer) {
          global.clearTimeout(wheelIdleTimer);
          wheelIdleTimer = 0;
        }
        hubHovered = false;
      });
      aside.addEventListener('wheel', () => {
        hubHovered = true;
        if (wheelIdleTimer) global.clearTimeout(wheelIdleTimer);
        wheelIdleTimer = global.setTimeout(() => {
          wheelIdleTimer = 0;
          if (!aside.matches(':hover') && !aside.contains(document.activeElement)) {
            hubHovered = false;
          }
        }, 1200);
      }, { passive: true });
      aside.addEventListener('focusin', () => { hubHovered = true; });
      aside.addEventListener('focusout', () => {
        global.setTimeout(() => {
          hubHovered = Boolean(aside.matches(':hover') || aside.contains(document.activeElement));
        }, 40);
      });
    }
  }

  function resetProfileData() {
    store = defaultState();
    ensureWeakTarget();
    syncAllUi();
  }

  // Initialize default guest/local state immediately
  load('');

  global.ByteboundQuests = {
    PAGES: QUEST_PAGES,
    OVERLAY_PAGES,
    TITLES: PRESTIGE_TITLES,
    selectProfile: (profileId) => { load(profileId); syncAllUi(); },
    resetProfileData,
    getState: () => store,
    getQuests: buildQuestList,
    getClaimableCount,
    claimQuest,
    rerollWeakTopic,
    refreshWeeklyPage,
    canRefreshWeeklyPage,
    getWeekWindow,
    getDailyResetCountdown,
    getWeeklyResetCountdown,
    getEquippedTitleId: () => store.equippedTitle || '',
    getUnlockedTitleIds: () => Object.keys(store.unlockedTitles || {}),
    getTitleById: (id) => TITLE_BY_ID[id] || null,
    getPlayerTitle,
    equipTitle,
    renderTitleBadgeHtml,
    evaluatePrestigeTitles,
    getSupplyCratesCount: () => store.supplyCrates || 0,
    openSupplyCrateModal,
    closeSupplyCrateModal,
    isCrateModalOpen: () => crateModalOpen,
    redeemSupplyCrateBoon,
    syncCrateHudButton,
    onQuestionAnswered,
    onExclusiveChargeReached,
    onPerfectRemedialSurge,
    onBattleWon,
    onRoomsUpdated,
    onLeaderboardRankChecked,
    onAchievementsSynced,
    onRunReset,
    onPvpMatchFinished,
    renderHubWidget,
    syncHubWidgetDom,
    syncHudBadgeDot,
    startHubAutoSwipe,
    stopHubAutoSwipe,
    toggleHubAutoSwipe,
    stepHubPage,
    setHubPage,
    openOverlay,
    closeOverlay,
    isOpen: () => overlayOpen,
    setOverlayPage: (idx) => {
      overlayPage = Math.max(0, Math.min(OVERLAY_PAGES.length - 1, Number(idx) || 0));
      if (overlayOpen) renderOverlay({ slideOnly: true });
    },
    renderOverlay,
  };
})(window);
