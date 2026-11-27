// ============================================================================
// BYTEBOUND FIRST-TIME TUTORIAL & CONTEXTUAL GUIDED TOUR SYSTEM
// - Short, focused 1-2 sentence lessons teaching one feature or action at a time
// - Independent Page Tours (Quest Hub, Topic Selection, Topic Drill, Tracker,
//   Achievements)
// - Interactive Gameplay Tutorials (Core Controls, HUD, Battle Arena,
//   Cards & Leveling, Skill-Point & Skill Tree Guide, World Map)
// - Per-player localStorage persistence, Settings replay, and Codex Laureate
//   tutorial-completion achievement tracking
// ============================================================================
(function () {
  'use strict';

  const TUTORIAL_STORAGE_KEY = 'bytebound-tutorials-v1';

  const TUTORIAL_CATALOG = [
    {
      id: 'tour_sidebar_nav',
      title: 'Sidebar Navigation Tour',
      shortTitle: 'Navigation',
      category: 'Page Tour',
      summary: 'Opening the sliding sidebar menu and navigating across Quest Hub, Topic Drill, Tracker, Leaderboards, Achievements, and Settings.',
    },
    {
      id: 'tour_quest',
      title: 'Quest Hub Tour',
      shortTitle: 'Quest Hub',
      category: 'Page Tour',
      summary: 'Start Game campaign selection, 1v1 Multiplayer, Practice Mode, the Quest Board Carousel, Supply Crates, and Prestige Titles.',
    },
    {
      id: 'tour_practice_menu',
      title: 'Topic Selection Tour',
      shortTitle: 'Topic Select',
      category: 'Page Tour',
      summary: 'Discipline & difficulty filters across 35 IT topics, Weak Topic Spotlight, Year-locked courses, and Missed Review.',
    },
    {
      id: 'tour_practice_quiz',
      title: 'Topic Drill Tour',
      shortTitle: 'Topic Drill',
      category: 'Page Tour',
      summary: 'Study questions, numbered answers (1–4), explanations, review queue, and completion.',
    },
    {
      id: 'tour_tracker',
      title: 'Learning Tracker Tour',
      shortTitle: 'Tracker',
      category: 'Page Tour',
      summary: '7-discipline Capability Radar, Pre vs. Post Diagnostic gains, 35-topic mastery bars, and CSV export.',
    },
    {
      id: 'tour_leaderboards',
      title: 'Leaderboards Tour',
      shortTitle: 'Leaderboards',
      category: 'Page Tour',
      summary: 'Weekly & All-Time rankings for Arcade Campaign and 1v1 Duels, Prestige Title badges, podium, and standings table.',
    },
    {
      id: 'tour_rewards',
      title: 'Achievements Tour',
      shortTitle: 'Achievements',
      category: 'Page Tour',
      summary: 'Equipable Prestige Titles, Campaign Supply Crates, achievement milestones, Card Collection, and Codex Laureate.',
    },
    {
      id: 'tour_settings',
      title: 'Settings Tour',
      shortTitle: 'Settings',
      category: 'Page Tour',
      summary: 'Appearance, Reduced Motion, Sound & Volume, Controls reference, Academic Year status, and Player Profile.',
    },
    {
      id: 'game_core',
      title: 'Core Controls Tutorial',
      shortTitle: 'Core Controls',
      category: 'Gameplay Lesson',
      summary: 'Interactive A/D, W, and Up exploration lessons followed by approaching an enemy.',
    },
    {
      id: 'game_battle',
      title: 'Battle Arena Tutorial',
      shortTitle: 'Battle Arena',
      category: 'Gameplay Lesson',
      summary: 'Action cards, HP vs. MP readability, Blood-Sacrifice Hints (-50% HP), Exclusives, feedback, and continuing.',
    },
    {
      id: 'game_hud',
      title: 'In-Game HUD Tutorial',
      shortTitle: 'Game HUD',
      category: 'Gameplay Lesson',
      summary: 'Menu/Fullscreen controls, World Map [M], Quests [O], Supply Crates, Skill Tree [U], and Help Guide.',
    },
    {
      id: 'game_card_reward',
      title: 'Card Reward Tutorial',
      shortTitle: 'Card Reward',
      category: 'Reward Lesson',
      summary: 'Reviewing the post-battle card reward panel and choosing a new deck card.',
    },
    {
      id: 'game_level_up',
      title: 'Level-Up Selection Tutorial',
      shortTitle: 'Level Up',
      category: 'Reward Lesson',
      summary: 'Reviewing the Level-Up reward panel and choosing a permanent run buff.',
    },
    {
      id: 'game_skill_tree',
      title: 'Skill Tree First-Time Tutorial',
      shortTitle: 'Skill Tree',
      category: 'Overlay Lesson',
      summary: 'First skill-point notification, HUD Skill Tree control, and 7-discipline radial Skill Tree overview.',
    },
    {
      id: 'game_world_map',
      title: 'World Map Tutorial',
      shortTitle: 'World Map',
      category: 'Overlay Lesson',
      summary: 'Inspecting rooms, pixel-locked gates, on-foot navigation, loop resets, and reinforced Loop II+ foes.',
    },
    {
      id: 'guide_skill_tree',
      title: 'Skill Tree Guide',
      shortTitle: 'Skill Tree Guide',
      category: 'Overlay Guide',
      summary: 'Skill points, 7 discipline branches, year locks, Exclusive Actives, and closing the Skill Tree.',
    },
    {
      id: 'guide_world_map',
      title: 'World Map Guide',
      shortTitle: 'Map Guide',
      category: 'Overlay Guide',
      summary: 'Room status, pixel locks, on-foot route inspection, Loop II+ map resets, and pan/zoom controls.',
    },
  ];

  const REQUIRED_TUTORIAL_IDS = TUTORIAL_CATALOG.map((t) => t.id);

  const FULL_PAGE_TOUR_SEQUENCE = [
    'tour_sidebar_nav',
    'tour_quest',
    'tour_practice_menu',
    'tour_tracker',
    'tour_leaderboards',
    'tour_rewards',
    'tour_settings',
  ];

  const TOUR_SEQUENCE_VIEW_MAP = {
    tour_sidebar_nav: 'quest',
    tour_quest: 'quest',
    tour_practice_menu: 'practice',
    tour_tracker: 'tracker',
    tour_leaderboards: 'leaderboards',
    tour_rewards: 'rewards',
    tour_settings: 'settings',
  };

  const FULL_GAME_GUIDE_SEQUENCE = [
    'game_core',
    'game_battle',
    'game_remedial_drill',
    'game_hud',
    'game_card_reward',
    'game_level_up',
    'game_skill_tree',
    'game_world_map',
  ];

  // Skipping exploration controls (game_core) only skips exploration itself—never pre-skip
  // the first battle encounter tutorial (game_battle) or reward/level-up tutorials.
  const SKIPPABLE_CORE_GAME_SEQUENCE = [
    'game_core',
  ];

  // --- Per-player storage helpers ---
  function getActiveProfileId() {
    const raw = (typeof activePlayerName === 'string' && activePlayerName)
      ? activePlayerName
      : (typeof window.activePlayerName === 'string' ? window.activePlayerName : '');
    return raw.trim().toLowerCase();
  }

  function getStorageKey(profileId = getActiveProfileId()) {
    if (!profileId) return '';
    return `${TUTORIAL_STORAGE_KEY}:${encodeURIComponent(profileId)}`;
  }

  function loadStore(profileId = getActiveProfileId()) {
    const key = getStorageKey(profileId);
    if (!key) return { completed: {}, progress: {}, spGuideTriggered: false, postResetGameSequence: false };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { completed: {}, progress: {}, spGuideTriggered: false, postResetGameSequence: false };
      const parsed = JSON.parse(raw);
      return {
        completed: (parsed && typeof parsed.completed === 'object' && parsed.completed) ? parsed.completed : {},
        progress: (parsed && typeof parsed.progress === 'object' && parsed.progress) ? parsed.progress : {},
        spGuideTriggered: Boolean(parsed?.spGuideTriggered),
        postResetGameSequence: Boolean(parsed?.postResetGameSequence),
      };
    } catch {
      return { completed: {}, progress: {}, spGuideTriggered: false, postResetGameSequence: false };
    }
  }

  function saveStore(store, profileId = getActiveProfileId()) {
    const key = getStorageKey(profileId);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        completed: store.completed || {},
        progress: store.progress || {},
        spGuideTriggered: Boolean(store.spGuideTriggered),
        postResetGameSequence: Boolean(store.postResetGameSequence),
      }));
    } catch {}
  }

  function resetPlayerTutorials(profileId = getActiveProfileId()) {
    const normalized = String(profileId || getActiveProfileId()).trim().toLowerCase();
    if (!normalized) return false;
    const isCurrent = normalized === getActiveProfileId();
    if (isCurrent) {
      state.pendingSkillPointAwards = [];
      state.seenSkillPointAwardIds = new Set();
      state.activeSkillPointAward = null;
      state.pendingRemedialTutorial = false;
      if (state.spPopupTimer) {
        window.clearTimeout(state.spPopupTimer);
        state.spPopupTimer = 0;
      }
      state.sequence = null;
      state.activeIsReplay = false;
      state.suppressAutoTourView = 'settings';
      stopActiveTutorial({ restoreFocus: false });
    }
    const key = getStorageKey(normalized);
    if (key) {
      try { localStorage.removeItem(key); } catch {}
    }
    saveStore({
      completed: {},
      progress: {},
      spGuideTriggered: false,
      postResetGameSequence: true,
    }, normalized);
    if (isCurrent && typeof refreshAchievements === 'function') {
      try { refreshAchievements({ silent: true }); } catch {}
    }
    return true;
  }

  function getTutorialStatus(tutorialId) {
    const store = loadStore();
    return store.completed[tutorialId] || null; // 'completed' | 'skipped' | null
  }

  function isTutorialFinished(tutorialId) {
    return Boolean(getTutorialStatus(tutorialId));
  }

  // Rule: Only tutorials completed to the end ('completed') count toward Codex Laureate.
  // Skipped tutorials ('skipped') do not auto-repeat, and count once replayed and completed.
  function getCompletedTutorialCount() {
    const store = loadStore();
    let count = 0;
    for (const id of REQUIRED_TUTORIAL_IDS) {
      if (store.completed[id] === 'completed') count++;
    }
    return count;
  }

  function setTutorialStatus(tutorialId, status) {
    const store = loadStore();
    if (status) {
      // Never downgrade an already 'completed' tutorial to 'skipped' during a casual replay
      if (status === 'skipped' && store.completed[tutorialId] === 'completed') {
        delete store.progress[tutorialId];
      } else {
        store.completed[tutorialId] = status;
        delete store.progress[tutorialId];
      }
    } else {
      delete store.completed[tutorialId];
      delete store.progress[tutorialId];
    }
    saveStore(store);
    if (typeof refreshAchievements === 'function') {
      try { refreshAchievements(); } catch {}
    }
    if (typeof window.ByteboundQuests?.evaluatePrestigeTitles === 'function') {
      try { window.ByteboundQuests.evaluatePrestigeTitles(); } catch {}
    }
  }

  function saveStepProgress(tutorialId, stepId) {
    if (tutorialId === 'game_sp_earned') return;
    const store = loadStore();
    if (store.completed[tutorialId]) return;
    store.progress[tutorialId] = { stepId, updatedAt: Date.now() };
    saveStore(store);
  }

  function getSavedStepId(tutorialId) {
    const store = loadStore();
    return store.progress?.[tutorialId]?.stepId || null;
  }

  // --- Helper queries ---
  function isAppReadyWithProfile() {
    const appEl = document.getElementById('app');
    return Boolean(appEl && !appEl.hidden && getActiveProfileId());
  }

  function isMultiplayer() {
    return typeof multiplayerMatchActive !== 'undefined' && Boolean(multiplayerMatchActive);
  }

  function isOverlayModalBlockingPageTours() {
    const runModal = document.getElementById('runSavesOverlay');
    const resetModal = document.getElementById('resetConfirmOverlay');
    const goModal = document.getElementById('gameOverOverlay');
    return Boolean(
      (typeof skillTreeOpen !== 'undefined' && skillTreeOpen) ||
      (typeof worldMapOpen !== 'undefined' && worldMapOpen) ||
      window.mpUI?.isOpen ||
      (runModal && !runModal.hidden) ||
      (resetModal && !resetModal.hidden) ||
      (goModal && !goModal.hidden)
    );
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden || el.closest('[hidden]')) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function resolveFirstVisible(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const item of list) {
      if (!item) continue;
      if (typeof item === 'function') {
        const res = item();
        if (res && isElementVisible(res)) return res;
        continue;
      }
      if (item instanceof Element) {
        if (isElementVisible(item)) return item;
        continue;
      }
      if (typeof item === 'string') {
        const el = document.querySelector(item);
        if (el && isElementVisible(el)) return el;
      }
    }
    return null;
  }

  function getBubbleAttrDescription(selector, fallbackTitle, fallbackDesc) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    return {
      title: el?.dataset?.bubbleTitle || fallbackTitle,
      desc: el?.dataset?.bubbleDesc || fallbackDesc,
    };
  }

  function isTouchControlsVisible() {
    return Boolean(resolveFirstVisible('.touch-dir[data-k="d"]'));
  }

  function getCardChoiceButton(actionName, index) {
    const btn = document.querySelector(`#panel .choices.card-pick button[data-act="${actionName}"][data-val="${index}"]`);
    return (btn && isElementVisible(btn)) ? btn : null;
  }

  function resolveStepMultiTargets(step) {
    if (!step || !step.multiTargetSelector) return [];
    const selector = typeof step.multiTargetSelector === 'function'
      ? step.multiTargetSelector()
      : step.multiTargetSelector;
    if (!selector) return [];
    return [...document.querySelectorAll(selector)].filter((el) => isElementVisible(el));
  }

  function findFirstEligibleSkillNode() {
    if (typeof SKILL_TREE_KEYS === 'undefined' || typeof skillPointsAvailable !== 'function') return null;
    for (const key of SKILL_TREE_KEYS) {
      if (skillPointsAvailable(key) > 0) {
        const node = document.querySelector(`#skillMapWorld .skill-map-node.tree-${key}.is-can-upgrade`) ||
          document.querySelector(`#skillMapWorld .skill-map-node.tree-${key}`);
        if (node && isElementVisible(node)) return node;
      }
    }
    return document.querySelector('#skillMapWorld .skill-map-node.is-can-upgrade') ||
      document.querySelector('#skillMapWorld .skill-map-node');
  }

  // --- Definitions of all Page Tours and Interactive Gameplay Tutorials ---
  // Each step bubble uses 1-2 short, focused sentences teaching one single thing.
  function buildTutorialSteps(tutorialId) {
    switch (tutorialId) {
      case 'tour_sidebar_nav': {
        return [
          {
            id: 'nav_open_burger',
            tag: 'NAVIGATION',
            title: 'Open the Sidebar Menu',
            desc: 'Bytebound’s sidebar holds all six main pages. Open the menu to slide it into view.',
            actionPrompt: 'Action required: Click or tap the highlighted menu button, or press Enter or Space, to open the sidebar.',
            actionRequired: true,
            target: ['#navToggleButton'],
            allowClickSelector: '#navToggleButton',
            allowedKeys: ['enter', ' ', 'space'],
            preferPlacement: 'bottom',
            condition: () => Boolean(resolveFirstVisible('#navToggleButton')) && !(typeof navMenuOpen !== 'undefined' && navMenuOpen),
          },
          {
            id: 'nav_page_quest',
            tag: 'SIDEBAR · 01',
            title: '01 · Quest Hub',
            desc: 'Launch Campaign runs, 1v1 Multiplayer, or Practice Mode, and open the [O] Quest Board, Supply Crates, and Prestige Titles.',
            target: ['#mainSidebar [data-view="quest"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_practice',
            tag: 'SIDEBAR · 02',
            title: '02 · Topic Drill',
            desc: 'Study 35 IT topics across 7 disciplines without combat damage using discipline chips, difficulty filters, Weak Spotlight, and Missed Review.',
            target: ['#mainSidebar [data-view="practice"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_tracker',
            tag: 'SIDEBAR · 03',
            title: '03 · Tracker',
            desc: 'Inspect your 7-axis Capability Radar, Diagnostic Baseline vs. Post-Baseline gains, 35-topic progress, and CSV export.',
            target: ['#mainSidebar [data-view="tracker"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_leaderboards',
            tag: 'SIDEBAR · 04',
            title: '04 · Leaderboards',
            desc: 'Switch between Weekly resets and All-Time standings for Arcade Campaign and 1v1 Duels, featuring earned Prestige Titles.',
            target: ['#mainSidebar [data-view="leaderboards"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_rewards',
            tag: 'SIDEBAR · 05',
            title: '05 · Achievements',
            desc: 'Equip 13 Prestige Titles, claim Supply Crates, track milestones & Codex Laureate progress, and inspect your Card Collection.',
            target: ['#mainSidebar [data-view="rewards"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_settings',
            tag: 'SIDEBAR · 06',
            title: '06 · Settings',
            desc: 'Customize Dark/Light mode, Reduced Motion, audio volumes, keybinds, and your player profile.',
            target: ['#mainSidebar [data-view="settings"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
        ];
      }

      case 'tour_quest': {
        return [
          {
            id: 'quest_start_game',
            tag: 'CAMPAIGN',
            title: 'Start Game & Run Selection',
            desc: 'Select Start game to open your Campaign slots, where you can start a new run or continue a saved adventure.',
            target: ['#startGameButton', '.welcome-actions'],
          },
          {
            id: 'quest_multiplayer',
            tag: 'ONLINE 1V1',
            title: '1v1 Multiplayer',
            desc: 'Challenge another player in a turn-based synchronized duel using identical IT questions.',
            target: ['#multiplayerMenuButton', '.welcome-actions'],
          },
          {
            id: 'quest_practice_mode',
            tag: 'SANDBOX',
            title: 'Practice Mode',
            desc: 'Rehearse combat in a temporary no-save run without affecting your campaign saves or leaderboard.',
            target: ['#practiceModeButton', '.welcome-actions'],
          },
          {
            id: 'quest_difficulty_controls',
            tag: 'QUEST BOARD',
            title: 'Missions, Supply Crates & Controls',
            desc: 'Track rotating Daily Missions, Bounties, and 1v1 Arena trials in the auto-swiping Quest Carousel (or press O anytime) to earn Campaign Supply Crates, Wildcard SP, and Prestige Titles.',
            target: ['#questHubCarousel', '.welcome-insights', '.difficulty-insight'],
            condition: () => Boolean(resolveFirstVisible('#questHubCarousel') || resolveFirstVisible('.welcome-insights')),
          },
        ];
      }

      case 'tour_practice_menu': {
        return [
          {
            id: 'p_menu_difficulty',
            tag: 'TOPIC SELECTION',
            title: 'Difficulty & 7-Discipline Filters',
            desc: 'Filter questions by Adaptive tier, All 12 (Mixed), or Easy/Medium/Hard, then narrow the 35 topics using the 7 discipline chips (Software Engineering unlocks in 2nd Year; HCI in 3rd Year).',
            target: ['#dashboardAside .practice-controls', '#dashboardAside'],
          },
          {
            id: 'p_menu_mixed_review',
            tag: 'TOPIC SELECTION',
            title: 'All-Topics Drill & Missed Review',
            desc: 'Start an All-Topics Drill across every subject, or use Review Missed to retry questions you missed in earlier battles or drills.',
            target: ['#dashboardAside .practice-start', '#dashboardAside'],
          },
          {
            id: 'p_menu_weak_spotlight',
            tag: 'TOPIC SELECTION',
            title: 'Weakest Topic Callout',
            desc: 'When an attempted topic is below 75% accuracy, click "Practice Now" here to focus directly on that topic.',
            target: ['#dashboardAside .practice-weak-banner'],
            condition: () => Boolean(resolveFirstVisible('#dashboardAside .practice-weak-banner')),
          },
          {
            id: 'p_menu_topics_status',
            tag: 'TOPIC SELECTION',
            title: 'Topic Status & Accuracy',
            desc: 'Each row clearly shows how many questions are in the set, your completion status, and your accuracy. Completing all questions in a set marks it ✓ Completed.',
            target: ['#dashboardAside .practice-category .practice-topic', '#dashboardAside .practice-categories'],
          },
          {
            id: 'p_menu_start_action',
            tag: 'ACTION STEP',
            title: 'Start a Topic Drill',
            desc: 'Topic Drills let you study and earn Skill Points without taking combat damage.',
            actionPrompt: 'Action required: Click the highlighted Start (or Start all-topics drill) button to begin.',
            actionRequired: true,
            target: [
              '#dashboardAside .practice-category .practice-topic .practice-go:not(:disabled)',
              '#dashboardAside .practice-start [data-practice="start"]:not(:disabled)',
            ],
            allowClickSelector: '[data-practice="start"]:not(:disabled)',
          },
        ];
      }

      case 'tour_practice_quiz': {
        return [
          {
            id: 'p_quiz_question',
            tag: 'TOPIC DRILL',
            title: 'Question & Topic Tag',
            desc: 'Read the question and its subject and difficulty tag above. Every 5 correct answers in a subject earns 1 Skill Point.',
            target: ['#dashboardAside .question', '#dashboardAside'],
            preferPlacement: 'bottom',
          },
          {
            id: 'p_quiz_answer',
            tag: 'ACTION STEP',
            title: 'Numbered Answers (1–4)',
            desc: 'Pick one of the four numbered answer buttons below, or press keys 1–4 on your keyboard.',
            actionPrompt: 'Action required: Click an answer button (1–4) or press 1–4 on your keyboard.',
            actionRequired: true,
            target: ['#dashboardAside .practice-choices', '#dashboardAside [data-practice="answer"]'],
            unionWith: '#dashboardAside .question',
            allowClickSelector: '[data-practice="answer"]:not(:disabled)',
            allowedKeys: ['1', '2', '3', '4'],
            preferPlacement: 'bottom',
          },
          {
            id: 'p_quiz_feedback',
            tag: 'TOPIC DRILL',
            title: 'Answer Feedback & Missed Queue',
            desc: 'Check the explanation to see why the answer is correct. Missed questions automatically enter your Missed Review Queue for later practice.',
            target: ['#dashboardAside .practice-feedback', '#dashboardAside'],
            preferPlacement: 'top',
          },
          {
            id: 'p_quiz_next',
            tag: 'ACTION STEP',
            title: 'Next Question & Results',
            desc: 'Advance to the next question in this set. Finishing every question opens your session results summary.',
            actionPrompt: 'Action required: Click "Next question" (or "View Results") or press Enter.',
            actionRequired: true,
            target: ['#dashboardAside [data-practice="next"]', '#dashboardAside .practice-feedback'],
            allowClickSelector: '[data-practice="next"]',
            allowedKeys: ['enter'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'tour_practice_done': {
        return [
          {
            id: 'p_done_summary',
            tag: 'DRILL COMPLETE',
            title: 'Session Results',
            desc: 'Review your exact session score and set completion here. If you advance to a higher Adaptive tier, you will see a notice that new questions unlocked.',
            target: ['#dashboardAside .practice-done-card', '#dashboardAside'],
          },
          {
            id: 'p_done_actions',
            tag: 'DRILL COMPLETE',
            title: 'Retry or Return',
            desc: 'Click "Retry This Set" to practice these questions again, or "Back to topics" to pick another subject.',
            target: ['#dashboardAside .practice-done-actions', '#dashboardAside .practice-done-card'],
          },
        ];
      }

      case 'tour_tracker': {
        return [
          {
            id: 'tracker_summary',
            tag: 'LEARNING TRACKER',
            title: 'Overall Learning Metrics',
            desc: 'These cards show your Overall Accuracy, Topics Mastered (80%+ accuracy with at least 4 answers), and Topics Practiced across the curriculum.',
            target: ['#dashboardAside .tracker-summary', '#dashboardAside'],
          },
          {
            id: 'tracker_diagnostic',
            tag: 'LEARNING TRACKER',
            title: 'Starting Score vs. Growth',
            desc: 'Your first 3 answers in any topic capture your starting score. Follow-up practice measures your accuracy improvement over time.',
            target: ['#dashboardAside .tracker-diagnostic-strip', '#dashboardAside'],
          },
          {
            id: 'tracker_radar',
            tag: 'LEARNING TRACKER',
            title: '7-Discipline Capability Radar & Tiers',
            desc: 'The 7-axis radar chart and subject cards track your accuracy and Adaptive tier across Systems, Network & Security, Programming, Database, Discrete Math, Software Engineering (Year 2+), and Web & Mobile.',
            target: ['#dashboardAside .cap-overview-grid', '#dashboardAside .cap-radar-box'],
          },
          {
            id: 'tracker_categories',
            tag: 'LEARNING TRACKER',
            title: 'Per-Topic Progress Bars',
            desc: 'Check each topic’s progress bar and status badge (Mastered, Proficient, Developing, or Needs Focus) to see where to practice next.',
            target: ['#dashboardAside .tracker-categories .tracker-category', '#dashboardAside .tracker-categories'],
          },
          {
            id: 'tracker_export',
            tag: 'LEARNING TRACKER',
            title: 'Export CSV Report',
            desc: 'Click "Export CSV" to download your baseline, post-baseline, and mastery statistics as a spreadsheet.',
            target: ['#dashboardAside [data-export-tracker="csv"]', '#dashboardAside .tracker-diagnostic-actions'],
          },
        ];
      }

      case 'tour_leaderboards': {
        return [
          {
            id: 'lb_modes',
            tag: 'LEADERBOARDS',
            title: 'Weekly vs. All-Time & Ranking Modes',
            desc: 'Switch between Arcade Ranking and 1v1 Competitive, or toggle Weekly (with live reset countdown for the #1 [Apex Sovereign] title) vs. All-Time records.',
            target: ['#dashboardAside .leaderboard-tabs', '#dashboardAside'],
          },
          {
            id: 'lb_refresh',
            tag: 'LEADERBOARDS',
            title: 'Refresh Standings',
            desc: 'Click Refresh anytime to sync the latest Weekly and All-Time leaderboard standings and equipped Prestige Titles.',
            target: ['#dashboardAside [data-leaderboard-refresh]', '#dashboardAside .leaderboard-heading'],
          },
          {
            id: 'lb_standings',
            tag: 'LEADERBOARDS',
            title: 'Top-Three Podium & Prestige Tags',
            desc: 'Top challengers claim the spotlight podium above, showing their equipped Prestige Title badges alongside scores, rooms cleared, and accuracy.',
            target: [
              '#dashboardAside .leaderboard-podium',
              '#dashboardAside .leaderboard-table-wrap',
              '#dashboardAside .leaderboard-message',
              '#dashboardAside',
            ],
          },
        ];
      }

      case 'tour_rewards': {
        return [
          {
            id: 'rewards_tutorial_achievement',
            tag: 'ACHIEVEMENTS & TITLES',
            title: 'Prestige Titles & Codex Laureate',
            desc: () => `Equip unlocked Prestige Titles (such as [Codex Laureate] after completing all ${REQUIRED_TUTORIAL_IDS.length} guided lessons) — equipped tags appear on your profile, Leaderboards, and 1v1 battles.`,
            target: ['#dashboardAside .prestige-titles-panel', '#dashboardAside .achievement-card.is-tutorial-achievement', '#dashboardAside .achievement-section.cat-tutorial'],
          },
          {
            id: 'rewards_categories',
            tag: 'ACHIEVEMENTS',
            title: 'Achievement Categories',
            desc: 'Milestones are grouped into Onboarding, General Campaign, Topic Drill & Rankings, 1v1 Competitive Arena, and Role Skill Paths.',
            target: ['#dashboardAside .achievement-section.cat-general .achievement-section-head', '#dashboardAside .achievement-sections'],
          },
          {
            id: 'rewards_cards',
            tag: 'ACHIEVEMENTS',
            title: 'Progress Meters & Unlock Status',
            desc: 'Each badge shows its goal, live progress bar, and whether it is LOCKED or UNLOCKED.',
            target: ['#dashboardAside .achievement-section.cat-general .achievement-card', '#dashboardAside .achievement-card'],
          },
          {
            id: 'rewards_collection',
            tag: 'CARD REWARDS',
            title: 'Earned Card Collection',
            desc: 'Unlocking combat milestones adds new action cards to your reward pool so you can draft them after winning battles.',
            target: ['#dashboardAside .card-collection', '#dashboardAside'],
          },
        ];
      }

      case 'tour_settings': {
        return [
          {
            id: 'settings_appearance',
            tag: 'SETTINGS',
            title: 'Appearance & Reduced Motion',
            desc: 'Switch between Dark and Light themes or enable Reduce animation & motion for calmer UI transitions.',
            target: ['#dashboardAside .settings-card[aria-label="Appearance settings"]', '#dashboardAside'],
          },
          {
            id: 'settings_sound',
            tag: 'SETTINGS',
            title: 'Sound & Volume',
            desc: 'Toggle audio on or off and adjust Music and Sound Effects volume sliders separately.',
            target: ['#dashboardAside .settings-card[aria-label="Sound settings"]', '#dashboardAside'],
          },
          {
            id: 'settings_controls',
            tag: 'SETTINGS',
            title: 'Controls Guide',
            desc: 'Review keyboard shortcuts for movement, jumping, doors, map, skill tree, and battle actions.',
            target: ['#dashboardAside .settings-card[aria-label="Controls guide"]', '#dashboardAside'],
          },
          {
            id: 'settings_profile',
            tag: 'SETTINGS',
            title: 'Player Profile',
            desc: 'See your active player handle and sync status, switch accounts, or reset your saved progress.',
            target: ['#dashboardAside .settings-card[aria-label="Player profile settings"]', '#dashboardAside'],
          },
        ];
      }

      case 'game_core': {
        return [
          {
            id: 'core_move_lr',
            tag: 'MOVEMENT 1 / 3',
            title: () => isTouchControlsVisible() ? 'Move Left & Right' : 'Move with A / D',
            desc: () => isTouchControlsVisible()
              ? 'Use LEFT and RIGHT to walk across the room.'
              : 'Use A and D (or Left / Right Arrow) to move left and right.',
            actionPrompt: () => isTouchControlsVisible()
              ? 'Action required: Tap LEFT or RIGHT.'
              : 'Action required: Press A or D.',
            actionRequired: true,
            freezeEnemies: true,
            holdEncounter: true,
            noSpotlight: () => !isTouchControlsVisible(),
            target: [
              () => isTouchControlsVisible() ? document.querySelector('.touch-dpad') : null,
              '.preview-frame canvas',
            ],
            allowClickSelector: '.touch-dir[data-k="a"], .touch-dir[data-k="d"]',
            allowedKeys: ['a', 'd', 'arrowleft', 'arrowright'],
            preferPlacement: () => isTouchControlsVisible() ? 'top' : 'bottom',
          },
          {
            id: 'core_jump',
            tag: 'MOVEMENT 2 / 3',
            title: () => isTouchControlsVisible() ? 'Jump' : 'Jump with W',
            desc: () => isTouchControlsVisible()
              ? 'Use JUMP to leap onto higher platforms and clear obstacles.'
              : 'Press W (or Space) to jump onto platforms.',
            actionPrompt: () => isTouchControlsVisible()
              ? 'Action required: Tap JUMP.'
              : 'Action required: Press W or Space.',
            actionRequired: true,
            freezeEnemies: true,
            holdEncounter: true,
            noSpotlight: () => !isTouchControlsVisible(),
            target: [
              () => isTouchControlsVisible() ? document.querySelector('.touch-jump[data-k="w"]') : null,
              '.preview-frame canvas',
            ],
            allowClickSelector: '.touch-jump[data-k="w"]',
            allowedKeys: ['w', 'space', ' '],
            preferPlacement: () => isTouchControlsVisible() ? 'top' : 'bottom',
          },
          {
            id: 'core_door',
            tag: 'MOVEMENT 3 / 3',
            title: () => isTouchControlsVisible() ? 'Enter Doors' : 'Interact with Up Arrow',
            desc: () => isTouchControlsVisible()
              ? 'Stand in front of an unlocked exit and tap DOOR to enter.'
              : 'Press Up Arrow when standing at an unlocked door to enter it.',
            actionPrompt: () => isTouchControlsVisible()
              ? 'Action required: Tap DOOR.'
              : 'Action required: Press Up Arrow.',
            condition: () => typeof doors !== 'undefined' && Array.isArray(doors) && doors.length > 0,
            actionRequired: true,
            freezeEnemies: true,
            holdEncounter: true,
            noSpotlight: () => !isTouchControlsVisible(),
            target: [
              () => isTouchControlsVisible() ? document.querySelector('.touch-door[data-k="up"]') : null,
              '.preview-frame canvas',
            ],
            allowClickSelector: '.touch-door[data-k="up"]',
            allowedKeys: ['up', 'arrowup'],
            preferPlacement: () => isTouchControlsVisible() ? 'top' : 'bottom',
          },
          {
            id: 'core_approach_enemy',
            tag: 'APPROACH ENEMY',
            compactPrompt: true,
            actionRequired: true,
            freezeEnemies: false,
            holdEncounter: false,
            target: ['.preview-frame canvas'],
            allowClickSelector: '.touch-btn[data-k], #tutorialCompactSkipBtn',
            allowedKeys: ['a', 'd', 'w', 'space', ' ', 'up', 'arrowleft', 'arrowright', 'arrowup'],
          },
        ];
      }

      case 'game_battle': {
        const mp = isMultiplayer();
        return [
          {
            id: 'battle_choose_card',
            tag: mp ? '1V1 ARENA' : 'BATTLE ARENA',
            title: 'Choose an Action Card',
            desc: mp
              ? 'Pick an action card for this round. Both players select a card and answer the same IT question.'
              : 'Check the enemy’s next attack intent above, then choose an action card from your hand.',
            actionPrompt: 'Action required: Choose a highlighted card (1–4), or start a Remedial challenge with R when available.',
            actionRequired: true,
            multiTargetSelector: '#panel .actions button[data-act="card"]:not(:disabled), #panel .actions button[data-act="remedial"]:not(:disabled)',
            target: [() => resolveFirstVisible('#panel .actions button[data-act="card"]:not(:disabled), #panel .actions button[data-act="remedial"]:not(:disabled)')],
            allowClickSelector: '#panel [data-act="card"]:not(:disabled), #panel [data-act="remedial"]:not(:disabled)',
            allowedKeys: ['1', '2', '3', '4', 'r'],
            preferPlacement: 'top',
          },
          {
            id: 'battle_answer_question',
            tag: mp ? '1V1 ARENA' : 'BATTLE ARENA',
            title: mp ? 'Answer with a Numbered Choice' : 'Answer 1–4 or Use Blood Hint [H]',
            desc: mp
              ? 'Answer correctly to hit your opponent with your card’s full effect.'
              : 'Correct answers trigger full power and restore HP + azure Mana (MP). Stuck in solo battle? Use Blood Hint [H] to sacrifice half your Max HP (requires strictly more HP than the cost), purge wrong choices, and reveal a Blood Clue!',
            actionPrompt: 'Action required: Click an answer choice (1–4) or press keys 1–4.',
            actionRequired: true,
            target: ['#panel .choices', '#panel'],
            unionWith: '#panel .question',
            allowClickSelector: '#panel [data-act="answer"]:not(:disabled)',
            allowedKeys: ['1', '2', '3', '4'],
            preferPlacement: 'top',
          },
          {
            id: 'battle_read_feedback',
            tag: mp ? '1V1 ARENA' : 'BATTLE ARENA',
            title: 'Read Feedback & Continue',
            desc: 'Review the answer explanation, combat log, and character-head health bars, then continue to the next turn.',
            actionPrompt: 'Action required: Click "Continue" or press Enter, W, E, Space, or Up Arrow.',
            actionRequired: true,
            target: ['#panel .battle-feedback-row', '#panel [data-act="continue"]', '#panel'],
            allowClickSelector: '#panel [data-act="continue"]:not(:disabled)',
            allowedKeys: ['enter', 'w', 'e', 'space', ' ', 'up', 'arrowup'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_hud': {
        const mp = isMultiplayer();
        return [
          {
            id: 'hud_menu_fullscreen',
            tag: 'HUD GUIDE',
            title: 'Menu & Fullscreen Controls',
            desc: 'Click Menu (Esc) to pause and return to the Quest Hub, or Fullscreen (F) to expand the game screen.',
            target: ['#exitPlayButton', '#playHud .play-hud-header'],
            preferPlacement: 'bottom',
          },
          {
            id: 'hud_map_skills',
            tag: 'HUD GUIDE',
            title: 'World Map [M], Quests [O] & Skills [U]',
            desc: mp
              ? 'Review live match controls and scoreboard indicators along the top bar.'
              : 'Open World Map [M] to inspect citadel routes, Quests [O] & Supply Crates to claim run boons, and Skills [U] to upgrade your 7-discipline Skill Tree. Notice crimson HP vs. blue MP bars!',
            target: ['#worldMapHudButton', '#questsHudButton', '#skillPointHudBadge', '#playHud .play-hud-header'],
            condition: () => !mp && Boolean(resolveFirstVisible('#worldMapHudButton')),
            preferPlacement: 'bottom',
          },
          {
            id: 'hud_guide_button',
            tag: 'HUD GUIDE',
            title: 'Replay In-Game Help',
            desc: 'Select ? Guide anytime during gameplay to revisit the controls or screen help for your current phase.',
            target: ['#hudTourButton', '#playHud .play-hud-header'],
            preferPlacement: 'bottom',
          },
        ];
      }

      case 'game_card_reward': {
        return [
          {
            id: 'card_reward_panel',
            tag: 'CARD REWARD',
            title: 'Draft a Reward Card',
            desc: 'This reward panel lets you add a new card to your run deck. Each card shows its own Mana cost and effect description—read your choices and pick whichever you prefer.',
            target: ['#panel'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_level_up': {
        return [
          {
            id: 'level_up_panel',
            tag: 'LEVEL UP',
            title: 'Choose a Level-Up Buff',
            desc: 'Defeating two viruses grants a Level Up in this panel. Each buff card displays its own bonus description—read the options and pick the upgrade you want.',
            target: ['#panel'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_sp_earned': {
        return [
          {
            id: 'sp_earned_popup',
            tag: 'SKILL POINT EARNED',
            title: '+1 Skill Point Earned!',
            desc: () => {
              const cat = state.activeSkillPointAward?.category;
              return cat
                ? `You earned 1 Skill Point in ${cat}. Open the Skill Tree whenever you’re ready to spend it.`
                : 'You earned 1 Skill Point. Open the Skill Tree whenever you’re ready to spend it.';
            },
            nextLabel: 'Open Skill Tree',
            skipLabel: 'Dismiss',
            actionRequired: false,
            target: [
              '#skillPointHudBadge:not([hidden])',
              '#spEarnedBanner:not([hidden])',
              '#mainSidebar [data-view="skilltree"]',
              '#playHud .play-hud-header',
              '#dashboardAside',
            ],
            allowClickSelector: '#skillPointHudBadge, #spEarnedBanner',
            allowedKeys: ['u', 'escape'],
            preferPlacement: 'bottom',
          },
        ];
      }

      case 'game_remedial_drill': {
        return [
          {
            id: 'remedial_overview',
            tag: 'REMEDIAL DRILL',
            title: 'Remedial Surge Challenge',
            desc: () => {
              const totalQ = (typeof battle !== 'undefined' && battle.remedial?.questions?.length)
                ? battle.remedial.questions.length
                : 0;
              const countPhrase = totalQ ? `${totalQ} consecutive IT questions` : 'a quick streak of IT questions';
              return `Out of Mana? Remedial Drill triggers automatically with ${countPhrase}. Answer every prompt correctly for Perfect Remedial Surge (full Mana, HP recovery, +8 ATK, and +4 DEF), or earn partial HP and Mana recovery from each correct answer.`;
            },
            target: ['#panel'],
            preferPlacement: 'top',
          },
          {
            id: 'remedial_answer',
            tag: 'REMEDIAL DRILL',
            title: 'Answer the Remedial Prompt',
            desc: () => {
              const rem = typeof battle !== 'undefined' ? battle.remedial : null;
              const cur = rem ? (rem.index + 1) : 1;
              const tot = rem?.questions?.length || 2;
              return `You are on question ${cur} of ${tot}. Read the question in the Remedial panel and choose an answer to continue your surge.`;
            },
            actionPrompt: 'Action required: Click an answer option or press keys 1–4.',
            actionRequired: true,
            target: ['#panel'],
            allowClickSelector: '#panel [data-act="remedial-answer"]:not(:disabled)',
            allowedKeys: ['1', '2', '3', '4'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_skill_tree': {
        return [
          {
            id: 'sp_notify',
            tag: 'SKILL POINT · 1 / 3',
            title: 'You Earned a Skill Point!',
            desc: () => {
              const cat = state.activeSkillPointAward?.category;
              return cat
                ? `Every 5 correct answers in ${cat} earns 1 Skill Point. Watch this notification whenever a new point unlocks.`
                : 'Every 5 correct answers in a discipline earns 1 Skill Point. Watch this notification whenever a new point unlocks.';
            },
            nextLabel: 'Next',
            target: [
              '#spEarnedBanner:not([hidden])',
              '#skillPointHudBadge:not([hidden])',
              '#playHud .play-hud-header',
              '#dashboardAside',
            ],
            preferPlacement: 'bottom',
          },
          {
            id: 'sp_hud_control',
            tag: 'SKILL TREE · 2 / 3',
            title: 'Open the Skill Tree from the HUD',
            desc: 'Use the Skills [U] control in the top HUD (or press U) anytime to view your skill points and branches.',
            nextLabel: 'Open Skill Tree',
            allowOptionalAction: true,
            target: [
              '#skillPointHudBadge:not([hidden])',
              '#mainSidebar [data-view="skilltree"]',
              '#playHud .play-hud-header',
              '#dashboardAside',
            ],
            allowClickSelector: '#skillPointHudBadge, #spEarnedBanner',
            allowedKeys: ['u'],
            onNext: () => {
              const banner = document.getElementById('spEarnedBanner');
              if (banner) banner.hidden = true;
              if (typeof skillTreeOpen !== 'undefined' && !skillTreeOpen && typeof openSkillTree === 'function') {
                openSkillTree();
              }
            },
            preferPlacement: 'bottom',
          },
          {
            id: 'sp_tree_overview',
            tag: 'SKILL TREE · 3 / 3',
            title: 'Explore 7 Disciplines & Exclusives',
            desc: 'Seven discipline branches grow outward from the center—select any node to view its bonus or Exclusive Active skill (Software Engineering unlocks in 2nd Year; HCI in 3rd Year). Close anytime with Close · U or Escape.',
            nextLabel: 'Got it',
            target: ['#skillMapViewport', '#skillTreeGrid', '#skillTreeOverlay .skill-tree-shell'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_world_map': {
        return [
          {
            id: 'map_legend',
            tag: 'WORLD MAP',
            title: 'Current, Cleared & Locked Rooms',
            desc: 'The legend marks your Current room, Completed rooms, Unlocked routes, Pixel-Locked rooms, and Boss Sanctums.',
            target: ['#worldMapOverlay .world-map-legend', '#worldMapOverlay .world-map-header'],
            preferPlacement: 'bottom',
          },
          {
            id: 'map_viewport_routes',
            tag: 'WORLD MAP',
            title: 'Routes, Panning & Loop Resets',
            desc: 'Drag to pan and scroll to zoom across the 16 citadel rooms. Finishing a full campaign loop resets the map and deploys heavily armored Loop II+ reinforcements.',
            target: ['#worldMapViewport'],
            preferPlacement: 'top',
          },
          {
            id: 'map_inspector',
            tag: 'WORLD MAP',
            title: 'Room Inspection (On-Foot Navigation)',
            desc: 'Click any room card to inspect enemy count, Loop Armor status, connected exits, and unlock rules. Move between rooms on foot through dungeon doors.',
            target: ['#worldMapInspector'],
            preferPlacement: 'top',
          },
          {
            id: 'map_close',
            tag: 'WORLD MAP',
            title: 'Close Whenever Ready',
            desc: 'Use Close · M, press M, or press Escape whenever you are ready to resume exploring on foot.',
            target: ['#closeWorldMap', '.world-map-actions'],
            preferPlacement: 'bottom',
          },
        ];
      }

      case 'guide_skill_tree': {
        return [
          {
            id: 'guide_skill_points',
            tag: 'SKILL TREE GUIDE',
            title: 'Skill Points & Wildcard SP',
            desc: 'Every 5 correct answers in a discipline earns 1 Skill Point (SP), and Supply Crates or Quests can award Wildcard SP usable in any unlocked tree.',
            target: ['#skillTreeSummary .skill-points-strip', '#skillTreeSummary'],
            preferPlacement: 'bottom',
          },
          {
            id: 'guide_skill_topics',
            tag: 'SKILL TREE GUIDE',
            title: '7 Discipline Branches',
            desc: 'Branches cover Computer Systems, Networking & Security, Discrete Mathematics, Programming, Software Engineering (2nd Year+), Web & Mobile Development, and Database.',
            target: ['#skillMapViewport', '#skillTreeGrid'],
            preferPlacement: 'top',
          },
          {
            id: 'guide_skill_choices',
            tag: 'SKILL TREE GUIDE',
            title: 'Upgrades & Exclusive Actives',
            desc: 'Select any unlocked node to inspect its effect and 1 SP cost. Committing to a discipline’s Exclusive Active skill (like Kernel Aegis, Proof by Contradiction, System Refactor, or Async Cascade) locks the other trees and transfers your unspent SP.',
            target: ['#skillTreeDetail'],
            preferPlacement: 'left',
          },
          {
            id: 'guide_skill_close',
            tag: 'SKILL TREE GUIDE',
            title: 'Close Whenever Ready',
            desc: 'Finish this guide to spend points on your own, or press Close · U or Escape to return to the Citadel.',
            target: ['#closeSkillTree'],
            preferPlacement: 'bottom',
          },
        ];
      }

      case 'guide_world_map': {
        return [
          {
            id: 'guide_map_status',
            tag: 'WORLD MAP GUIDE',
            title: 'Room Status & Pixel Locks',
            desc: 'The legend distinguishes your Current room, Completed rooms, Unlocked paths, Pixel-Locked gates, and Boss Sanctums.',
            target: ['#worldMapOverlay .world-map-legend'],
            preferPlacement: 'bottom',
          },
          {
            id: 'guide_map_routes',
            tag: 'WORLD MAP GUIDE',
            title: 'On-Foot Routes & Loop Resets',
            desc: 'Lines trace the connected citadel corridors—walk through room doors on foot to advance. Looping past a Boss Sanctum resets map progression for the next cycle with armored enemies and reinforcements.',
            target: ['#worldMapViewport'],
            preferPlacement: 'top',
          },
          {
            id: 'guide_map_inspect',
            tag: 'WORLD MAP GUIDE',
            title: 'Room Inspection',
            desc: 'Select any room card to inspect its virus threats, Loop Armor scaling, exits, and unlock requirement in this footer.',
            target: ['#worldMapInspector'],
            preferPlacement: 'top',
          },
          {
            id: 'guide_map_controls',
            tag: 'WORLD MAP GUIDE',
            title: 'Pan, Zoom & Reset View',
            desc: 'Drag to pan and scroll to zoom across the map, or click Center View to refocus on your current corridor.',
            target: ['#worldMapViewport'],
            preferPlacement: 'top',
          },
          {
            id: 'guide_map_close',
            tag: 'WORLD MAP GUIDE',
            title: 'Close Whenever Ready',
            desc: 'Finish this guide to inspect the citadel routes on your own, or use Close · M, M, or Escape to resume exploring.',
            target: ['#closeWorldMap'],
            preferPlacement: 'bottom',
          },
        ];
      }

      default:
        return [];
    }
  }

  // --- Active tutorial runtime state ---
  const state = {
    activeId: null,
    steps: [],
    stepIndex: 0,
    targetEl: null,
    returnFocusEl: null,
    rafId: 0,
    retryTimer: 0,
    retryCount: 0,
    silentMoveTimer: 0,
    physicalRightHeld: false,
    pendingSkillPointAwards: [],
    seenSkillPointAwardIds: new Set(),
    activeSkillPointAward: null,
    pendingRemedialTutorial: false,
    spPopupTimer: 0,
    pendingSkillTreeKey: null,
    activeIsReplay: false,
    pendingBattleReplay: false,
    sequence: null, // { kind: 'tour' | 'game', queue?: string[], pending?: Set<string>, isReplay: boolean }
    suppressAutoTourView: null,
  };

  function getEls() {
    return {
      layer: document.getElementById('tutorialLayer'),
      dimTop: document.getElementById('tutorialDimTop'),
      dimBottom: document.getElementById('tutorialDimBottom'),
      dimLeft: document.getElementById('tutorialDimLeft'),
      dimRight: document.getElementById('tutorialDimRight'),
      spotlight: document.getElementById('tutorialSpotlight'),
      spotlightBadge: document.getElementById('tutorialSpotlightBadge'),
      multiSpotlights: document.getElementById('tutorialMultiSpotlights'),
      silentCue: document.getElementById('tutorialSilentCue'),
      bubble: document.getElementById('tutorialBubble'),
      tag: document.getElementById('tutorialBubbleTag'),
      progress: document.getElementById('tutorialBubbleProgress'),
      title: document.getElementById('tutorialBubbleTitle'),
      desc: document.getElementById('tutorialBubbleDesc'),
      actionPrompt: document.getElementById('tutorialActionPrompt'),
      actionsRow: document.querySelector('#tutorialBubble .tutorial-bubble-actions'),
      skipBtn: document.getElementById('tutorialSkipButton'),
      nextBtn: document.getElementById('tutorialNextButton'),
      announcer: document.getElementById('tutorialLiveAnnouncer'),
    };
  }

  function currentStep() {
    if (!state.activeId || state.stepIndex < 0 || state.stepIndex >= state.steps.length) return null;
    return state.steps[state.stepIndex];
  }

  function isStepActionRequired(step) {
    if (!step) return false;
    return Boolean(typeof step.actionRequired === 'function' ? step.actionRequired() : step.actionRequired);
  }

  function isOverlayGuide() {
    return state.activeId === 'guide_skill_tree' || state.activeId === 'guide_world_map';
  }

  function isSequenceSkipMode() {
    const store = loadStore();
    return Boolean(
      state.sequence ||
      (store.postResetGameSequence && FULL_GAME_GUIDE_SEQUENCE.includes(state.activeId))
    );
  }

  function isSkipControlAllowed(step = currentStep()) {
    if (!state.activeId || !step || step.silentCue) return false;
    if (isSequenceSkipMode()) return true;
    return !isOverlayGuide();
  }

  function hasVisibleActionPrompt(step = currentStep()) {
    return Boolean(step && isStepActionRequired(step));
  }

  function isActionPromptKey(step, key, rawKey) {
    if (!step) return false;
    if (!hasVisibleActionPrompt(step) && !step.allowOptionalAction && state.activeId !== 'game_sp_earned') return false;
    const allowedKeys = Array.isArray(step.allowedKeys) ? step.allowedKeys : [];
    return allowedKeys.includes(String(key || '').toLowerCase()) ||
      allowedKeys.includes(String(rawKey || '').toLowerCase());
  }

  function normalizeTutorialKey(key) {
    const raw = String(key || '').toLowerCase();
    return ({ arrowleft: 'a', arrowright: 'd', arrowup: 'up', ' ': 'space' })[raw] || raw;
  }

  function isKeyboardActivation(key, rawKey) {
    const raw = String(rawKey || '').toLowerCase();
    return key === 'enter' || key === 'space' || raw === ' ' || raw === 'spacebar';
  }

  function getAllowedActionControl(target, step = currentStep()) {
    if (!target || !step || !step.allowClickSelector) return null;
    if (!hasVisibleActionPrompt(step) && !step.allowOptionalAction && state.activeId !== 'game_sp_earned') return null;
    const control = target.closest(step.allowClickSelector);
    if (!control || !isElementVisible(control) || control.matches(':disabled, [aria-disabled="true"]')) return null;
    return control;
  }

  function isAllowedTutorialTarget(target, step = currentStep()) {
    if (!target || !step || !state.activeId) return false;
    const els = getEls();
    if (els.nextBtn && !els.nextBtn.hidden && target.closest('#tutorialNextButton')) return true;
    if (els.skipBtn && !els.skipBtn.hidden && target.closest('#tutorialSkipButton')) return true;
    if (step.compactPrompt && target.closest('#tutorialCompactSkipBtn')) return true;
    return Boolean(getAllowedActionControl(target, step));
  }

  function getTutorialFocusTargets(step = currentStep()) {
    const els = getEls();
    const targets = [];
    if (step?.compactPrompt) {
      const compactSkip = document.getElementById('tutorialCompactSkipBtn');
      if (compactSkip && isElementVisible(compactSkip)) targets.push(compactSkip);
    }
    if (els.skipBtn && !els.skipBtn.hidden) targets.push(els.skipBtn);
    if (els.nextBtn && !els.nextBtn.hidden) targets.push(els.nextBtn);
    if ((hasVisibleActionPrompt(step) || step?.allowOptionalAction) && step.allowClickSelector) {
      document.querySelectorAll(step.allowClickSelector).forEach((target) => {
        if (isAllowedTutorialTarget(target, step) && !targets.includes(target)) targets.push(target);
      });
    }
    return targets;
  }

  function getTutorialFocusTarget(step = currentStep()) {
    const els = getEls();
    if (step?.compactPrompt) {
      return document.getElementById('tutorialCompactSkipBtn') || document.querySelector('.preview-frame canvas') || els.layer;
    }
    if (step?.silentCue) {
      const touchD = isTouchControlsVisible() ? resolveFirstVisible('.touch-dir[data-k="d"]') : null;
      return touchD || document.querySelector('.preview-frame canvas') || els.layer;
    }
    if (els.nextBtn && !els.nextBtn.hidden) return els.nextBtn;
    const focusTargets = getTutorialFocusTargets(step);
    return focusTargets[0] || els.bubble;
  }

  function focusTutorialTarget(event) {
    const focusTargets = getTutorialFocusTargets();
    if (!focusTargets.length) return;
    const activeIndex = focusTargets.indexOf(document.activeElement);
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex = activeIndex < 0
      ? (direction < 0 ? focusTargets.length - 1 : 0)
      : (activeIndex + direction + focusTargets.length) % focusTargets.length;
    event.preventDefault();
    event.stopImmediatePropagation();
    focusTargets[nextIndex].focus({ preventScroll: true });
  }

  function syncBodyAndAppClasses() {
    const appEl = document.getElementById('app');
    const step = currentStep();
    const active = Boolean(state.activeId && step);
    const allowSkip = isSkipControlAllowed(step);
    document.body.classList.toggle('is-tutorial-active', active);
    const els = getEls();
    if (els.layer) els.layer.classList.toggle('is-no-skip-guide', active && !allowSkip);
    if (els.skipBtn) {
      els.skipBtn.hidden = !active || !allowSkip;
      els.skipBtn.textContent = step?.skipLabel || (isSequenceSkipMode() ? 'Skip sequence' : 'Skip tutorial');
    }
    if (els.bubble) els.bubble.setAttribute('aria-modal', String(active && !step.silentCue && !step.compactPrompt));
    if (appEl) {
      appEl.classList.toggle('is-tutorial-touch-visible', Boolean(active && step.showTouchControls));
    }
    if (active) {
      if (typeof releaseAllTouchControls === 'function') releaseAllTouchControls();
      if (typeof keys !== 'undefined') {
        keys.a.pressed = false;
        if (!state.physicalRightHeld || (step?.id !== 'core_move_lr' && step?.id !== 'core_approach_enemy')) {
          keys.d.pressed = false;
        }
      }
    }
    if (typeof syncTouchVisibility === 'function') {
      syncTouchVisibility();
    }
  }

  function scrollTargetIntoViewIfNeeded(targetEl) {
    if (!targetEl || !targetEl.isConnected) return;
    if (typeof playViewActive !== 'undefined' && playViewActive && !skillTreeOpen && !worldMapOpen) return;
    if (targetEl.closest('#worldMapViewport, #skillMapViewport')) return;

    const r = targetEl.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const topSafe = 68;
    const bottomSafe = vh - 68;
    if (r.top < topSafe || r.bottom > bottomSafe) {
      const reduced = document.body.classList.contains('reduce-motion') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      try {
        targetEl.scrollIntoView({
          behavior: reduced ? 'auto' : 'smooth',
          block: r.height > vh * 0.65 ? 'start' : 'center',
          inline: 'nearest',
        });
      } catch {
        targetEl.scrollIntoView();
      }
    }
  }

  function getVisibleViewportBox() {
    const vv = window.visualViewport;
    const vLeft = vv ? vv.offsetLeft : 0;
    const vTop = vv ? vv.offsetTop : 0;
    const vW = vv ? vv.width : (window.innerWidth || document.documentElement.clientWidth || 1024);
    const vH = vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 768);
    const rootStyle = window.getComputedStyle(document.documentElement);
    const sat = parseFloat(rootStyle.getPropertyValue('--sat')) || 0;
    const sar = parseFloat(rootStyle.getPropertyValue('--sar')) || 0;
    const sab = parseFloat(rootStyle.getPropertyValue('--sab')) || 0;
    const sal = parseFloat(rootStyle.getPropertyValue('--sal')) || 0;
    const left = Math.round(vLeft + sal);
    const top = Math.round(vTop + sat);
    const right = Math.max(left + 120, Math.round(vLeft + vW - sar));
    const bottom = Math.max(top + 120, Math.round(vTop + vH - sab));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function getExplorePlayerScreenRect() {
    if (typeof playViewActive === 'undefined' || !playViewActive || typeof mode === 'undefined' || mode !== 'explore') return null;
    if (typeof player === 'undefined' || !player || typeof canvas === 'undefined' || !canvas || !isElementVisible(canvas)) return null;
    const cr = canvas.getBoundingClientRect();
    if (!canvas.width || !canvas.height || cr.width <= 1 || cr.height <= 1) return null;
    const sx = cr.width / canvas.width;
    const sy = cr.height / canvas.height;
    const camX = typeof exploreCamera !== 'undefined' ? (exploreCamera.x || 0) : 0;
    const camY = typeof exploreCamera !== 'undefined' ? (exploreCamera.y || 0) : 0;
    const artW = player.destinationSize?.width || player.width || 76;
    const artH = player.destinationSize?.height || player.height || 72;
    const artX = player.position.x + (player.drawOffset?.x || 0);
    const artY = player.position.y + (player.drawOffset?.y || 0);
    const artLeft = cr.left + (artX - camX) * sx;
    const artTop = cr.top + (artY - camY) * sy;
    const artRight = cr.left + (artX + artW - camX) * sx;
    const artBottom = cr.top + (artY + artH - camY) * sy;
    // Include overhead HP/MP meters (~24px above sprite) so tutorial bubbles stay clear of them
    const fullTop = cr.top + (artY - 24 - camY) * sy;
    return {
      left: artLeft,
      top: fullTop,
      right: artRight,
      bottom: artBottom,
      artLeft,
      artTop,
      artRight,
      artBottom,
    };
  }

  function rectOverlapArea(a, b) {
    if (!a || !b) return 0;
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ox * oy;
  }

  function positionSilentCue(els, step, vp) {
    if (!els.silentCue) return;
    [els.dimTop, els.dimBottom, els.dimLeft, els.dimRight].forEach((d) => {
      if (d) d.hidden = true;
    });
    if (els.multiSpotlights) {
      els.multiSpotlights.hidden = true;
      els.multiSpotlights.innerHTML = '';
    }
    els.bubble.hidden = true;

    const touchD = isTouchControlsVisible() ? resolveFirstVisible('.touch-dir[data-k="d"]') : null;
    if (touchD) {
      const dr = touchD.getBoundingClientRect();
      const pad = vp.height <= 500 ? 4 : 6;
      const hlLeft = Math.max(2, Math.round(dr.left - pad));
      const hlTop = Math.max(2, Math.round(dr.top - pad));
      const hlRight = Math.min(vp.right - 2, Math.round(dr.right + pad));
      const hlBottom = Math.min(vp.bottom - 2, Math.round(dr.bottom + pad));
      els.spotlight.hidden = false;
      els.spotlight.style.left = `${hlLeft}px`;
      els.spotlight.style.top = `${hlTop}px`;
      els.spotlight.style.width = `${Math.max(16, hlRight - hlLeft)}px`;
      els.spotlight.style.height = `${Math.max(16, hlBottom - hlTop)}px`;
      els.spotlight.classList.add('is-action-required', 'is-silent-target');

      if (!els.silentCue.classList.contains('is-touch-cue')) {
        els.silentCue.classList.remove('is-desktop-cue');
        els.silentCue.classList.add('is-touch-cue');
        els.silentCue.innerHTML = '<span class="tutorial-silent-keycap">D</span><span class="tutorial-silent-arrow-down" aria-hidden="true">▼</span>';
      }
      els.silentCue.hidden = false;
      const cw = els.silentCue.offsetWidth || 54;
      const ch = els.silentCue.offsetHeight || 58;
      const cueLeft = Math.max(vp.left + 4, Math.min(vp.right - cw - 4, Math.round(dr.left + dr.width / 2 - cw / 2)));
      const cueTop = Math.max(vp.top + 4, Math.round(hlTop - ch - 6));
      els.silentCue.style.left = `${cueLeft}px`;
      els.silentCue.style.top = `${cueTop}px`;
      return;
    }

    els.spotlight.hidden = true;
    els.spotlight.classList.remove('is-silent-target');
    if (!els.silentCue.classList.contains('is-desktop-cue')) {
      els.silentCue.classList.remove('is-touch-cue');
      els.silentCue.classList.add('is-desktop-cue');
      els.silentCue.innerHTML = '<span class="tutorial-silent-keycap">D</span><span class="tutorial-silent-arrows" aria-hidden="true">▶▶</span>';
    }
    els.silentCue.hidden = false;
    const cw = els.silentCue.offsetWidth || 88;
    const ch = els.silentCue.offsetHeight || 42;
    const playerRect = getExplorePlayerScreenRect();
    const canvasEl = document.querySelector('.preview-frame canvas');
    const cr = canvasEl ? canvasEl.getBoundingClientRect() : { left: vp.left, top: vp.top, width: vp.width, height: vp.height };
    let cueLeft = playerRect ? Math.round(playerRect.artLeft + (playerRect.artRight - playerRect.artLeft) * 0.25) : Math.round(cr.left + cr.width * 0.44);
    let cueTop = playerRect ? Math.round(playerRect.top - ch - 8) : Math.round(cr.top + cr.height * 0.42);
    if (cueTop < vp.top + 6 && playerRect) {
      cueLeft = Math.round(playerRect.artRight + 14);
      cueTop = Math.round((playerRect.artTop + playerRect.artBottom) / 2 - ch / 2);
    }
    cueLeft = Math.max(vp.left + 6, Math.min(vp.right - cw - 6, cueLeft));
    cueTop = Math.max(vp.top + 6, Math.min(vp.bottom - ch - 6, cueTop));
    els.silentCue.style.left = `${cueLeft}px`;
    els.silentCue.style.top = `${cueTop}px`;
  }

  function renderMultiSpotlights(els, rects) {
    if (!els.multiSpotlights) return;
    els.multiSpotlights.hidden = false;
    while (els.multiSpotlights.children.length > rects.length) {
      els.multiSpotlights.lastElementChild.remove();
    }
    while (els.multiSpotlights.children.length < rects.length) {
      const box = document.createElement('div');
      box.className = 'tutorial-card-outline';
      box.innerHTML =
        '<span class="tutorial-spotlight-corner is-tl"></span>' +
        '<span class="tutorial-spotlight-corner is-tr"></span>' +
        '<span class="tutorial-spotlight-corner is-bl"></span>' +
        '<span class="tutorial-spotlight-corner is-br"></span>';
      els.multiSpotlights.appendChild(box);
    }
    rects.forEach((r, idx) => {
      const box = els.multiSpotlights.children[idx];
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    });
  }

  function checkApproachEnemyProximity() {
    if (typeof mode === 'undefined' || mode !== 'explore') return false;
    if (typeof player === 'undefined' || !player?.hitbox) return false;
    if (typeof enemies === 'undefined' || !Array.isArray(enemies)) return false;
    const h = player.hitbox;
    const hLeft = h.position.x;
    const hRight = h.position.x + h.width;
    const hTop = h.position.y;
    const hBottom = h.position.y + h.height;
    return enemies.some((e) => {
      if (!e || !e.alive) return false;
      const dx = Math.max(0, e.x - hRight, hLeft - (e.x + e.w));
      const dy = Math.max(0, e.y - hBottom, hTop - (e.y + e.h));
      return dx <= 48 && dy <= 64;
    });
  }

  function positionCompactApproachPrompt(els, step, vp) {
    if (!els.silentCue) return;
    [els.dimTop, els.dimBottom, els.dimLeft, els.dimRight].forEach((d) => {
      if (d) d.hidden = true;
    });
    if (els.multiSpotlights) {
      els.multiSpotlights.hidden = true;
      els.multiSpotlights.innerHTML = '';
    }
    els.spotlight.hidden = true;
    els.spotlight.classList.remove('is-silent-target');
    els.bubble.hidden = true;

    const touchMode = isTouchControlsVisible();
    const expectedMsg = touchMode
      ? 'Approach a virus using LEFT / RIGHT and JUMP.'
      : 'Approach a virus using A / D and W to jump.';
    if (!els.silentCue.classList.contains('is-approach-prompt')) {
      els.silentCue.classList.remove('is-touch-cue', 'is-desktop-cue');
      els.silentCue.classList.add('is-approach-prompt');
      els.silentCue.innerHTML =
        '<span class="tutorial-compact-tag">MOVE</span>' +
        `<span class="tutorial-compact-text">${expectedMsg}</span>` +
        '<button type="button" class="tutorial-compact-skip" id="tutorialCompactSkipBtn">Skip</button>';
    } else {
      const txtEl = els.silentCue.querySelector('.tutorial-compact-text');
      if (txtEl && txtEl.textContent !== expectedMsg) txtEl.textContent = expectedMsg;
    }
    els.silentCue.hidden = false;

    const cw = els.silentCue.offsetWidth || 320;
    const ch = els.silentCue.offsetHeight || 40;
    const hudHeaderEl = resolveFirstVisible('#playHud .play-hud-header');
    const hudHeaderRect = hudHeaderEl ? hudHeaderEl.getBoundingClientRect() : null;
    const touchRect = touchMode ? resolveFirstVisible('.touch')?.getBoundingClientRect() : null;
    const playerRect = getExplorePlayerScreenRect();
    const topBase = hudHeaderRect ? Math.round(hudHeaderRect.bottom + 8) : vp.top + 10;
    const edge = 8;

    const candidates = [
      { left: Math.round(vp.left + (vp.width - cw) / 2), top: topBase },
      { left: Math.round(vp.right - cw - edge), top: topBase },
      { left: Math.round(vp.left + edge), top: topBase },
      {
        left: Math.round(vp.left + (vp.width - cw) / 2),
        top: Math.round(touchRect ? touchRect.top - ch - 10 : vp.bottom - ch - 12),
      },
    ];
    let chosen = candidates[0];
    let bestOverlap = Infinity;
    for (const c of candidates) {
      const clampedLeft = Math.max(vp.left + edge, Math.min(vp.right - cw - edge, c.left));
      const clampedTop = Math.max(vp.top + edge, Math.min(vp.bottom - ch - edge, c.top));
      const box = { left: clampedLeft, top: clampedTop, right: clampedLeft + cw, bottom: clampedTop + ch };
      const overlap =
        (playerRect ? rectOverlapArea(box, playerRect) * 2 : 0) +
        (touchRect ? rectOverlapArea(box, touchRect) * 2 : 0);
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        chosen = { left: clampedLeft, top: clampedTop };
      }
    }
    els.silentCue.style.left = `${chosen.left}px`;
    els.silentCue.style.top = `${chosen.top}px`;

    if (step.id === 'core_approach_enemy' && checkApproachEnemyProximity()) {
      completeActiveTutorial('completed');
    }
  }

  function positionSpotlightAndBubble() {
    const els = getEls();
    const step = currentStep();
    if (!els.layer || !step || !state.activeId) return;

    const vp = getVisibleViewportBox();
    if (step.compactPrompt) {
      positionCompactApproachPrompt(els, step, vp);
      return;
    }
    if (step.silentCue) {
      positionSilentCue(els, step, vp);
      return;
    }

    if (els.silentCue) {
      els.silentCue.hidden = true;
      els.silentCue.classList.remove('is-approach-prompt');
    }
    els.spotlight.classList.remove('is-silent-target');
    els.bubble.hidden = false;

    const noSpot = typeof step.noSpotlight === 'function' ? Boolean(step.noSpotlight()) : Boolean(step.noSpotlight);
    const multiEls = step.multiTargetSelector ? resolveStepMultiTargets(step) : [];
    const targetEl = multiEls[0] || resolveFirstVisible(step.target);
    if (!targetEl) return;
    state.targetEl = targetEl;

    const actionReq = hasVisibleActionPrompt(step);
    els.bubble.setAttribute('aria-modal', String(!noSpot));

    const pad = vp.height <= 500 ? 4 : 6;
    let boxLeft;
    let boxTop;
    let boxRight;
    let boxBottom;

    if (multiEls.length) {
      const outlineRects = multiEls.map((el) => {
        const r = el.getBoundingClientRect();
        const l = Math.max(vp.left + 2, Math.round(r.left - 3));
        const t = Math.max(vp.top + 2, Math.round(r.top - 3));
        const ri = Math.min(vp.right - 2, Math.round(r.right + 3));
        const bo = Math.min(vp.bottom - 2, Math.round(r.bottom + 3));
        return { left: l, top: t, right: ri, bottom: bo, width: Math.max(16, ri - l), height: Math.max(16, bo - t) };
      });
      renderMultiSpotlights(els, outlineRects);
      els.spotlight.hidden = true;
      boxLeft = Math.min(...outlineRects.map((r) => r.left));
      boxTop = Math.min(...outlineRects.map((r) => r.top));
      boxRight = Math.max(...outlineRects.map((r) => r.right));
      boxBottom = Math.max(...outlineRects.map((r) => r.bottom));
    } else {
      if (els.multiSpotlights) {
        els.multiSpotlights.hidden = true;
        els.multiSpotlights.innerHTML = '';
      }
      const rawRect = targetEl.getBoundingClientRect();
      boxLeft = rawRect.left;
      boxTop = rawRect.top;
      boxRight = rawRect.right;
      boxBottom = rawRect.bottom;
      if (step.unionWith) {
        const extraEl = resolveFirstVisible(step.unionWith);
        if (extraEl) {
          const er = extraEl.getBoundingClientRect();
          boxLeft = Math.min(boxLeft, er.left);
          boxTop = Math.min(boxTop, er.top);
          boxRight = Math.max(boxRight, er.right);
          boxBottom = Math.max(boxBottom, er.bottom);
        }
      }
    }

    const hlLeft = Math.max(vp.left + 2, Math.round(multiEls.length ? boxLeft : boxLeft - pad));
    const hlTop = Math.max(vp.top + 2, Math.round(multiEls.length ? boxTop : boxTop - pad));
    const hlRight = Math.min(vp.right - 2, Math.round(multiEls.length ? boxRight : boxRight + pad));
    const hlBottom = Math.min(vp.bottom - 2, Math.round(multiEls.length ? boxBottom : boxBottom + pad));
    const hlW = Math.max(16, hlRight - hlLeft);
    const hlH = Math.max(16, hlBottom - hlTop);
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;

    if (noSpot && !multiEls.length) {
      [els.dimTop, els.dimBottom, els.dimLeft, els.dimRight].forEach((d) => {
        if (d) d.hidden = true;
      });
      els.spotlight.hidden = true;
    } else {
      [els.dimTop, els.dimBottom, els.dimLeft, els.dimRight].forEach((d) => {
        if (d) d.hidden = false;
      });
      els.dimTop.style.top = '0px';
      els.dimTop.style.left = '0px';
      els.dimTop.style.width = `${vw}px`;
      els.dimTop.style.height = `${Math.max(0, hlTop)}px`;

      els.dimBottom.style.top = `${hlBottom}px`;
      els.dimBottom.style.left = '0px';
      els.dimBottom.style.width = `${vw}px`;
      els.dimBottom.style.height = `${Math.max(0, vh - hlBottom)}px`;

      els.dimLeft.style.top = `${hlTop}px`;
      els.dimLeft.style.left = '0px';
      els.dimLeft.style.width = `${Math.max(0, hlLeft)}px`;
      els.dimLeft.style.height = `${hlH}px`;

      els.dimRight.style.top = `${hlTop}px`;
      els.dimRight.style.left = `${hlRight}px`;
      els.dimRight.style.width = `${Math.max(0, vw - hlRight)}px`;
      els.dimRight.style.height = `${hlH}px`;

      if (!multiEls.length) {
        els.spotlight.hidden = false;
        els.spotlight.style.left = `${hlLeft}px`;
        els.spotlight.style.top = `${hlTop}px`;
        els.spotlight.style.width = `${hlW}px`;
        els.spotlight.style.height = `${hlH}px`;
        els.spotlight.classList.toggle('is-action-required', actionReq);
        if (els.spotlightBadge) {
          els.spotlightBadge.textContent = actionReq ? '▶ ACTION REQUIRED' : '◆ TARGET';
        }
      }
    }

    // Score bubble placements against visible viewport, target, player, touch controls, and battle panel
    const bw = els.bubble.offsetWidth || Math.min(340, vp.width - 16);
    const bh = els.bubble.offsetHeight || 160;
    const isCompact = vp.width <= 640 || vp.height <= 540;
    const gap = isCompact ? 8 : 16;
    const topGap = isCompact ? 8 : 26;
    const edge = isCompact ? 8 : 10;

    const inBattlePanel = targetEl.closest('#panel');
    const panelRect = inBattlePanel ? inBattlePanel.getBoundingClientRect() : null;
    const avoidTop = panelRect ? Math.min(hlTop, Math.round(panelRect.top - 4)) : hlTop;
    const avoidLeft = panelRect ? Math.min(hlLeft, Math.round(panelRect.left - 4)) : hlLeft;

    const clampX = (x) => Math.max(vp.left + edge, Math.min(vp.right - bw - edge, Math.round(x)));
    const clampY = (y) => Math.max(vp.top + edge, Math.min(vp.bottom - bh - edge, Math.round(y)));

    const centerX = hlLeft + hlW / 2 - bw / 2;
    const centerY = hlTop + hlH / 2 - bh / 2;
    const targetRect = { left: hlLeft, top: hlTop, right: hlRight, bottom: hlBottom };
    const playerRect = getExplorePlayerScreenRect();
    const touchEl = (typeof playViewActive !== 'undefined' && playViewActive && typeof mode !== 'undefined' && mode === 'explore')
      ? resolveFirstVisible('.touch')
      : null;
    const touchRect = touchEl ? touchEl.getBoundingClientRect() : null;
    const hudHeaderEl = (typeof playViewActive !== 'undefined' && playViewActive)
      ? resolveFirstVisible('#playHud .play-hud-header')
      : null;
    const hudHeaderRect = hudHeaderEl ? hudHeaderEl.getBoundingClientRect() : null;
    const belowHudTop = hudHeaderRect ? Math.round(hudHeaderRect.bottom + 8) : vp.top + edge;

    const avoidList = noSpot ? [] : [{ rect: targetRect, weight: 22 }];
    if (panelRect) avoidList.push({ rect: panelRect, weight: 14 });
    if (playerRect) avoidList.push({ rect: playerRect, weight: 24 });
    if (touchRect) avoidList.push({ rect: touchRect, weight: 18 });

    const prefRaw = typeof step.preferPlacement === 'function' ? step.preferPlacement() : step.preferPlacement;
    const preferredOrder = [];
    if (prefRaw && ['bottom', 'top', 'right', 'left'].includes(prefRaw)) preferredOrder.push(prefRaw);
    for (const d of ['bottom', 'top', 'right', 'left']) {
      if (!preferredOrder.includes(d)) preferredOrder.push(d);
    }

    const rawCandidates = [
      { dir: 'bottom', left: clampX(centerX), top: clampY(hlBottom + gap), priority: preferredOrder.indexOf('bottom') },
      { dir: 'top', left: clampX(centerX), top: clampY(avoidTop - topGap - bh), priority: preferredOrder.indexOf('top') },
      { dir: 'right', left: clampX(hlRight + gap), top: clampY(centerY), priority: preferredOrder.indexOf('right') },
      { dir: 'left', left: clampX(avoidLeft - gap - bw), top: clampY(centerY), priority: preferredOrder.indexOf('left') },
      { dir: 'top', left: clampX(vp.left + (vp.width - bw) / 2), top: clampY(belowHudTop), priority: 5 },
      { dir: 'top', left: clampX(vp.left + edge), top: clampY(belowHudTop), priority: 6 },
      { dir: 'top', left: clampX(vp.right - bw - edge), top: clampY(belowHudTop), priority: 7 },
      { dir: 'bottom', left: clampX(vp.left + (vp.width - bw) / 2), top: clampY(touchRect ? touchRect.top - gap - bh : vp.bottom - bh - edge), priority: 8 },
    ];

    let best = rawCandidates[0];
    let bestScore = Infinity;
    const targetCx = hlLeft + hlW / 2;
    const targetCy = hlTop + hlH / 2;
    for (const cand of rawCandidates) {
      const box = { left: cand.left, top: cand.top, right: cand.left + bw, bottom: cand.top + bh };
      let penalty = 0;
      for (const item of avoidList) {
        penalty += rectOverlapArea(box, item.rect) * item.weight;
      }
      if (hudHeaderRect && state.activeId === 'game_core') {
        penalty += rectOverlapArea(box, hudHeaderRect) * 4;
      }
      const dist = Math.hypot((box.left + bw / 2) - targetCx, (box.top + bh / 2) - targetCy);
      const score = penalty + cand.priority * 40 + dist * 0.08;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    els.spotlight.classList.toggle('is-badge-bottom', hlTop < vp.top + 28 || (best.dir === 'top' && hlBottom + 26 < vp.bottom));
    els.bubble.dataset.placement = best.dir;
    els.bubble.style.left = `${best.left}px`;
    els.bubble.style.top = `${best.top}px`;
  }

  function startPositionTracking() {
    stopPositionTracking();
    const tick = () => {
      if (!state.activeId) return;
      positionSpotlightAndBubble();
      state.rafId = window.requestAnimationFrame(tick);
    };
    state.rafId = window.requestAnimationFrame(tick);
  }

  function stopPositionTracking() {
    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    if (state.retryTimer) {
      window.clearTimeout(state.retryTimer);
      state.retryTimer = 0;
    }
    if (state.silentMoveTimer) {
      window.clearTimeout(state.silentMoveTimer);
      state.silentMoveTimer = 0;
    }
  }

  function renderCurrentStep({ focusBubble = false } = {}) {
    const els = getEls();
    if (!els.layer || !state.activeId) return;
    if (els.actionPrompt) {
      els.actionPrompt.textContent = '';
      els.actionPrompt.hidden = true;
    }

    while (state.stepIndex < state.steps.length) {
      const candidate = state.steps[state.stepIndex];
      if (typeof candidate.condition === 'function' && !candidate.condition()) {
        state.stepIndex++;
        continue;
      }
      break;
    }

    if (state.stepIndex >= state.steps.length) {
      completeActiveTutorial('completed');
      return;
    }

    const step = state.steps[state.stepIndex];
    if (state.activeId === 'tour_sidebar_nav' && step.id !== 'nav_open_burger') {
      if (typeof setNavMenuOpen === 'function' && typeof navMenuOpen !== 'undefined' && !navMenuOpen) {
        setNavMenuOpen(true);
      }
    }
    const actionReq = isStepActionRequired(step);
    const isSilent = Boolean(step.silentCue || step.compactPrompt);
    syncBodyAndAppClasses();

    const multiEls = step.multiTargetSelector ? resolveStepMultiTargets(step) : [];
    const targetEl = multiEls[0] || resolveFirstVisible(step.target);
    if (!targetEl) {
      if (state.retryCount < 10) {
        state.retryCount++;
        state.retryTimer = window.setTimeout(() => renderCurrentStep({ focusBubble }), 65);
        return;
      }
      state.retryCount = 0;
      stopActiveTutorial({ restoreFocus: false });
      return;
    }

    state.retryCount = 0;
    state.targetEl = targetEl;
    saveStepProgress(state.activeId, step.id);

    const eligibleSteps = state.steps.filter((s, idx) =>
      idx === state.stepIndex || typeof s.condition !== 'function' || s.condition()
    );
    const currentPos = Math.max(1, eligibleSteps.indexOf(step) + 1);
    const totalCount = Math.max(currentPos, eligibleSteps.length);
    const progressLabel = `${currentPos} of ${totalCount}`;

    if (isSilent) {
      els.bubble.hidden = true;
      els.bubble.classList.remove('is-action-step');
      els.nextBtn.hidden = true;
      if (els.actionsRow) els.actionsRow.hidden = true;
    } else {
      els.bubble.hidden = false;
      const resolvedTitle = typeof step.title === 'function' ? step.title() : (step.title || '');
      els.tag.textContent = step.tag || 'TUTORIAL';
      els.progress.textContent = progressLabel;
      els.title.textContent = resolvedTitle;
      els.desc.textContent = typeof step.desc === 'function' ? step.desc() : (step.desc || '');

      const promptText = typeof step.actionPrompt === 'function' ? step.actionPrompt() : (step.actionPrompt || '');
      const actionPromptActive = actionReq && Boolean(String(promptText).trim());
      if (actionPromptActive) {
        els.actionPrompt.textContent = promptText;
        els.actionPrompt.hidden = false;
      } else {
        els.actionPrompt.textContent = '';
        els.actionPrompt.hidden = true;
      }

      els.bubble.classList.toggle('is-action-step', actionReq);
      els.nextBtn.hidden = actionReq;
      const isLast = currentPos === totalCount;
      els.nextBtn.textContent = step.nextLabel || (isLast ? 'Finish' : 'Next');
      if (els.actionsRow) {
        els.actionsRow.hidden = Boolean(els.nextBtn.hidden && (!els.skipBtn || els.skipBtn.hidden));
      }

      if (els.announcer) {
        els.announcer.textContent = `${resolvedTitle}. Step ${progressLabel}. ${els.desc.textContent} ${actionReq ? promptText : ''}`.trim();
      }
    }

    els.layer.hidden = false;
    els.layer.setAttribute('aria-hidden', 'false');

    scrollTargetIntoViewIfNeeded(targetEl);
    positionSpotlightAndBubble();
    startPositionTracking();

    if (focusBubble) {
      window.requestAnimationFrame(() => {
        if (!state.activeId) return;
        getTutorialFocusTarget(step)?.focus({ preventScroll: true });
      });
    }
  }

  function stopActiveTutorial({ restoreFocus = true } = {}) {
    stopPositionTracking();
    const els = getEls();
    if (state.activeId) {
      if (typeof releaseAllTouchControls === 'function') releaseAllTouchControls();
      if (typeof keys !== 'undefined') {
        keys.a.pressed = false;
        if (!state.physicalRightHeld) keys.d.pressed = false;
      }
    }
    if (els.layer) {
      els.layer.hidden = true;
      els.layer.setAttribute('aria-hidden', 'true');
      els.layer.classList.remove('is-no-skip-guide');
    }
    if (els.spotlight) {
      els.spotlight.hidden = false;
      els.spotlight.classList.remove('is-silent-target');
    }
    if (els.multiSpotlights) {
      els.multiSpotlights.hidden = true;
      els.multiSpotlights.innerHTML = '';
    }
    if (els.silentCue) {
      els.silentCue.hidden = true;
      els.silentCue.innerHTML = '';
      els.silentCue.classList.remove('is-desktop-cue', 'is-touch-cue');
    }
    if (els.skipBtn) els.skipBtn.hidden = false;
    if (els.actionsRow) els.actionsRow.hidden = false;
    if (els.bubble) {
      els.bubble.hidden = false;
      els.bubble.setAttribute('aria-modal', 'false');
    }
    if (els.actionPrompt) {
      els.actionPrompt.textContent = '';
      els.actionPrompt.hidden = true;
    }
    state.activeId = null;
    state.steps = [];
    state.stepIndex = 0;
    state.targetEl = null;
    state.retryCount = 0;
    syncBodyAndAppClasses();

    if (restoreFocus && state.returnFocusEl && state.returnFocusEl.isConnected && typeof state.returnFocusEl.focus === 'function') {
      try {
        state.returnFocusEl.focus({ preventScroll: true });
      } catch {}
    }
    state.returnFocusEl = null;
  }

  function clearProgressForRestart(tutorialId) {
    const store = loadStore();
    if (store.progress && store.progress[tutorialId]) {
      delete store.progress[tutorialId];
      saveStore(store);
    }
  }

  function completeActiveTutorial(status = 'completed') {
    const finishedId = state.activeId;
    if (!finishedId) return;
    const wasReplay = Boolean(state.activeIsReplay || state.sequence?.isReplay);
    const existingStatus = getTutorialStatus(finishedId);
    if (!wasReplay || (status === 'completed' && existingStatus !== 'completed')) {
      setTutorialStatus(finishedId, status);
    } else {
      clearProgressForRestart(finishedId);
    }
    state.activeIsReplay = false;
    stopActiveTutorial({ restoreFocus: true });

    if (finishedId === 'game_skill_tree') {
      state.activeSkillPointAward = null;
      const banner = document.getElementById('spEarnedBanner');
      if (banner) banner.hidden = true;
      if (!wasReplay) {
        markFirstSkillTreeSequenceDone(status);
      }
    }

    if (finishedId === 'tour_sidebar_nav' && typeof setNavMenuOpen === 'function' && typeof navMenuOpen !== 'undefined' && navMenuOpen) {
      setNavMenuOpen(false);
    }

    if (state.sequence?.kind === 'game' && state.sequence.pending) {
      state.sequence.pending.delete(finishedId);
      if (state.sequence.pending.size === 0) {
        state.sequence = null;
      }
    }

    const postStore = loadStore();
    if (postStore.postResetGameSequence && FULL_GAME_GUIDE_SEQUENCE.every((id) => Boolean(postStore.completed[id]))) {
      postStore.postResetGameSequence = false;
      saveStore(postStore);
    }

    if (typeof dashboardView !== 'undefined' && (dashboardView === 'settings' || dashboardView === 'rewards') && typeof playViewActive !== 'undefined' && !playViewActive && typeof renderDashboard === 'function') {
      renderDashboard();
    }

    window.setTimeout(() => {
      if (state.sequence?.kind === 'tour' && status === 'completed') {
        if (state.sequence.queue && state.sequence.queue.length > 0) {
          const nextTourId = state.sequence.queue.shift();
          const nextView = TOUR_SEQUENCE_VIEW_MAP[nextTourId] || 'quest';
          if (typeof dashboardView !== 'undefined' && dashboardView !== nextView && typeof showDashboard === 'function') {
            showDashboard(nextView);
            window.setTimeout(() => {
              startTutorial(nextTourId, { force: true, isReplay: state.sequence?.isReplay !== false });
            }, 140);
          } else {
            startTutorial(nextTourId, { force: true, isReplay: state.sequence?.isReplay !== false });
          }
          return;
        }
        state.sequence = null;
        return;
      }
      if (state.pendingRemedialTutorial && !state.activeId && typeof battle !== 'undefined' && battle.phase === 'remedial') {
        state.pendingRemedialTutorial = false;
        startTutorial('game_remedial_drill');
        return;
      }
      if (state.pendingSkillPointAwards.length > 0 && canShowQueuedSkillPointPopup()) {
        flushPendingSkillPointPopup(0);
        return;
      }
      if (finishedId === 'game_core' && typeof playViewActive !== 'undefined' && playViewActive) {
        if (typeof mode !== 'undefined' && mode === 'battle') {
          maybeTriggerContextualTutorial();
        }
      } else if (finishedId === 'guide_skill_tree' || finishedId === 'guide_world_map') {
        return;
      } else {
        maybeTriggerContextualTutorial();
      }
    }, 120);
  }

  function skipActiveTutorialOrSequence() {
    const activeId = state.activeId;
    if (!activeId) return;
    if (activeId === 'game_sp_earned') {
      state.activeSkillPointAward = null;
      stopActiveTutorial({ restoreFocus: true });
      if (state.pendingSkillPointAwards.length > 0) {
        flushPendingSkillPointPopup(140);
      }
      return;
    }
    if (activeId === 'game_skill_tree') {
      state.activeSkillPointAward = null;
      const banner = document.getElementById('spEarnedBanner');
      if (banner) banner.hidden = true;
    }
    const isReplaySeq = Boolean(state.sequence?.isReplay || state.activeIsReplay);
    const store = loadStore();
    const skipEntireGameSeq = Boolean(
      !isReplaySeq &&
      ((state.sequence?.kind === 'game') ||
        (store.postResetGameSequence && FULL_GAME_GUIDE_SEQUENCE.includes(activeId)) ||
        (!state.sequence && activeId === 'game_core'))
    );

    if (isReplaySeq) {
      clearProgressForRestart(activeId);
      state.sequence = null;
      state.activeIsReplay = false;
      stopActiveTutorial({ restoreFocus: true });
      if (activeId === 'tour_sidebar_nav' && typeof setNavMenuOpen === 'function' && typeof navMenuOpen !== 'undefined' && navMenuOpen) {
        setNavMenuOpen(false);
      }
      if (state.pendingSkillPointAwards.length > 0) {
        flushPendingSkillPointPopup(140);
      }
      return;
    }

    if (skipEntireGameSeq) {
      for (const gid of SKIPPABLE_CORE_GAME_SEQUENCE) {
        if (store.completed[gid] !== 'completed') {
          store.completed[gid] = 'skipped';
        }
        delete store.progress[gid];
      }
      if (activeId && !SKIPPABLE_CORE_GAME_SEQUENCE.includes(activeId)) {
        if (store.completed[activeId] !== 'completed') store.completed[activeId] = 'skipped';
        delete store.progress[activeId];
      }
      store.postResetGameSequence = false;
      saveStore(store);
      state.sequence = null;
      state.activeIsReplay = false;
      stopActiveTutorial({ restoreFocus: true });
      if (typeof refreshAchievements === 'function') {
        try { refreshAchievements({ silent: true }); } catch {}
      }
      if (typeof dashboardView !== 'undefined' && (dashboardView === 'settings' || dashboardView === 'rewards') && typeof playViewActive !== 'undefined' && !playViewActive && typeof renderDashboard === 'function') {
        renderDashboard();
      }
      if (state.pendingRemedialTutorial && typeof battle !== 'undefined' && battle.phase === 'remedial') {
        state.pendingRemedialTutorial = false;
        startTutorial('game_remedial_drill');
        return;
      }
      if (state.pendingSkillPointAwards.length > 0) {
        flushPendingSkillPointPopup(140);
      }
      return;
    }

    state.sequence = null;
    completeActiveTutorial('skipped');
  }

  function advanceStep() {
    const step = currentStep();
    if (!step) return;
    if (state.activeId === 'game_sp_earned') {
      state.activeSkillPointAward = null;
      stopActiveTutorial({ restoreFocus: false });
      if (typeof openSkillTree === 'function') openSkillTree();
      return;
    }
    if (typeof step.onNext === 'function') {
      try { step.onNext(); } catch {}
    }
    state.stepIndex++;
    state.retryCount = 0;
    if (state.stepIndex >= state.steps.length) {
      completeActiveTutorial('completed');
    } else {
      renderCurrentStep({ focusBubble: true });
    }
  }

  function startTutorial(tutorialId, { force = false, startAtStepId = null, isReplay = false } = {}) {
    if (!isAppReadyWithProfile()) return false;
    if (tutorialId !== 'game_sp_earned' && !force && !isReplay && isTutorialFinished(tutorialId)) return false;

    if (force || isReplay) {
      state.suppressAutoTourView = null;
    }

    if (tutorialId !== 'game_sp_earned') {
      clearProgressForRestart(tutorialId);
    }

    if (tutorialId === 'tour_sidebar_nav' && (force || isReplay) && typeof setNavMenuOpen === 'function') {
      setNavMenuOpen(false);
    }

    const steps = buildTutorialSteps(tutorialId);
    if (!steps.length) return false;

    if (typeof hideUiHoverBubble === 'function') hideUiHoverBubble();

    state.returnFocusEl = document.activeElement;
    state.activeId = tutorialId;
    state.activeIsReplay = Boolean(isReplay || state.sequence?.isReplay);
    state.steps = steps;
    state.retryCount = 0;

    let startIdx = 0;
    const resumeStepId = startAtStepId || (!force && !isReplay ? getSavedStepId(tutorialId) : null);
    if (resumeStepId) {
      const foundIdx = steps.findIndex((s) => s.id === resumeStepId);
      if (foundIdx >= 0) startIdx = foundIdx;
    }

    if (tutorialId === 'game_battle' && typeof battle !== 'undefined') {
      if (battle.phase === 'question') startIdx = 1;
      else if (battle.phase === 'feedback') startIdx = 2;
      else startIdx = 0;
    }

    if (tutorialId === 'game_skill_tree' && typeof skillTreeOpen !== 'undefined' && skillTreeOpen && !startAtStepId) {
      const overviewIdx = steps.findIndex((s) => s.id === 'sp_tree_overview');
      startIdx = overviewIdx >= 0 ? overviewIdx : 0;
    }

    state.stepIndex = startIdx;
    const els = getEls();
    if (els.layer) {
      els.layer.classList.add('is-instant-place');
    }
    renderCurrentStep({ focusBubble: true });
    if (els.layer) {
      window.requestAnimationFrame(() => {
        els.layer.classList.remove('is-instant-place');
      });
    }
    return true;
  }

  function replayFullPageTour() {
    if (!isAppReadyWithProfile()) return false;
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen && typeof closeSkillTree === 'function') closeSkillTree();
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen && typeof closeWorldMap === 'function') closeWorldMap();
    if (typeof playViewActive !== 'undefined' && playViewActive && typeof showDashboard === 'function') {
      showDashboard('quest');
    }
    state.suppressAutoTourView = null;
    state.sequence = {
      kind: 'tour',
      queue: FULL_PAGE_TOUR_SEQUENCE.slice(1),
      isReplay: true,
    };
    const firstTourId = FULL_PAGE_TOUR_SEQUENCE[0];
    if (typeof dashboardView !== 'undefined' && dashboardView !== 'quest' && typeof showDashboard === 'function') {
      showDashboard('quest');
    }
    if (typeof setNavMenuOpen === 'function') setNavMenuOpen(false);
    return startTutorial(firstTourId, { force: true, isReplay: true });
  }

  function replayFullGameGuide() {
    if (!isAppReadyWithProfile()) return false;
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen && typeof closeSkillTree === 'function') closeSkillTree();
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen && typeof closeWorldMap === 'function') closeWorldMap();
    if (typeof setNavMenuOpen === 'function' && typeof navMenuOpen !== 'undefined' && navMenuOpen) setNavMenuOpen(false);
    state.suppressAutoTourView = null;
    const pendingSet = new Set(FULL_GAME_GUIDE_SEQUENCE);
    pendingSet.delete('game_core');
    state.sequence = {
      kind: 'game',
      pending: pendingSet,
      isReplay: true,
    };
    if (typeof playViewActive === 'undefined' || !playViewActive) {
      if (typeof startPracticeAdventure === 'function') {
        startPracticeAdventure();
      }
      window.setTimeout(() => {
        if (typeof playViewActive !== 'undefined' && playViewActive) {
          startTutorial('game_core', { force: true, isReplay: true });
        }
      }, 140);
      return true;
    }
    return startTutorial('game_core', { force: true, isReplay: true });
  }

  function replayBattleTutorial() {
    if (!isAppReadyWithProfile()) return false;
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen && typeof closeSkillTree === 'function') closeSkillTree();
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen && typeof closeWorldMap === 'function') closeWorldMap();
    if (typeof setNavMenuOpen === 'function' && typeof navMenuOpen !== 'undefined' && navMenuOpen) setNavMenuOpen(false);
    stopActiveTutorial({ restoreFocus: false });
    state.suppressAutoTourView = null;
    state.sequence = null;
    state.pendingBattleReplay = true;

    const launchBattleReplay = () => {
      try {
        if (typeof mode === 'undefined' || mode !== 'battle' || typeof battle === 'undefined' || !battle.enemy) {
          const foe = (typeof enemies !== 'undefined' && Array.isArray(enemies))
            ? (enemies.find((e) => e && e.alive) || enemies[0])
            : null;
          if (foe && typeof startBattle === 'function') {
            startBattle(foe);
          }
          if (typeof INTRO_END !== 'undefined') {
            try { introT = INTRO_END; } catch {}
          }
          try { snapshot = null; } catch {}
          if (typeof mode !== 'undefined') {
            try { mode = 'battle'; } catch {}
          }
          if (typeof battle !== 'undefined') {
            battle.phase = 'choose';
            if (typeof renderBattle === 'function') renderBattle();
          }
        }
      } finally {
        state.pendingBattleReplay = false;
      }
      window.setTimeout(() => {
        if (typeof mode !== 'undefined' && mode === 'battle') {
          stopActiveTutorial({ restoreFocus: false });
          startTutorial('game_battle', { force: true, startAtStepId: 'battle_choose_card', isReplay: true });
        }
      }, 60);
    };

    if (typeof playViewActive === 'undefined' || !playViewActive || (typeof mode !== 'undefined' && mode !== 'battle')) {
      if (typeof practiceRunActive === 'undefined' || !practiceRunActive) {
        if (typeof startPracticeAdventure === 'function') {
          startPracticeAdventure();
        }
      }
      window.setTimeout(launchBattleReplay, 120);
      return true;
    }
    launchBattleReplay();
    return true;
  }

  // --- First-Time Skill-Point -> Skill Tree Tutorial Trigger & Queue ---
  function isFirstSkillTreeSequenceDone() {
    const store = loadStore();
    return Boolean(store.spGuideTriggered || store.completed.game_skill_tree);
  }

  function markFirstSkillTreeSequenceDone(status = null) {
    const store = loadStore();
    store.spGuideTriggered = true;
    if (status && store.completed.game_skill_tree !== 'completed') {
      store.completed.game_skill_tree = status;
    }
    delete store.progress.game_skill_tree;
    saveStore(store);
  }

  function canShowQueuedSkillPointPopup() {
    if (!isAppReadyWithProfile() || state.activeId) return false;
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen) return false;
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen) return false;
    if (isOverlayModalBlockingPageTours()) return false;
    if (typeof mode !== 'undefined' && mode === 'battle' && typeof battle !== 'undefined') {
      if (['feedback', 'remedial', 'reward', 'upgrade', 'won', 'lost', 'dying'].includes(battle.phase)) {
        return false;
      }
    }
    return true;
  }

  function flushPendingSkillPointPopup(delayMs = 120) {
    if (!state.pendingSkillPointAwards.length) return false;
    if (isFirstSkillTreeSequenceDone()) {
      state.pendingSkillPointAwards = [];
      return false;
    }
    if (state.spPopupTimer) {
      window.clearTimeout(state.spPopupTimer);
      state.spPopupTimer = 0;
    }
    const run = () => {
      state.spPopupTimer = 0;
      if (!state.pendingSkillPointAwards.length || !canShowQueuedSkillPointPopup()) return;
      if (isFirstSkillTreeSequenceDone()) {
        state.pendingSkillPointAwards = [];
        return;
      }
      const nextAward = state.pendingSkillPointAwards.shift();
      state.pendingSkillPointAwards = [];
      state.activeSkillPointAward = nextAward;
      state.pendingSkillTreeKey = nextAward.treeKey || null;
      // Ensure the skill-point notification banner is visible for Step 1 to highlight
      if (typeof showSkillPointEarnedBanner === 'function') {
        showSkillPointEarnedBanner(nextAward.category, { persistForTutorial: true });
      }
      markFirstSkillTreeSequenceDone();
      startTutorial('game_skill_tree', { force: true, startAtStepId: 'sp_notify' });
    };
    if (delayMs <= 0) {
      run();
    } else {
      state.spPopupTimer = window.setTimeout(run, delayMs);
    }
    return true;
  }

  function onSkillPointEarned(category, treeKey, awardId) {
    if (!isAppReadyWithProfile()) return;
    // Only show the first-time Skill Tree sequence ONCE per player's first skill-point experience
    if (isFirstSkillTreeSequenceDone()) return;
    if (state.activeId === 'game_skill_tree' || state.pendingSkillPointAwards.length > 0) return;
    let resolvedId = awardId ? String(awardId) : '';
    if (!resolvedId) {
      let earnedCount = 0;
      if (treeKey && typeof skillProgress !== 'undefined' && skillProgress?.[treeKey]) {
        const interval = typeof SKILL_POINT_INTERVAL === 'number' && SKILL_POINT_INTERVAL > 0 ? SKILL_POINT_INTERVAL : 5;
        earnedCount = Math.floor((skillProgress[treeKey].correct || 0) / interval);
      }
      resolvedId = `${treeKey || category || 'sp'}:${earnedCount}`;
    }
    if (state.seenSkillPointAwardIds.has(resolvedId)) return;
    state.seenSkillPointAwardIds.add(resolvedId);
    state.pendingSkillPointAwards.push({
      category: category || '',
      treeKey: treeKey || null,
      awardId: resolvedId,
    });
    if (canShowQueuedSkillPointPopup()) {
      flushPendingSkillPointPopup(140);
    }
  }

  // --- Automatic First-Visit Context Detection ---
  function maybeTriggerContextualTutorial() {
    if (!isAppReadyWithProfile() || state.pendingBattleReplay) return;
    const gameSeq = state.sequence?.kind === 'game' ? state.sequence : null;
    const takeGameSeq = (id) => {
      if (!gameSeq?.pending?.has(id)) return false;
      gameSeq.pending.delete(id);
      if (gameSeq.pending.size === 0) state.sequence = null;
      return true;
    };

    // 1. Check active overlays first (Skill Tree & World Map)
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen) {
      state.suppressAutoTourView = null;
      if (state.activeId === 'guide_skill_tree') return;
      if (state.activeId === 'game_skill_tree') {
        const cur = currentStep();
        if (cur && cur.id !== 'sp_tree_overview') {
          const overviewIdx = state.steps.findIndex((s) => s.id === 'sp_tree_overview');
          if (overviewIdx >= 0) {
            state.stepIndex = overviewIdx;
            renderCurrentStep({ focusBubble: true });
          }
        }
        return;
      }
      if (state.activeId === 'game_sp_earned') {
        state.activeSkillPointAward = null;
        stopActiveTutorial({ restoreFocus: false });
      } else if (state.activeId && state.activeId !== 'game_skill_tree') {
        stopActiveTutorial({ restoreFocus: false });
      }
      // Do NOT auto-trigger game_skill_tree merely because the player opened the Skill Tree;
      // only trigger here if an explicit full-guide replay sequence requested it.
      if (!state.activeId && takeGameSeq('game_skill_tree')) {
        startTutorial('game_skill_tree', { force: true, startAtStepId: 'sp_tree_overview', isReplay: Boolean(gameSeq?.isReplay) });
      }
      return;
    }

    if (typeof worldMapOpen !== 'undefined' && worldMapOpen) {
      state.suppressAutoTourView = null;
      if (state.activeId === 'guide_world_map') return;
      if (state.activeId === 'game_sp_earned') {
        state.activeSkillPointAward = null;
        stopActiveTutorial({ restoreFocus: false });
      } else if (state.activeId && state.activeId !== 'game_world_map') {
        stopActiveTutorial({ restoreFocus: false });
      }
      if (!state.activeId && (takeGameSeq('game_world_map') || !isTutorialFinished('game_world_map'))) {
        startTutorial('game_world_map', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
      }
      return;
    }

    if (state.activeId === 'game_skill_tree' && typeof skillTreeOpen !== 'undefined' && !skillTreeOpen) {
      const cur = currentStep();
      if (cur && cur.id === 'sp_tree_overview') {
        stopActiveTutorial({ restoreFocus: false });
      }
    }
    if (state.activeId === 'game_world_map') {
      stopActiveTutorial({ restoreFocus: false });
    }

    if (isOverlayModalBlockingPageTours()) return;

    if (typeof battle === 'undefined' || battle.phase !== 'remedial') {
      state.pendingRemedialTutorial = false;
    }

    // Pending Remedial Drill tutorial takes priority once active tutorial finishes during remedial phase
    if (state.pendingRemedialTutorial && !state.activeId && typeof battle !== 'undefined' && battle.phase === 'remedial') {
      state.pendingRemedialTutorial = false;
      startTutorial('game_remedial_drill');
      return;
    }

    // Pending Skill-Point Earned popup takes priority once any active tutorial or battle feedback clears
    if (state.pendingSkillPointAwards.length > 0 && canShowQueuedSkillPointPopup()) {
      flushPendingSkillPointPopup(0);
      return;
    }

    // 2. In-Play Gameplay Lessons
    if (typeof playViewActive !== 'undefined' && playViewActive) {
      state.suppressAutoTourView = null;
      if (state.sequence?.kind === 'tour') state.sequence = null;
      if (state.activeId && state.activeId.startsWith('tour_')) {
        stopActiveTutorial({ restoreFocus: false });
      }

      if (typeof mode !== 'undefined' && mode === 'explore' && !isMultiplayer()) {
        if (!state.activeId) {
          if (takeGameSeq('game_core') || !isTutorialFinished('game_core')) {
            startTutorial('game_core', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
            return;
          }
          if (isTutorialFinished('game_core') && isTutorialFinished('game_battle') &&
              (takeGameSeq('game_hud') || !isTutorialFinished('game_hud'))) {
            startTutorial('game_hud', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
            return;
          }
        }
        return;
      }

      if (typeof mode !== 'undefined' && mode === 'battle') {
        if (state.activeId === 'game_core' || state.activeId === 'game_hud') {
          stopActiveTutorial({ restoreFocus: false });
        }
        if (!state.activeId && typeof battle !== 'undefined') {
          if (battle.phase === 'remedial') {
            if (takeGameSeq('game_remedial_drill') || !isTutorialFinished('game_remedial_drill')) {
              startTutorial('game_remedial_drill', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
              return;
            }
            return;
          }
          if (battle.phase === 'reward' && (takeGameSeq('game_card_reward') || !isTutorialFinished('game_card_reward'))) {
            startTutorial('game_card_reward', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
            return;
          }
          if (battle.phase === 'upgrade' && (takeGameSeq('game_level_up') || !isTutorialFinished('game_level_up'))) {
            startTutorial('game_level_up', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
            return;
          }
          if ((battle.phase === 'choose' || battle.phase === 'question' || battle.phase === 'feedback') &&
              (takeGameSeq('game_battle') || !isTutorialFinished('game_battle'))) {
            startTutorial('game_battle', { force: Boolean(gameSeq), isReplay: Boolean(gameSeq?.isReplay) });
            return;
          }
        }
        return;
      }
      return;
    }

    // 3. Dashboard Page Tours (when !playViewActive)
    if (state.sequence?.kind === 'game') state.sequence = null;
    if (state.activeId && state.activeId.startsWith('game_') && state.activeId !== 'game_skill_tree') {
      stopActiveTutorial({ restoreFocus: false });
    }

    const view = typeof dashboardView !== 'undefined' ? dashboardView : 'quest';
    if (state.suppressAutoTourView) {
      if (view === state.suppressAutoTourView) return;
      state.suppressAutoTourView = null;
    }

    if (state.activeId === 'tour_sidebar_nav') {
      return;
    }

    if (state.activeId && state.activeId.startsWith('tour_')) {
      const expectedPrefix =
        view === 'quest' ? 'tour_quest'
        : view === 'tracker' ? 'tour_tracker'
        : view === 'leaderboards' ? 'tour_leaderboards'
        : view === 'rewards' ? 'tour_rewards'
        : view === 'settings' ? 'tour_settings'
        : view === 'practice' ? 'tour_practice_'
        : '';
      if (!expectedPrefix || !state.activeId.startsWith(expectedPrefix)) {
        stopActiveTutorial({ restoreFocus: false });
      }
    }

    if (view === 'quest' && !state.activeId) {
      if (!isTutorialFinished('tour_sidebar_nav')) {
        startTutorial('tour_sidebar_nav');
      } else if (!isTutorialFinished('tour_quest')) {
        startTutorial('tour_quest');
      }
    } else if (view === 'tracker' && !state.activeId && !isTutorialFinished('tour_tracker')) {
      startTutorial('tour_tracker');
    } else if (view === 'leaderboards' && !state.activeId && !isTutorialFinished('tour_leaderboards')) {
      startTutorial('tour_leaderboards');
    } else if (view === 'rewards' && !state.activeId && !isTutorialFinished('tour_rewards')) {
      startTutorial('tour_rewards');
    } else if (view === 'settings' && !state.activeId && !isTutorialFinished('tour_settings')) {
      startTutorial('tour_settings');
    } else if (view === 'practice' && typeof practice !== 'undefined') {
      if (practice.mode === 'menu') {
        if (state.activeId && state.activeId !== 'tour_practice_menu') {
          stopActiveTutorial({ restoreFocus: false });
        }
        if (!state.activeId && !isTutorialFinished('tour_practice_menu')) {
          startTutorial('tour_practice_menu');
        }
      } else if (practice.mode === 'quiz') {
        if (state.activeId && state.activeId !== 'tour_practice_quiz') {
          stopActiveTutorial({ restoreFocus: false });
        }
        if (!state.activeId && !isTutorialFinished('tour_practice_quiz')) {
          startTutorial('tour_practice_quiz');
        }
      } else if (practice.mode === 'done') {
        if (state.activeId && state.activeId !== 'tour_practice_done') {
          stopActiveTutorial({ restoreFocus: false });
        }
        if (!state.activeId && !isTutorialFinished('tour_practice_done')) {
          startTutorial('tour_practice_done');
        }
      }
    }
  }

  function nudgePlayerTowardNearestEnemy(dirKey) {
    if (typeof mode === 'undefined' || mode !== 'explore' || typeof player === 'undefined' || !Array.isArray(enemies)) return;
    const alive = enemies.filter((e) => e && e.alive);
    if (!alive.length) return;
    const px = player.hitbox ? player.hitbox.position.x : player.position.x;
    const nearest = alive.sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px))[0];
    if (!nearest) return;
    const moveKey = (dirKey === 'a' || dirKey === 'd') ? dirKey : (nearest.x >= px ? 'd' : 'a');
    keys[moveKey].pressed = true;
    window.setTimeout(() => {
      keys[moveKey].pressed = false;
    }, 280);
  }

  function triggerTutorialDoorFeedback() {
    if (typeof tryDoor === 'function') {
      const used = tryDoor();
      if (!used && typeof renderExplore === 'function') {
        renderExplore('The door is locked. Defeat every virus in this room first.');
      }
    }
  }

  // --- Input Gating & Event Hooks ---
  function isActionLocked() {
    return Boolean(state.activeId && currentStep());
  }

  function shouldFreezeEnemies() {
    const step = currentStep();
    return Boolean(state.activeId === 'game_core' && step && step.freezeEnemies);
  }

  function shouldHoldEncounter() {
    const step = currentStep();
    return Boolean(shouldFreezeEnemies() || (state.activeId === 'game_core' && step && step.holdEncounter));
  }

  function scheduleCoreStepAdvance(expectedStepId, delayMs = 220) {
    if (state.silentMoveTimer) return;
    state.silentMoveTimer = window.setTimeout(() => {
      state.silentMoveTimer = 0;
      if (state.activeId === 'game_core' && currentStep()?.id === expectedStepId) {
        advanceStep();
      }
    }, delayMs);
  }

  function interceptKey(normalizedKey, rawKey, down, repeat) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    const k = String(normalizedKey || '').toLowerCase();
    const rk = String(rawKey || '').toLowerCase();
    const actionPromptActive = hasVisibleActionPrompt(step);
    const actionButtonFocused = actionPromptActive &&
      document.activeElement instanceof Element &&
      Boolean(getAllowedActionControl(document.activeElement, step)) &&
      isKeyboardActivation(k, rk);

    if (isOverlayGuide()) {
      if (!down) return true;
      if (actionPromptActive && (isActionPromptKey(step, k, rk) || actionButtonFocused)) {
        const tutorialId = state.activeId;
        setTutorialStatus(tutorialId, 'completed');
        stopActiveTutorial({ restoreFocus: false });
        if (tutorialId === 'guide_skill_tree' && typeof closeSkillTree === 'function') closeSkillTree();
        else if (typeof closeWorldMap === 'function') closeWorldMap();
      }
      return true;
    }

    if (!down) {
      if (k === 'd' || rk === 'arrowright') state.physicalRightHeld = false;
      if ((k === 'a' || k === 'd') && typeof keys !== 'undefined' && keys[k]) {
        keys[k].pressed = false;
      }
      return actionPromptActive && isActionPromptKey(step, k, rk) ? false : true;
    }

    if (!actionPromptActive && !step.allowOptionalAction && state.activeId !== 'game_sp_earned') return true;
    if (actionButtonFocused) return true;
    if (repeat) return true;

    if (state.activeId === 'game_sp_earned') {
      if (k === 'u') {
        state.activeSkillPointAward = null;
        stopActiveTutorial({ restoreFocus: false });
        if (typeof openSkillTree === 'function') openSkillTree();
        return true;
      }
      if (rk === 'escape') {
        skipActiveTutorialOrSequence();
        return true;
      }
      return true;
    }

    if (!isActionPromptKey(step, k, rk)) {
      if (typeof keys !== 'undefined') {
        keys.a.pressed = false;
        if (!state.physicalRightHeld) keys.d.pressed = false;
      }
      return true;
    }

    if (state.activeId === 'game_core') {
      if (step.id === 'core_move_lr') {
        if (k === 'a' || k === 'd' || rk === 'arrowleft' || rk === 'arrowright') {
          if (k === 'd' || rk === 'arrowright') state.physicalRightHeld = true;
          scheduleCoreStepAdvance('core_move_lr', 220);
          return false;
        }
        return true;
      }
      if (step.id === 'core_jump') {
        if (k === 'w' || k === 'space' || rk === ' ') {
          if (typeof player !== 'undefined' && player && player.velocity.y === 0) {
            player.velocity.y = -22;
          }
          scheduleCoreStepAdvance('core_jump', 220);
          return true;
        }
        return true;
      }
      if (step.id === 'core_door') {
        if (k === 'up' || rk === 'arrowup') {
          if (typeof tryDoor === 'function') tryDoor();
          scheduleCoreStepAdvance('core_door', 160);
          return true;
        }
        return true;
      }
      if (step.id === 'core_approach_enemy') {
        return !isActionPromptKey(step, k, rk);
      }
    }

    if (state.activeId === 'game_skill_tree') {
      if ((step.id === 'sp_hud_control' || step.id === 'sp_open_tree') && k === 'u') {
        const banner = document.getElementById('spEarnedBanner');
        if (banner) banner.hidden = true;
        if (typeof openSkillTree === 'function') openSkillTree();
        return true;
      }
    }

    if (state.activeId === 'game_world_map' && step.id === 'map_close' && (k === 'm' || rk === 'escape')) {
      setTutorialStatus('game_world_map', 'completed');
      stopActiveTutorial({ restoreFocus: false });
      if (typeof closeWorldMap === 'function') closeWorldMap();
      return true;
    }

    if (state.activeId === 'tour_sidebar_nav' && step.id === 'nav_open_burger' && (k === 'enter' || k === 'space' || rk === ' ')) {
      const toggleBtn = document.getElementById('navToggleButton');
      if (toggleBtn && document.activeElement !== toggleBtn && typeof setNavMenuOpen === 'function') {
        setNavMenuOpen(true);
        return true;
      }
      return false;
    }

    return false;
  }

  function interceptEscape(event) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    if (state.activeId === 'game_sp_earned') {
      event.preventDefault();
      skipActiveTutorialOrSequence();
      return true;
    }
    if (!hasVisibleActionPrompt(step) || !isActionPromptKey(step, 'escape', 'escape')) {
      event.preventDefault();
      return true;
    }
    if (isOverlayGuide()) {
      event.preventDefault();
      const tutorialId = state.activeId;
      setTutorialStatus(tutorialId, 'completed');
      stopActiveTutorial({ restoreFocus: false });
      if (tutorialId === 'guide_skill_tree' && typeof closeSkillTree === 'function') closeSkillTree();
      else if (typeof closeWorldMap === 'function') closeWorldMap();
      return true;
    }
    if (state.activeId === 'game_world_map' && step.id === 'map_close') {
      event.preventDefault();
      setTutorialStatus('game_world_map', 'completed');
      stopActiveTutorial({ restoreFocus: false });
      if (typeof closeWorldMap === 'function') closeWorldMap();
      return true;
    }
    if (typeof playViewActive !== 'undefined' && playViewActive) {
      event.preventDefault();
      return true;
    }
    event.preventDefault();
    return true;
  }

  function interceptTouchButton(key, btn, event) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    if (getAllowedActionControl(btn, step)) return false;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    return true;
  }

  function onTouchButtonAction(key) {
    const step = currentStep();
    if (!state.activeId || !step) return;
    if (state.activeId === 'game_core') {
      if (step.id === 'core_move_lr' && (key === 'a' || key === 'd')) {
        scheduleCoreStepAdvance('core_move_lr', 220);
      } else if (step.id === 'core_jump' && key === 'w') {
        scheduleCoreStepAdvance('core_jump', 220);
      } else if (step.id === 'core_door' && key === 'up') {
        scheduleCoreStepAdvance('core_door', 160);
      }
    }
  }

  function interceptPracticeClick(action, el) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    return !getAllowedActionControl(el, step);
  }

  function onPracticeAction(action) {
    const step = currentStep();
    if (state.activeId === 'tour_practice_menu') {
      if (step && step.id === 'p_menu_start_action' && action === 'start') {
        setTutorialStatus('tour_practice_menu', 'completed');
        stopActiveTutorial({ restoreFocus: false });
        window.setTimeout(() => maybeTriggerContextualTutorial(), 80);
        return;
      }
    }
    if (state.activeId === 'tour_practice_quiz') {
      if (step && step.id === 'p_quiz_answer' && action === 'answer') {
        advanceStep();
        return;
      }
      if (step && step.id === 'p_quiz_next' && action === 'next') {
        completeActiveTutorial('completed');
        return;
      }
      if (action === 'back') {
        stopActiveTutorial({ restoreFocus: false });
      }
    }
    window.setTimeout(() => maybeTriggerContextualTutorial(), 60);
  }

  function interceptCombatAction(act, val, btn) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    return !getAllowedActionControl(btn, step);
  }

  function onRewardCardPicked() {
    if (state.activeId === 'game_card_reward') {
      setTutorialStatus('game_card_reward', 'completed');
      stopActiveTutorial({ restoreFocus: false });
    }
  }

  function onUpgradePicked() {
    if (state.activeId === 'game_level_up') {
      setTutorialStatus('game_level_up', 'completed');
      stopActiveTutorial({ restoreFocus: false });
    }
  }

  function onBattleStarted() {
    if (state.activeId === 'game_core') {
      const step = currentStep();
      if (step && (step.id === 'core_approach_enemy' || step.id === 'core_attack')) {
        completeActiveTutorial('completed');
      } else {
        stopActiveTutorial({ restoreFocus: false });
      }
    } else if (state.activeId === 'game_hud') {
      stopActiveTutorial({ restoreFocus: false });
    }
  }

  // --- Guide Button Visibility & Context Tutorial Resolution ---
  function getRelevantContextTutorialId() {
    if (!isAppReadyWithProfile()) return null;
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen) return 'guide_skill_tree';
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen) return 'guide_world_map';
    if (window.mpUI?.isOpen) return null;

    if (typeof playViewActive !== 'undefined' && playViewActive) {
      if (isMultiplayer()) return null;
      if (typeof mode !== 'undefined' && mode === 'battle') {
        if (typeof battle !== 'undefined' && battle.phase === 'remedial') {
          return 'game_remedial_drill';
        }
        if (typeof battle !== 'undefined' && battle.phase === 'reward') {
          return 'game_card_reward';
        }
        if (typeof battle !== 'undefined' && battle.phase === 'upgrade') {
          return 'game_level_up';
        }
        return 'game_battle';
      }
      if (typeof mode !== 'undefined' && mode === 'explore') {
        if (!isTutorialFinished('game_core')) return 'game_core';
        return 'game_hud';
      }
      return null;
    }

    const view = typeof dashboardView !== 'undefined' ? dashboardView : 'quest';
    if (view === 'quest') return 'tour_quest';
    if (view === 'tracker') return 'tour_tracker';
    if (view === 'leaderboards') return 'tour_leaderboards';
    if (view === 'rewards') return 'tour_rewards';
    if (view === 'settings') return 'tour_settings';
    if (view === 'practice' && typeof practice !== 'undefined') {
      if (practice.mode === 'quiz') return 'tour_practice_quiz';
      if (practice.mode === 'done') return 'tour_practice_done';
      return 'tour_practice_menu';
    }
    return null;
  }

  function syncGuideButtonsVisibility() {
    const topBtn = document.getElementById('topbarTourButton');
    const hudBtn = document.getElementById('hudTourButton');
    const inPlay = typeof playViewActive !== 'undefined' && Boolean(playViewActive);
    const relevantId = getRelevantContextTutorialId();
    if (topBtn) {
      topBtn.hidden = Boolean(inPlay || !relevantId);
    }
    if (hudBtn) {
      hudBtn.hidden = Boolean(!inPlay || !relevantId);
    }
  }

  function onBattlePhaseRendered(phase) {
    syncGuideButtonsVisibility();
    if (phase === 'feedback' && state.activeId === 'game_battle') {
      const contBtn = document.querySelector('#panel [data-act="continue"]');
      if (contBtn && contBtn.disabled && typeof triggerEnemyImpact === 'function' && typeof battle !== 'undefined' && battle.pendingAttack) {
        battle.projectileT = -1;
        battle.chargeCard = false;
        battle.projectileQueued = false;
        triggerEnemyImpact();
      }
    }

    if (state.activeId === 'game_battle') {
      const step = currentStep();
      if (phase === 'question' && step && step.id === 'battle_choose_card') {
        advanceStep();
        return;
      }
      if (phase === 'feedback' && step && step.id === 'battle_answer_question') {
        advanceStep();
        return;
      }
      if (phase === 'choose' && step && step.id === 'battle_choose_card') {
        renderCurrentStep({ focusBubble: false });
        return;
      }
    }

    if (state.activeId === 'game_card_reward' && phase === 'reward') {
      renderCurrentStep({ focusBubble: false });
      return;
    }

    if (state.activeId === 'game_level_up' && phase === 'upgrade') {
      renderCurrentStep({ focusBubble: false });
      return;
    }

    if (phase === 'remedial') {
      if (state.activeId === 'game_remedial_drill') {
        renderCurrentStep({ focusBubble: false });
        return;
      }
      if (!isTutorialFinished('game_remedial_drill') || state.sequence?.pending?.has('game_remedial_drill')) {
        if (state.activeId) {
          state.pendingRemedialTutorial = true;
          return;
        }
      } else {
        return;
      }
    } else {
      state.pendingRemedialTutorial = false;
      if (state.activeId === 'game_remedial_drill') {
        stopActiveTutorial({ restoreFocus: false });
      }
    }

    if (phase === 'choose' && !state.activeId && typeof mode !== 'undefined' && mode === 'battle' &&
        (state.sequence?.pending?.has('game_battle') || !isTutorialFinished('game_battle'))) {
      window.requestAnimationFrame(() => maybeTriggerContextualTutorial());
    }
    window.setTimeout(() => maybeTriggerContextualTutorial(), 60);
  }

  function onRemedialAnswer() {
    if (state.activeId === 'game_remedial_drill') {
      const step = currentStep();
      if (step && step.id === 'remedial_answer') {
        completeActiveTutorial('completed');
      }
    }
  }

  function onBattleContinue() {
    if (state.activeId === 'game_battle') {
      const step = currentStep();
      if (step && step.id === 'battle_read_feedback') {
        completeActiveTutorial('completed');
      }
    }
  }

  function onSkillTreeState(isOpen) {
    syncGuideButtonsVisibility();
    if (isOpen) {
      window.requestAnimationFrame(() => maybeTriggerContextualTutorial());
      window.setTimeout(() => maybeTriggerContextualTutorial(), 80);
    } else if (state.activeId === 'guide_skill_tree') {
      const step = currentStep();
      if (step && step.id === 'guide_skill_close') {
        setTutorialStatus('guide_skill_tree', 'completed');
      }
      stopActiveTutorial({ restoreFocus: false });
      flushPendingSkillPointPopup(140);
    } else if (state.activeId === 'game_skill_tree') {
      const step = currentStep();
      const wasReplay = Boolean(state.activeIsReplay || state.sequence?.isReplay);
      if (step && (step.id === 'sp_tree_overview' || step.id === 'sp_close_tree')) {
        if (!wasReplay) {
          setTutorialStatus('game_skill_tree', 'completed');
          markFirstSkillTreeSequenceDone('completed');
        }
      }
      state.activeSkillPointAward = null;
      const banner = document.getElementById('spEarnedBanner');
      if (banner) banner.hidden = true;
      state.activeIsReplay = false;
      stopActiveTutorial({ restoreFocus: false });
      flushPendingSkillPointPopup(140);
    } else {
      flushPendingSkillPointPopup(140);
    }
  }

  function onSkillTreeAction() {
    if (state.activeId === 'game_skill_tree' || state.activeId === 'guide_skill_tree') {
      positionSpotlightAndBubble();
    }
  }

  function onWorldMapState(isOpen) {
    syncGuideButtonsVisibility();
    if (isOpen) {
      window.setTimeout(() => maybeTriggerContextualTutorial(), 80);
    } else if (state.activeId === 'guide_world_map') {
      const step = currentStep();
      if (step && step.id === 'guide_map_close') {
        setTutorialStatus('guide_world_map', 'completed');
      }
      stopActiveTutorial({ restoreFocus: false });
      flushPendingSkillPointPopup(140);
    } else if (state.activeId === 'game_world_map') {
      const step = currentStep();
      if (step && step.id === 'map_close') {
        setTutorialStatus('game_world_map', 'completed');
      }
      stopActiveTutorial({ restoreFocus: false });
      flushPendingSkillPointPopup(140);
    } else {
      flushPendingSkillPointPopup(140);
    }
  }

  function onTryDoor() {
    if (state.activeId === 'game_core' && currentStep()?.id === 'core_door') {
      scheduleCoreStepAdvance('core_door', 120);
    }
  }

  function onSidebarState(isOpen) {
    if (state.activeId !== 'tour_sidebar_nav') return;
    const step = currentStep();
    if (isOpen) {
      if (step && step.id === 'nav_open_burger') {
        const reduced = document.body.classList.contains('reduce-motion') ||
          (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        window.setTimeout(() => {
          if (state.activeId === 'tour_sidebar_nav' && currentStep()?.id === 'nav_open_burger') {
            advanceStep();
          }
        }, reduced ? 40 : 380);
      }
    } else if (step && step.id !== 'nav_open_burger') {
      stopActiveTutorial({ restoreFocus: false });
    }
  }

  function onDashboardRendered() {
    syncGuideButtonsVisibility();
    window.setTimeout(() => maybeTriggerContextualTutorial(), 80);
  }

  function onProfileSwitch() {
    state.pendingSkillPointAwards = [];
    state.seenSkillPointAwardIds = new Set();
    state.activeSkillPointAward = null;
    state.pendingRemedialTutorial = false;
    if (state.spPopupTimer) {
      window.clearTimeout(state.spPopupTimer);
      state.spPopupTimer = 0;
    }
    state.sequence = null;
    state.suppressAutoTourView = null;
    stopActiveTutorial({ restoreFocus: false });
    syncGuideButtonsVisibility();
  }

  // --- Achievements Page Checklist Breakdown for Codex Laureate ---
  function renderAchievementChecklist() {
    const store = loadStore();
    const completedCount = getCompletedTutorialCount();
    const totalCount = REQUIRED_TUTORIAL_IDS.length;
    const pips = TUTORIAL_CATALOG.map((item) => {
      const st = store.completed[item.id];
      const cls = st === 'completed' ? 'is-done' : st === 'skipped' ? 'is-skipped' : 'is-pending';
      const mark = st === 'completed' ? '✓' : st === 'skipped' ? '↷' : '○';
      return `<span class="tutorial-ach-pip ${cls}" title="${item.title}: ${st === 'completed' ? 'Completed' : st === 'skipped' ? 'Skipped (replay to count)' : 'Not yet completed'}">${mark} ${item.shortTitle}</span>`;
    }).join('');
    return `<div class="tutorial-ach-breakdown" aria-label="Tutorial completion breakdown: ${completedCount} of ${totalCount} completed">
      <div class="tutorial-ach-pips">${pips}</div>
      <small class="tutorial-ach-rule">Only completed tutorials (✓) count toward <strong>Codex Laureate</strong> (${completedCount} of ${totalCount} completed). Replay any skipped tutorial (↷) using <strong>? Tour</strong> or <strong>? Guide</strong> on that page.</small>
    </div>`;
  }

  function replayCurrentContextTutorial() {
    const relevantId = getRelevantContextTutorialId({ forReplay: true });
    if (!relevantId) return false;
    return startTutorial(relevantId, { force: true });
  }

  // --- Global DOM Event Listeners for Tutorial Controls & Click Gating ---
  function bindTutorialDomEvents() {
    const els = getEls();
    els.nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      advanceStep();
    });

    els.skipBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      skipActiveTutorialOrSequence();
    });

    els.silentCue?.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('#tutorialCompactSkipBtn')) {
        e.stopPropagation();
        skipActiveTutorialOrSequence();
      }
    });

    document.getElementById('topbarTourButton')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const sidebarOpen = typeof navMenuOpen !== 'undefined' && Boolean(navMenuOpen);
      if (sidebarOpen) {
        startTutorial('tour_sidebar_nav', { force: true });
      } else {
        replayCurrentContextTutorial();
      }
    });

    document.getElementById('hudTourButton')?.addEventListener('click', (e) => {
      e.stopPropagation();
      replayCurrentContextTutorial();
    });

    document.getElementById('skillTreeGuideButton')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startTutorial('guide_skill_tree', { force: true });
    });

    document.getElementById('worldMapGuideButton')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startTutorial('guide_world_map', { force: true });
    });

    document.addEventListener('keydown', (event) => {
      const rawKeyDown = String(event.key || '').toLowerCase();
      if (rawKeyDown === 'd' || rawKeyDown === 'arrowright') state.physicalRightHeld = true;
      if (!state.activeId) return;
      if (event.key === 'Tab') {
        focusTutorialTarget(event);
        return;
      }

      const step = currentStep();
      if (!step) return;
      const target = event.target instanceof Element ? event.target : null;
      const rawKey = String(event.key || '').toLowerCase();
      const key = normalizeTutorialKey(rawKey);
      const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
      const keyboardActivation = isKeyboardActivation(key, rawKey);
      const nextActivation = !hasModifier &&
        target?.closest('#tutorialNextButton') &&
        !getEls().nextBtn?.hidden &&
        keyboardActivation;
      const skipActivation = !hasModifier && keyboardActivation && (
        (target?.closest('#tutorialSkipButton') && !getEls().skipBtn?.hidden) ||
        Boolean(target?.closest('#tutorialCompactSkipBtn'))
      );
      const actionActivation = !hasModifier &&
        keyboardActivation &&
        Boolean(getAllowedActionControl(target, step));
      const editableTarget = target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      const matchingActionKey = !hasModifier &&
        !editableTarget &&
        isActionPromptKey(step, key, rawKey);

      if (!event.repeat && (nextActivation || skipActivation || actionActivation || matchingActionKey)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if ((key === 'a' || key === 'd') && typeof keys !== 'undefined') {
        keys.a.pressed = false;
        if (!state.physicalRightHeld) keys.d.pressed = false;
      }
    }, true);

    document.addEventListener('keyup', (event) => {
      const rawKeyUp = String(event.key || '').toLowerCase();
      if (rawKeyUp === 'd' || rawKeyUp === 'arrowright') state.physicalRightHeld = false;
      if (!state.activeId) return;
      const step = currentStep();
      if (!step) return;
      const target = event.target instanceof Element ? event.target : null;
      const rawKey = String(event.key || '').toLowerCase();
      const key = normalizeTutorialKey(rawKey);
      const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
      const keyboardActivation = isKeyboardActivation(key, rawKey);
      const nextActivation = !hasModifier &&
        target?.closest('#tutorialNextButton') &&
        !getEls().nextBtn?.hidden &&
        keyboardActivation;
      const skipActivation = !hasModifier && keyboardActivation && (
        (target?.closest('#tutorialSkipButton') && !getEls().skipBtn?.hidden) ||
        Boolean(target?.closest('#tutorialCompactSkipBtn'))
      );
      const actionActivation = !hasModifier &&
        keyboardActivation &&
        Boolean(getAllowedActionControl(target, step));
      const matchingActionKey = !hasModifier && isActionPromptKey(step, key, rawKey);

      if (nextActivation || skipActivation || actionActivation || matchingActionKey) return;
      if ((key === 'a' || key === 'd') && typeof keys !== 'undefined') {
        keys.a.pressed = false;
        if (!state.physicalRightHeld) keys.d.pressed = false;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    document.addEventListener('focusin', (event) => {
      if (!state.activeId) return;
      const step = currentStep();
      if (step?.silentCue || step?.compactPrompt) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!isAllowedTutorialTarget(target, step)) {
        getTutorialFocusTarget(step)?.focus({ preventScroll: true });
      }
    }, true);

    const pointerActivationEvents = new Set([
      'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove',
    ]);
    const blockUnintendedTutorialInput = (event) => {
      if (!state.activeId) return;
      const target = event.target instanceof Element ? event.target : null;
      if (pointerActivationEvents.has(event.type) && isAllowedTutorialTarget(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    [
      'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove',
      'wheel', 'dblclick', 'contextmenu', 'auxclick', 'dragstart', 'submit',
    ].forEach((eventName) => {
      document.addEventListener(eventName, blockUnintendedTutorialInput, { capture: true, passive: false });
    });

    document.addEventListener('click', (e) => {
      const step = currentStep();
      if (!state.activeId || !step) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isAllowedTutorialTarget(target, step)) {
        return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);

    window.addEventListener('resize', () => {
      if (state.activeId) positionSpotlightAndBubble();
    });
    window.addEventListener('orientationchange', () => {
      if (state.activeId) {
        window.setTimeout(() => {
          if (state.activeId) positionSpotlightAndBubble();
        }, 120);
      }
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (state.activeId) positionSpotlightAndBubble();
      });
      window.visualViewport.addEventListener('scroll', () => {
        if (state.activeId) positionSpotlightAndBubble();
      });
    }
  }

  bindTutorialDomEvents();

  window.ByteboundTutorial = {
    startTutorial,
    stopActiveTutorial,
    completeActiveTutorial,
    advanceStep,
    getTutorialStatus,
    isTutorialFinished,
    getCompletedTutorialCount,
    renderAchievementChecklist,
    onSkillPointEarned,
    isActionLocked,
    shouldFreezeEnemies,
    shouldHoldEncounter,
    interceptKey,
    interceptEscape,
    interceptTouchButton,
    onTouchButtonAction,
    interceptPracticeClick,
    onPracticeAction,
    interceptCombatAction,
    onRewardCardPicked,
    onUpgradePicked,
    onBattleStarted,
    onBattlePhaseRendered,
    onRemedialAnswer,
    onBattleContinue,
    onSkillTreeState,
    onSkillTreeAction,
    onWorldMapState,
    onTryDoor,
    onSidebarState,
    onDashboardRendered,
    onProfileSwitch,
    getRelevantContextTutorialId,
    syncGuideButtonsVisibility,
    replayCurrentContextTutorial,
    replayFullPageTour,
    replayFullGameGuide,
    replayBattleTutorial,
    resetPlayerTutorials,
    skipActiveTutorialOrSequence,
    REQUIRED_TUTORIAL_IDS,
    TUTORIAL_CATALOG,
    get state() {
      return state;
    },
  };
})();
