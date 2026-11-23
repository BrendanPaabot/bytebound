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
      summary: 'Opening the sliding sidebar menu and navigating across all 6 Bytebound pages.',
    },
    {
      id: 'tour_quest',
      title: 'Quest Hub Tour',
      shortTitle: 'Quest Hub',
      category: 'Page Tour',
      summary: 'Start Game campaign selection, 1v1 Multiplayer, Practice Mode, and adaptive difficulty.',
    },
    {
      id: 'tour_practice_menu',
      title: 'Topic Selection Tour',
      shortTitle: 'Topic Select',
      category: 'Page Tour',
      summary: 'Difficulty filters, Mixed Quiz, Missed Review, Weak Spotlight, and topic progress.',
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
      summary: 'Run statistics, Diagnostic Baseline vs. Post-Baseline gains, radar chart, and CSV export.',
    },
    {
      id: 'tour_leaderboards',
      title: 'Leaderboards Tour',
      shortTitle: 'Leaderboards',
      category: 'Page Tour',
      summary: 'Arcade and 1v1 ranking modes, refresh control, top-three podium, and standings table.',
    },
    {
      id: 'tour_rewards',
      title: 'Achievements Tour',
      shortTitle: 'Achievements',
      category: 'Page Tour',
      summary: 'Milestone categories, progress meters, Card Collection rewards, and Codex Laureate.',
    },
    {
      id: 'tour_settings',
      title: 'Settings Tour',
      shortTitle: 'Settings',
      category: 'Page Tour',
      summary: 'Appearance, Reduced Motion, Sound & Volume, Controls reference, and Player Profile.',
    },
    {
      id: 'game_core',
      title: 'Core Controls Tutorial',
      shortTitle: 'Core Controls',
      category: 'Gameplay Lesson',
      summary: 'Move (A/D), Jump (W/Space), Door interaction (Up/W), and engaging an enemy.',
    },
    {
      id: 'game_battle',
      title: 'Battle Arena Tutorial',
      shortTitle: 'Battle Arena',
      category: 'Gameplay Lesson',
      summary: 'Choosing an action card, answering with 1–4, reading feedback, and continuing.',
    },
    {
      id: 'game_hud',
      title: 'In-Game HUD Tutorial',
      shortTitle: 'Game HUD',
      category: 'Gameplay Lesson',
      summary: 'Room header, Menu/Fullscreen controls, Map & Skill Tree badges, character-head frames, and action hints.',
    },
    {
      id: 'game_card_reward',
      title: 'Card Reward Tutorial',
      shortTitle: 'Card Reward',
      category: 'Reward Lesson',
      summary: 'Inspecting an offered reward card’s cost and effect and adding it to your run deck.',
    },
    {
      id: 'game_level_up',
      title: 'Level-Up Selection Tutorial',
      shortTitle: 'Level Up',
      category: 'Reward Lesson',
      summary: 'Why a Level Up appears every 2 virus defeats and selecting a permanent stat upgrade.',
    },
    {
      id: 'game_skill_tree',
      title: 'Skill-Point & Skill Tree Tutorial',
      shortTitle: 'Skill Tree',
      category: 'Overlay Lesson',
      summary: 'Earning 1 SP per 5 correct answers, opening with [U], inspecting/buying upgrades, and closing.',
    },
    {
      id: 'game_world_map',
      title: 'World Map Tutorial',
      shortTitle: 'World Map',
      category: 'Overlay Lesson',
      summary: 'Current and cleared rooms, branching street routes, pan/zoom, room inspector, and closing.',
    },
  ];

  const REQUIRED_TUTORIAL_IDS = TUTORIAL_CATALOG.map((t) => t.id);

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
    if (!key) return { completed: {}, progress: {}, spGuideTriggered: false };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { completed: {}, progress: {}, spGuideTriggered: false };
      const parsed = JSON.parse(raw);
      return {
        completed: (parsed && typeof parsed.completed === 'object' && parsed.completed) ? parsed.completed : {},
        progress: (parsed && typeof parsed.progress === 'object' && parsed.progress) ? parsed.progress : {},
        spGuideTriggered: Boolean(parsed?.spGuideTriggered),
      };
    } catch {
      return { completed: {}, progress: {}, spGuideTriggered: false };
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
      }));
    } catch {}
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
  }

  function saveStepProgress(tutorialId, stepId) {
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
            actionPrompt: 'Action required: Click or tap the highlighted menu button to open the sidebar.',
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
            desc: 'Launch Campaign runs, 1v1 Multiplayer, or Practice Mode, and check your Adaptive Difficulty and controls.',
            target: ['#mainSidebar [data-view="quest"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_practice',
            tag: 'SIDEBAR · 02',
            title: '02 · Topic Drill',
            desc: 'Study 20 IT topics without combat damage using difficulty filters, Weak Topic Spotlight, and Missed Review.',
            target: ['#mainSidebar [data-view="practice"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_tracker',
            tag: 'SIDEBAR · 03',
            title: '03 · Tracker',
            desc: 'Inspect your accuracy, Capability Radar, Diagnostic Baseline vs. Post-Baseline gains, and CSV export.',
            target: ['#mainSidebar [data-view="tracker"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_leaderboards',
            tag: 'SIDEBAR · 04',
            title: '04 · Leaderboards',
            desc: 'View the top-three podium and ranked standings for both Arcade Campaign and 1v1 Competitive duels.',
            target: ['#mainSidebar [data-view="leaderboards"]', '#mainSidebar'],
            preferPlacement: 'right',
          },
          {
            id: 'nav_page_rewards',
            tag: 'SIDEBAR · 05',
            title: '05 · Achievements',
            desc: 'Track unlocked milestones, tutorial completion progress, and your earned combat Card Collection.',
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
            tag: 'QUEST HUB',
            title: 'Difficulty & Controls',
            desc: 'Check your Adaptive Difficulty tier and keyboard shortcuts here before entering a run.',
            target: ['.welcome-insights', '.difficulty-insight'],
            condition: () => Boolean(resolveFirstVisible('.welcome-insights')),
          },
        ];
      }

      case 'tour_practice_menu': {
        return [
          {
            id: 'p_menu_difficulty',
            tag: 'TOPIC SELECTION',
            title: 'Difficulty Filter',
            desc: 'Choose Adaptive (matches your skill tier), Mixed, Easy, Medium, or Hard questions before starting a study drill.',
            target: ['#dashboardAside .practice-controls', '#dashboardAside'],
          },
          {
            id: 'p_menu_mixed_review',
            tag: 'TOPIC SELECTION',
            title: 'Mixed Quiz & Missed Review',
            desc: 'Use "Mixed quiz" to practice across all topics, or "Review missed" to retry questions you answered wrong in earlier battles or drills.',
            target: ['#dashboardAside .practice-start', '#dashboardAside'],
          },
          {
            id: 'p_menu_weak_spotlight',
            tag: 'TOPIC SELECTION',
            title: 'Weak Topic Spotlight',
            desc: 'When an attempted topic is below 75% accuracy, click "Drill Weakest" here to focus directly on that topic.',
            target: ['#dashboardAside .practice-weak-banner'],
            condition: () => Boolean(resolveFirstVisible('#dashboardAside .practice-weak-banner')),
          },
          {
            id: 'p_menu_topics_status',
            tag: 'TOPIC SELECTION',
            title: 'Topic Progress & DONE Status',
            desc: 'Each row shows how many unique questions you have finished and your accuracy. Answering every question in a topic marks it ✓ DONE.',
            target: ['#dashboardAside .practice-category .practice-topic', '#dashboardAside .practice-categories'],
          },
          {
            id: 'p_menu_start_action',
            tag: 'ACTION STEP',
            title: 'Start a Topic Drill',
            desc: 'Topic Drills let you study and earn Skill Points without taking combat damage.',
            actionPrompt: 'Action required: Click the highlighted Practice (or Mixed quiz) button to start a drill.',
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
            title: 'Next Question & Completion',
            desc: 'Advance to the next un-answered question in this set. Finishing all questions in the set unlocks the ✓ DONE completion screen.',
            actionPrompt: 'Action required: Click "Next question" (or "Finish & Mark Done") or press Enter.',
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
            title: 'Set Marked ✓ DONE',
            desc: 'You answered every question in this set! Your session accuracy is recorded and the topic is now marked ✓ DONE.',
            target: ['#dashboardAside .practice-done-card', '#dashboardAside'],
          },
          {
            id: 'p_done_actions',
            tag: 'DRILL COMPLETE',
            title: 'Practice Again or Return',
            desc: 'Click "Practice Again" to reset and re-drill this set, or "Back to topics" to pick a different subject.',
            target: ['#dashboardAside .practice-done-actions', '#dashboardAside .practice-done-card'],
          },
        ];
      }

      case 'tour_tracker': {
        return [
          {
            id: 'tracker_summary',
            tag: 'LEARNING TRACKER',
            title: 'Overall Run & Quiz Stats',
            desc: 'These cards show your Current Accuracy, Topics Mastered (80%+ accuracy with at least 4 answers), and total Viruses Defeated.',
            target: ['#dashboardAside .tracker-summary', '#dashboardAside'],
          },
          {
            id: 'tracker_diagnostic',
            tag: 'LEARNING TRACKER',
            title: 'Diagnostic Baseline vs. Growth',
            desc: 'Your first 3 answers in a topic record a Diagnostic Baseline. Later answers measure your Post-Baseline accuracy gain.',
            target: ['#dashboardAside .tracker-diagnostic-strip', '#dashboardAside'],
          },
          {
            id: 'tracker_radar',
            tag: 'LEARNING TRACKER',
            title: 'Capability Radar & Subject Tiers',
            desc: 'The radar chart and subject cards display your accuracy and current adaptive difficulty tier across all four IT disciplines.',
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
            title: 'Arcade & 1v1 Ranking Modes',
            desc: 'Switch between Arcade Ranking (campaign run scores) and 1v1 Competitive (head-to-head duel Elo ratings).',
            target: ['#dashboardAside .leaderboard-tabs', '#dashboardAside'],
          },
          {
            id: 'lb_refresh',
            tag: 'LEADERBOARDS',
            title: 'Refresh Standings',
            desc: 'Click Refresh anytime to fetch the latest leaderboard rankings for the active mode.',
            target: ['#dashboardAside [data-leaderboard-refresh]', '#dashboardAside .leaderboard-heading'],
          },
          {
            id: 'lb_standings',
            tag: 'LEADERBOARDS',
            title: 'Top-Three Podium & Rankings',
            desc: 'The top three players claim the spotlight podium above, with remaining ranked challengers listed below.',
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
            tag: 'ACHIEVEMENTS',
            title: 'Codex Laureate · Tutorial Achievement',
            desc: () => `Track how many of the ${REQUIRED_TUTORIAL_IDS.length} guided tutorials you have finished here. Skipped tutorials do not count until you replay and complete them.`,
            target: ['#dashboardAside .achievement-card.is-tutorial-achievement', '#dashboardAside .achievement-section.cat-tutorial'],
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
            id: 'core_move',
            tag: 'CORE CONTROLS · 1',
            title: 'Move Left & Right',
            desc: 'Let’s practice the four room controls in order. First, move your knight horizontally across the floor.',
            actionPrompt: 'Action required: Tap LEFT / RIGHT or press A / D (or Left / Right Arrow).',
            actionRequired: true,
            showTouchControls: true,
            holdEncounter: true,
            target: ['.touch-dpad', '.preview-frame canvas'],
            allowClickSelector: '.touch-dpad [data-k="a"], .touch-dpad [data-k="d"]',
            allowedKeys: ['a', 'd', 'arrowleft', 'arrowright'],
            preferPlacement: 'top',
          },
          {
            id: 'core_jump',
            tag: 'CORE CONTROLS · 2',
            title: 'Jump',
            desc: 'Jump to climb platforms and reach upper walkways.',
            actionPrompt: 'Action required: Tap the highlighted JUMP button or press W or Space.',
            actionRequired: true,
            showTouchControls: true,
            holdEncounter: true,
            target: ['.touch-jump', '.preview-frame canvas'],
            allowClickSelector: '.touch-jump[data-k="w"]',
            allowedKeys: ['w', 'space', ' '],
            preferPlacement: 'top',
          },
          {
            id: 'core_door',
            tag: 'CORE CONTROLS · 3',
            title: 'Interact with a Door',
            desc: 'Approach a door and use the door control to enter it. Room exit doors stay locked until all viruses in the room are defeated.',
            actionPrompt: 'Action required: Tap the highlighted DOOR button or press Up Arrow / W.',
            actionRequired: true,
            showTouchControls: true,
            holdEncounter: true,
            target: ['.touch-door', '.preview-frame canvas'],
            allowClickSelector: '.touch-door[data-k="up"], .touch-dpad [data-k="a"], .touch-dpad [data-k="d"]',
            allowedKeys: ['up', 'arrowup', 'w', 'a', 'd', 'arrowleft', 'arrowright'],
            preferPlacement: 'top',
          },
          {
            id: 'core_attack',
            tag: 'CORE CONTROLS · 4',
            title: 'Approach & Engage an Enemy',
            desc: 'Walk into any patrolling virus in the room to start a battle encounter.',
            actionPrompt: 'Action required: Move toward a virus using A / D or LEFT / RIGHT to touch it.',
            actionRequired: true,
            showTouchControls: true,
            holdEncounter: false,
            target: ['.touch-dpad', '.preview-frame canvas'],
            allowClickSelector: '.touch-dpad [data-k="a"], .touch-dpad [data-k="d"], .touch-jump[data-k="w"]',
            allowedKeys: ['a', 'd', 'arrowleft', 'arrowright', 'w', 'space', ' '],
            preferPlacement: 'top',
          },
          {
            id: 'core_transition',
            tag: 'BATTLE STARTING',
            title: 'Entering the Battle Arena',
            desc: 'Touching a virus switches from room exploration into turn-based combat, where answering IT questions powers your cards.',
            actionRequired: false,
            showTouchControls: false,
            holdEncounter: false,
            target: ['.preview-frame', '#playHud'],
            preferPlacement: 'bottom',
            onNext: () => {
              if (typeof mode !== 'undefined' && mode === 'intro' && typeof INTRO_END !== 'undefined' && typeof drawIntro === 'function') {
                introT = INTRO_END;
                drawIntro();
              }
            },
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
            actionPrompt: 'Action required: Click a highlighted card or press keys 1–4.',
            actionRequired: true,
            target: ['#panel .actions', '#panel'],
            allowClickSelector: '#panel [data-act="card"]:not(:disabled), #panel [data-act="remedial"]:not(:disabled)',
            allowedKeys: ['1', '2', '3', '4', 'r'],
            preferPlacement: 'top',
          },
          {
            id: 'battle_answer_question',
            tag: mp ? '1V1 ARENA' : 'BATTLE ARENA',
            title: 'Answer with a Numbered Choice',
            desc: mp
              ? 'Answer correctly to hit your opponent with your card’s full effect.'
              : 'Correct answers unleash your card’s full power and restore HP and Mana; wrong answers weaken your move and let the enemy strike back.',
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
            actionPrompt: 'Action required: Click "Continue" or press Enter.',
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
            id: 'hud_room_status',
            tag: 'HUD GUIDE',
            title: 'Room Info & Mode Status',
            desc: mp
              ? 'Displays the active 1v1 arena name, room code, and ONLINE DUEL status.'
              : 'Shows your current room number, room name, and whether you are EXPLORING or IN BATTLE.',
            target: ['#playHud .play-hud-room', '#playHud .play-hud-header'],
            preferPlacement: 'bottom',
          },
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
            title: 'World Map [M] & Skill Tree [U]',
            desc: 'Use MAP · [M] to view room routes, and press [U] (or click the gold SP badge when earned) to open your Skill Tree.',
            target: ['#worldMapHudButton', '#skillPointHudBadge'],
            condition: () => !isMultiplayer() && Boolean(resolveFirstVisible('#worldMapHudButton')),
            preferPlacement: 'bottom',
          },
          {
            id: 'hud_character_frames',
            tag: 'HUD GUIDE',
            title: 'Character-Head Health & Mana Frames',
            desc: mp
              ? 'The pixel-art frames above both knights show live HP, Mana, red damage trails, and green healing gains.'
              : 'The pixel-art frames above your knight and the enemy display live HP, Mana, enemy attack intent, red damage afterimages, and green healing trails.',
            target: ['.preview-frame canvas', '.preview-frame'],
            preferPlacement: 'bottom',
          },
          {
            id: 'hud_action_hints',
            tag: 'HUD GUIDE',
            title: 'Action Hints & Room Objective',
            desc: 'Check this banner for available keybind hints and room objectives as you clear viruses to unlock the exit door.',
            target: ['#playExploreBanner:not([hidden])', '#playHint:not(:empty)', '#playHud'],
            preferPlacement: 'bottom',
          },
        ];
      }

      case 'game_card_reward': {
        return [
          {
            id: 'card_reward_explain',
            tag: 'CARD REWARD',
            title: () => {
              const firstId = (typeof battle !== 'undefined' && Array.isArray(battle.rewards)) ? battle.rewards[0] : null;
              const card = (firstId && typeof CARD_LIBRARY !== 'undefined') ? CARD_LIBRARY[firstId] : null;
              return card ? `Offered Card: ${card.name}` : 'Defeat Reward: New Deck Card';
            },
            desc: () => {
              const firstId = (typeof battle !== 'undefined' && Array.isArray(battle.rewards)) ? battle.rewards[0] : null;
              const card = (firstId && typeof CARD_LIBRARY !== 'undefined') ? CARD_LIBRARY[firstId] : null;
              if (card) {
                const costTxt = (typeof cardCostLabel === 'function' && typeof hero !== 'undefined')
                  ? cardCostLabel(card, hero)
                  : (card.cost ? `${card.cost} mana` : 'Free');
                const effectTxt = (typeof describeCard === 'function' && typeof hero !== 'undefined')
                  ? describeCard(card, hero)
                  : (card.text || '');
                return `Defeating a virus lets you draft 1 card into your run deck. ${card.name} (${costTxt}) — ${effectTxt}`;
              }
              return 'Defeating a virus lets you draft 1 new action card into your run deck, showing its Mana cost and combat effect.';
            },
            target: [
              '#panel .choices.card-pick [data-act="pickcard"][data-val="0"]',
              '#panel .choices.card-pick button:first-child',
              '#panel .choices.card-pick',
            ],
            preferPlacement: 'top',
          },
          {
            id: 'card_reward_select',
            tag: 'ACTION STEP',
            title: 'Select a Card for Your Deck',
            desc: 'Choose one of the offered reward cards to add it to your run deck and continue.',
            actionPrompt: 'Action required: Click any offered card or press keys 1–3.',
            actionRequired: true,
            target: [
              '#panel .choices.card-pick',
              '#panel [data-act="pickcard"]',
              '#panel',
            ],
            allowClickSelector: '#panel [data-act="pickcard"]:not(:disabled)',
            allowedKeys: ['1', '2', '3'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_level_up': {
        return [
          {
            id: 'level_up_explain',
            tag: 'LEVEL UP',
            title: () => {
              const up0 = (typeof battle !== 'undefined' && Array.isArray(battle.upgrades)) ? battle.upgrades[0] : null;
              return up0 ? `Level-Up Bonus: ${up0.name}` : 'Level Up! Permanent Stat Upgrade';
            },
            desc: () => {
              const up0 = (typeof battle !== 'undefined' && Array.isArray(battle.upgrades)) ? battle.upgrades[0] : null;
              const allText = (typeof battle !== 'undefined' && Array.isArray(battle.upgrades) && battle.upgrades.length)
                ? battle.upgrades.map((u) => `${u.name} (${u.text})`).join(', ')
                : '';
              if (up0) {
                return `Defeating 2 viruses triggers a Level Up! Each choice grants a permanent run upgrade: ${allText}.`;
              }
              return 'Defeating 2 viruses triggers a Level Up, offering 3 permanent stat upgrades for your current run.';
            },
            target: [
              '#panel .choices.card-pick [data-act="upgrade"][data-val="0"]',
              '#panel .choices.card-pick button:first-child',
              '#panel .choices.card-pick',
            ],
            preferPlacement: 'top',
          },
          {
            id: 'level_up_select',
            tag: 'ACTION STEP',
            title: 'Choose Your Level-Up Upgrade',
            desc: 'Select one of the three upgrades below to apply its stat bonus and resume your adventure.',
            actionPrompt: 'Action required: Click an upgrade choice or press keys 1–3.',
            actionRequired: true,
            target: [
              '#panel .choices.card-pick',
              '#panel [data-act="upgrade"]',
              '#panel',
            ],
            allowClickSelector: '#panel [data-act="upgrade"]:not(:disabled)',
            allowedKeys: ['1', '2', '3'],
            preferPlacement: 'top',
          },
        ];
      }

      case 'game_skill_tree': {
        return [
          {
            id: 'sp_earned_intro',
            tag: 'SKILL POINT',
            title: 'Skill Point Earned!',
            desc: 'Every 5 correct answers in an IT discipline earns 1 Skill Point (SP). You can spend SP on permanent stat bonuses and active combat skills in that subject’s branch.',
            target: [
              () => (typeof skillTreeOpen !== 'undefined' && skillTreeOpen)
                ? document.querySelector('#skillTreeSummary .skill-points-overview')
                : (resolveFirstVisible('#spEarnedBanner:not([hidden])') ||
                   resolveFirstVisible('#skillPointHudBadge:not([hidden])') ||
                   resolveFirstVisible('#playHud') ||
                   resolveFirstVisible('#dashboardAside')),
            ],
            preferPlacement: 'bottom',
          },
          {
            id: 'sp_open_tree',
            tag: 'ACTION STEP',
            title: 'Open the Skill Tree [U]',
            desc: 'Use the Skill Tree control or press U on your keyboard to open the Skill Tree overlay.',
            actionPrompt: 'Action required: Click the highlighted Skill Tree control or press U.',
            actionRequired: true,
            condition: () => typeof skillTreeOpen === 'undefined' || !skillTreeOpen,
            target: [
              '#skillPointHudBadge:not([hidden])',
              '#spEarnedBanner:not([hidden])',
              '#worldMapHudButton',
              '#playHud .play-hud-header',
              '#dashboardAside',
            ],
            allowClickSelector: '#skillPointHudBadge, #spEarnedBanner',
            allowedKeys: ['u'],
            preferPlacement: 'bottom',
          },
          {
            id: 'sp_find_and_inspect',
            tag: 'ACTION STEP',
            title: 'Find an Eligible Tree & Inspect an Upgrade',
            desc: 'The four branches match the four IT disciplines. Click START at the center (if closed), then click a skill node in your eligible branch to inspect it.',
            actionPrompt: () => (typeof skillTreeStarted !== 'undefined' && !skillTreeStarted)
              ? 'Action required: Click the highlighted "START" button at the center of the map.'
              : 'Action required: Click the highlighted skill node to inspect its upgrade details.',
            actionRequired: true,
            target: [
              () => {
                const startBtn = document.getElementById('startSkillTree');
                if (startBtn && !startBtn.disabled && isElementVisible(startBtn)) return startBtn;
                return findFirstEligibleSkillNode();
              },
              '#skillMapViewport',
            ],
            allowClickSelector: '#startSkillTree:not(:disabled), #skillMapWorld [data-skill-select]',
            preferPlacement: 'top',
          },
          {
            id: 'sp_select_upgrade',
            tag: 'SKILL UPGRADE',
            title: 'Review Effect & Unlock Upgrade',
            desc: () => {
              const titleEl = document.getElementById('selectedSkillTitle');
              const effectEl = document.querySelector('#skillTreeDetail .skill-detail-effect strong');
              const btn = document.querySelector('#skillTreeDetail [data-skill-purchase]:not(:disabled)');
              const skillLabel = titleEl ? titleEl.textContent.trim() : 'This upgrade';
              const effectLabel = effectEl ? ` (${effectEl.textContent.trim()})` : '';
              return btn
                ? `${skillLabel}${effectLabel} is ready to unlock for 1 SP. Click the purchase button below to learn it!`
                : `${skillLabel}${effectLabel} shows its rank effect and point cost here. When you have 1 SP in this discipline, click GET SKILL to unlock it.`;
            },
            actionPrompt: 'Action required: Click "GET SKILL · 1 POINT" (or "UPGRADE SKILL") to spend your point.',
            get actionRequired() {
              return Boolean(resolveFirstVisible('#skillTreeDetail [data-skill-purchase]:not(:disabled)'));
            },
            target: [
              '#skillTreeDetail [data-skill-purchase]:not(:disabled)',
              '#skillTreeDetail',
            ],
            unionWith: '#skillTreeDetail',
            allowClickSelector: '#skillTreeDetail [data-skill-purchase]:not(:disabled)',
            preferPlacement: 'left',
          },
          {
            id: 'sp_close_tree',
            tag: 'ACTION STEP',
            title: 'Close the Skill Tree',
            desc: 'Your skill bonuses apply immediately. Close the Skill Tree to return to your game.',
            actionPrompt: 'Action required: Click "Close · U" (or press U or Escape).',
            actionRequired: true,
            target: ['#closeSkillTree', '.skill-tree-header'],
            allowClickSelector: '#closeSkillTree',
            allowedKeys: ['u', 'escape'],
            preferPlacement: 'bottom',
          },
        ];
      }

      case 'game_world_map': {
        return [
          {
            id: 'map_legend',
            tag: 'WORLD MAP',
            title: 'Current & Completed Rooms',
            desc: 'The map legend marks your Current room, Completed rooms, Unlocked routes, Locked rooms, and Boss Sanctums.',
            target: ['#worldMapOverlay .world-map-legend', '#worldMapOverlay .world-map-header'],
            preferPlacement: 'bottom',
          },
          {
            id: 'map_viewport_routes',
            tag: 'WORLD MAP',
            title: 'Routes, Panning & Zooming',
            desc: 'Drag to pan and scroll (or pinch) to zoom across the 16 rooms and branching street routes.',
            target: ['#worldMapViewport'],
            preferPlacement: 'top',
          },
          {
            id: 'map_inspector',
            tag: 'WORLD MAP',
            title: 'Room Inspection & Travel',
            desc: 'Click any room card to inspect its virus count, connected exits, and unlock requirement here, or travel directly to unlocked rooms.',
            target: ['#worldMapInspector'],
            preferPlacement: 'top',
          },
          {
            id: 'map_close',
            tag: 'ACTION STEP',
            title: 'Close the World Map',
            desc: 'Close the map whenever you are ready to resume exploring.',
            actionPrompt: 'Action required: Click "Close · M" (or press M or Escape).',
            actionRequired: true,
            target: ['#closeWorldMap', '.world-map-actions'],
            allowClickSelector: '#closeWorldMap',
            allowedKeys: ['m', 'escape'],
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
    pendingSkillPointGuide: false,
    pendingSkillTreeKey: null,
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
      bubble: document.getElementById('tutorialBubble'),
      tag: document.getElementById('tutorialBubbleTag'),
      progress: document.getElementById('tutorialBubbleProgress'),
      title: document.getElementById('tutorialBubbleTitle'),
      desc: document.getElementById('tutorialBubbleDesc'),
      actionPrompt: document.getElementById('tutorialActionPrompt'),
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

  function syncBodyAndAppClasses() {
    const appEl = document.getElementById('app');
    const step = currentStep();
    const active = Boolean(state.activeId && step);
    document.body.classList.toggle('is-tutorial-active', active);
    if (appEl) {
      appEl.classList.toggle('is-tutorial-touch-visible', Boolean(active && step.showTouchControls));
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

  function positionSpotlightAndBubble() {
    const els = getEls();
    const step = currentStep();
    if (!els.layer || !step || !state.activeId) return;

    const targetEl = resolveFirstVisible(step.target);
    if (!targetEl) return;
    state.targetEl = targetEl;
    const actionReq = isStepActionRequired(step);

    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const rawRect = targetEl.getBoundingClientRect();
    let boxLeft = rawRect.left;
    let boxTop = rawRect.top;
    let boxRight = rawRect.right;
    let boxBottom = rawRect.bottom;

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

    const pad = vh <= 500 ? 4 : 6;

    const hlLeft = Math.max(2, Math.round(boxLeft - pad));
    const hlTop = Math.max(2, Math.round(boxTop - pad));
    const hlRight = Math.min(vw - 2, Math.round(boxRight + pad));
    const hlBottom = Math.min(vh - 2, Math.round(boxBottom + pad));
    const hlW = Math.max(16, hlRight - hlLeft);
    const hlH = Math.max(16, hlBottom - hlTop);

    // 1. Position 4 surrounding dim panels so the target hole is 100% interactive
    els.dimTop.style.top = '0px';
    els.dimTop.style.left = '0px';
    els.dimTop.style.width = `${vw}px`;
    els.dimTop.style.height = `${hlTop}px`;

    els.dimBottom.style.top = `${hlBottom}px`;
    els.dimBottom.style.left = '0px';
    els.dimBottom.style.width = `${vw}px`;
    els.dimBottom.style.height = `${Math.max(0, vh - hlBottom)}px`;

    els.dimLeft.style.top = `${hlTop}px`;
    els.dimLeft.style.left = '0px';
    els.dimLeft.style.width = `${hlLeft}px`;
    els.dimLeft.style.height = `${hlH}px`;

    els.dimRight.style.top = `${hlTop}px`;
    els.dimRight.style.left = `${hlRight}px`;
    els.dimRight.style.width = `${Math.max(0, vw - hlRight)}px`;
    els.dimRight.style.height = `${hlH}px`;

    // 2. Position square pulsing spotlight border
    els.spotlight.style.left = `${hlLeft}px`;
    els.spotlight.style.top = `${hlTop}px`;
    els.spotlight.style.width = `${hlW}px`;
    els.spotlight.style.height = `${hlH}px`;
    els.spotlight.classList.toggle('is-action-required', actionReq);
    if (els.spotlightBadge) {
      els.spotlightBadge.textContent = actionReq ? '▶ ACTION REQUIRED' : '◆ TARGET';
    }

    // 3. Position description bubble without covering the highlighted control or battle panel
    const bw = els.bubble.offsetWidth || Math.min(380, vw - 20);
    const bh = els.bubble.offsetHeight || 190;
    const gap = vh <= 500 ? 8 : 16;
    const topGap = vh <= 500 ? 8 : 26;
    const edge = vh <= 500 ? 6 : 10;

    const inBattlePanel = targetEl.closest('#panel');
    const panelRect = inBattlePanel ? inBattlePanel.getBoundingClientRect() : null;
    const avoidTop = panelRect ? Math.min(hlTop, Math.round(panelRect.top - 4)) : hlTop;
    const avoidLeft = panelRect ? Math.min(hlLeft, Math.round(panelRect.left - 4)) : hlLeft;

    const clampX = (x) => Math.max(edge, Math.min(vw - bw - edge, Math.round(x)));
    const clampY = (y) => Math.max(edge, Math.min(vh - bh - edge, Math.round(y)));

    const centerX = hlLeft + hlW / 2 - bw / 2;
    const centerY = hlTop + hlH / 2 - bh / 2;

    const candidates = {
      bottom: {
        left: clampX(centerX),
        top: hlBottom + gap,
        fits: hlBottom + gap + bh <= vh - edge,
        space: vh - hlBottom,
      },
      top: {
        left: clampX(centerX),
        top: avoidTop - topGap - bh,
        fits: avoidTop - topGap - bh >= edge,
        space: avoidTop,
      },
      right: {
        left: hlRight + gap,
        top: clampY(centerY),
        fits: hlRight + gap + bw <= vw - edge,
        space: vw - hlRight,
      },
      left: {
        left: avoidLeft - gap - bw,
        top: clampY(centerY),
        fits: avoidLeft - gap - bw >= edge,
        space: avoidLeft,
      },
    };

    const order = [];
    if (step.preferPlacement && candidates[step.preferPlacement]) {
      order.push(step.preferPlacement);
    }
    for (const dir of ['bottom', 'top', 'right', 'left']) {
      if (!order.includes(dir)) order.push(dir);
    }

    let chosen = null;
    for (const dir of order) {
      if (candidates[dir].fits) {
        chosen = { dir, left: candidates[dir].left, top: candidates[dir].top };
        break;
      }
    }

    if (!chosen) {
      const bestDir = [...order].sort((a, b) => candidates[b].space - candidates[a].space)[0];
      let left = clampX(candidates[bestDir].left);
      let top = clampY(candidates[bestDir].top);

      const overlapsTarget =
        left < hlRight &&
        left + bw > hlLeft &&
        top < hlBottom &&
        top + bh > hlTop;

      if (overlapsTarget) {
        const targetMidY = hlTop + hlH / 2;
        if (targetMidY >= vh * 0.48) {
          top = edge;
        } else {
          top = Math.max(edge, vh - bh - edge);
        }
      }
      chosen = { dir: bestDir, left, top };
    }

    els.spotlight.classList.toggle('is-badge-bottom', hlTop < 28 || (chosen.dir === 'top' && hlBottom + 26 < vh));
    els.bubble.dataset.placement = chosen.dir;
    els.bubble.style.left = `${chosen.left}px`;
    els.bubble.style.top = `${chosen.top}px`;
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
  }

  function renderCurrentStep({ focusBubble = false } = {}) {
    const els = getEls();
    if (!els.layer || !state.activeId) return;

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
    syncBodyAndAppClasses();

    const targetEl = resolveFirstVisible(step.target);
    if (!targetEl) {
      if (state.retryCount < 10) {
        state.retryCount++;
        state.retryTimer = window.setTimeout(() => renderCurrentStep({ focusBubble }), 65);
        return;
      }
      state.retryCount = 0;
      state.stepIndex++;
      renderCurrentStep({ focusBubble });
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

    const resolvedTitle = typeof step.title === 'function' ? step.title() : (step.title || '');
    els.tag.textContent = step.tag || 'TUTORIAL';
    els.progress.textContent = progressLabel;
    els.title.textContent = resolvedTitle;
    els.desc.textContent = typeof step.desc === 'function' ? step.desc() : (step.desc || '');

    const promptText = typeof step.actionPrompt === 'function' ? step.actionPrompt() : (step.actionPrompt || '');
    if (actionReq && promptText) {
      els.actionPrompt.textContent = promptText;
      els.actionPrompt.hidden = false;
    } else {
      els.actionPrompt.textContent = '';
      els.actionPrompt.hidden = true;
    }

    els.bubble.classList.toggle('is-action-step', actionReq);

    if (actionReq) {
      els.nextBtn.hidden = true;
    } else {
      els.nextBtn.hidden = false;
      const isLast = currentPos === totalCount;
      els.nextBtn.textContent = isLast ? 'Finish' : 'Next';
    }

    els.layer.hidden = false;
    els.layer.setAttribute('aria-hidden', 'false');

    scrollTargetIntoViewIfNeeded(targetEl);
    positionSpotlightAndBubble();
    startPositionTracking();

    if (els.announcer) {
      els.announcer.textContent = `${resolvedTitle}. Step ${progressLabel}. ${els.desc.textContent} ${actionReq ? promptText : ''}`.trim();
    }

    if (focusBubble) {
      window.requestAnimationFrame(() => {
        if (!state.activeId) return;
        if (!actionReq && !els.nextBtn.hidden) {
          els.nextBtn.focus({ preventScroll: true });
        } else if (targetEl && typeof targetEl.focus === 'function' && targetEl.matches('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
          targetEl.focus({ preventScroll: true });
        } else {
          els.bubble.focus({ preventScroll: true });
        }
      });
    }
  }

  function stopActiveTutorial({ restoreFocus = true } = {}) {
    stopPositionTracking();
    const els = getEls();
    if (els.layer) {
      els.layer.hidden = true;
      els.layer.setAttribute('aria-hidden', 'true');
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

  function completeActiveTutorial(status = 'completed') {
    const finishedId = state.activeId;
    if (!finishedId) return;
    setTutorialStatus(finishedId, status);
    stopActiveTutorial({ restoreFocus: true });

    if (finishedId === 'tour_sidebar_nav' && typeof setNavMenuOpen === 'function' && typeof navMenuOpen !== 'undefined' && navMenuOpen) {
      setNavMenuOpen(false);
    }

    if (typeof dashboardView !== 'undefined' && (dashboardView === 'settings' || dashboardView === 'rewards') && typeof playViewActive !== 'undefined' && !playViewActive && typeof renderDashboard === 'function') {
      renderDashboard();
    }

    window.setTimeout(() => {
      if (state.pendingSkillPointGuide && !isTutorialFinished('game_skill_tree')) {
        state.pendingSkillPointGuide = false;
        startTutorial('game_skill_tree', { startAtStepId: 'sp_earned_intro' });
        return;
      }
      if (finishedId === 'game_core' && typeof playViewActive !== 'undefined' && playViewActive) {
        if (typeof mode !== 'undefined' && mode === 'battle') {
          maybeTriggerContextualTutorial();
        }
      } else if (finishedId === 'game_battle' && status === 'completed' && typeof playViewActive !== 'undefined' && playViewActive) {
        if (!isTutorialFinished('game_hud')) {
          startTutorial('game_hud');
        } else {
          maybeTriggerContextualTutorial();
        }
      } else {
        maybeTriggerContextualTutorial();
      }
    }, 120);
  }

  function advanceStep() {
    const step = currentStep();
    if (!step) return;
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

  function startTutorial(tutorialId, { force = false, startAtStepId = null } = {}) {
    if (!isAppReadyWithProfile()) return false;
    if (!force && isTutorialFinished(tutorialId)) return false;

    if (force) {
      setTutorialStatus(tutorialId, null);
    }

    if (tutorialId === 'tour_sidebar_nav' && force && typeof setNavMenuOpen === 'function') {
      setNavMenuOpen(false);
    }

    const steps = buildTutorialSteps(tutorialId);
    if (!steps.length) return false;

    if (typeof hideUiHoverBubble === 'function') hideUiHoverBubble();

    state.returnFocusEl = document.activeElement;
    state.activeId = tutorialId;
    state.steps = steps;
    state.retryCount = 0;

    let startIdx = 0;
    const resumeStepId = startAtStepId || (!force ? getSavedStepId(tutorialId) : null);
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
      startIdx = 0;
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

  // --- Skill-Point Earned Trigger ---
  function onSkillPointEarned(category, treeKey) {
    if (!isAppReadyWithProfile()) return;
    const store = loadStore();
    if (store.spGuideTriggered || isTutorialFinished('game_skill_tree')) return;
    store.spGuideTriggered = true;
    saveStore(store);
    state.pendingSkillTreeKey = treeKey || null;

    // If no other tutorial is currently active and we are not in the middle of battle feedback, start immediately
    if (!state.activeId && !(typeof mode !== 'undefined' && mode === 'battle' && typeof battle !== 'undefined' && battle.phase === 'feedback')) {
      window.setTimeout(() => {
        if (!state.activeId && !isTutorialFinished('game_skill_tree')) {
          startTutorial('game_skill_tree', { startAtStepId: 'sp_earned_intro' });
        }
      }, 140);
    } else {
      state.pendingSkillPointGuide = true;
    }
  }

  // --- Automatic First-Visit Context Detection ---
  function maybeTriggerContextualTutorial() {
    if (!isAppReadyWithProfile()) return;

    // 1. Check active overlays first (Skill Tree & World Map)
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen) {
      if (state.activeId === 'game_skill_tree') {
        const step = currentStep();
        if (step && (step.id === 'sp_earned_intro' || step.id === 'sp_open_tree')) {
          const idx = state.steps.findIndex((s) => s.id === 'sp_find_and_inspect');
          if (idx >= 0) {
            state.stepIndex = idx;
            renderCurrentStep({ focusBubble: true });
          }
        }
        return;
      }
      if (state.activeId && state.activeId !== 'game_skill_tree') {
        stopActiveTutorial({ restoreFocus: false });
      }
      if (!state.activeId && !isTutorialFinished('game_skill_tree')) {
        startTutorial('game_skill_tree');
      }
      return;
    }

    if (typeof worldMapOpen !== 'undefined' && worldMapOpen) {
      if (state.activeId && state.activeId !== 'game_world_map') {
        stopActiveTutorial({ restoreFocus: false });
      }
      if (!state.activeId && !isTutorialFinished('game_world_map')) {
        startTutorial('game_world_map');
      }
      return;
    }

    if (state.activeId === 'game_skill_tree' && typeof skillTreeOpen !== 'undefined' && !skillTreeOpen) {
      const step = currentStep();
      if (step && step.id !== 'sp_earned_intro' && step.id !== 'sp_open_tree') {
        stopActiveTutorial({ restoreFocus: false });
      }
    }
    if (state.activeId === 'game_world_map') {
      stopActiveTutorial({ restoreFocus: false });
    }

    if (isOverlayModalBlockingPageTours()) return;

    // Pending Skill-Point Earned guide takes priority once current battle feedback or active tour finishes
    if (state.pendingSkillPointGuide && !state.activeId && !isTutorialFinished('game_skill_tree')) {
      const inFeedback = typeof mode !== 'undefined' && mode === 'battle' && typeof battle !== 'undefined' && battle.phase === 'feedback';
      if (!inFeedback) {
        state.pendingSkillPointGuide = false;
        startTutorial('game_skill_tree', { startAtStepId: 'sp_earned_intro' });
        return;
      }
    }

    // 2. In-Play Gameplay Lessons
    if (typeof playViewActive !== 'undefined' && playViewActive) {
      if (state.activeId && state.activeId.startsWith('tour_')) {
        stopActiveTutorial({ restoreFocus: false });
      }

      if (typeof mode !== 'undefined' && mode === 'explore' && !isMultiplayer()) {
        if (!state.activeId) {
          if (!isTutorialFinished('game_core')) {
            startTutorial('game_core');
            return;
          }
          if (!isTutorialFinished('game_hud')) {
            startTutorial('game_hud');
            return;
          }
        }
        return;
      }

      if (typeof mode !== 'undefined' && mode === 'battle') {
        if (state.activeId === 'game_core') {
          const step = currentStep();
          if (step && step.id === 'core_attack') {
            advanceStep();
          }
          return;
        }
        if (!state.activeId && typeof battle !== 'undefined') {
          if (battle.phase === 'reward' && !isTutorialFinished('game_card_reward')) {
            startTutorial('game_card_reward');
            return;
          }
          if (battle.phase === 'upgrade' && !isTutorialFinished('game_level_up')) {
            startTutorial('game_level_up');
            return;
          }
          if (!isTutorialFinished('game_battle') && (battle.phase === 'choose' || battle.phase === 'question' || battle.phase === 'feedback')) {
            startTutorial('game_battle');
            return;
          }
        }
        return;
      }
      return;
    }

    // 3. Dashboard Page Tours (when !playViewActive)
    if (state.activeId && state.activeId.startsWith('game_') && state.activeId !== 'game_skill_tree') {
      stopActiveTutorial({ restoreFocus: false });
    }

    const view = typeof dashboardView !== 'undefined' ? dashboardView : 'quest';

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
    const step = currentStep();
    return Boolean(state.activeId && step && isStepActionRequired(step));
  }

  function shouldHoldEncounter() {
    const step = currentStep();
    return Boolean(state.activeId === 'game_core' && step && step.holdEncounter);
  }

  function interceptKey(normalizedKey, rawKey, down, repeat) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    const actionReq = isStepActionRequired(step);

    const k = String(normalizedKey || '').toLowerCase();
    const rk = String(rawKey || '').toLowerCase();

    if (!down) {
      if ((k === 'a' || k === 'd') && typeof keys !== 'undefined' && keys[k]) {
        keys[k].pressed = false;
      }
      return false;
    }

    if (!actionReq) {
      // Allow picking a reward card or level-up upgrade with keys 1-3 even while reading Step 1 of game_card_reward / game_level_up
      if ((state.activeId === 'game_card_reward' || state.activeId === 'game_level_up') && ['1', '2', '3'].includes(k)) {
        return false;
      }
      if (!repeat && (k === 'enter' || k === 'space' || rk === ' ')) {
        advanceStep();
      }
      if (typeof playViewActive !== 'undefined' && playViewActive) {
        return true;
      }
      return false;
    }

    const allowed = Array.isArray(step.allowedKeys) ? step.allowedKeys : [];
    const isAllowed = allowed.includes(k) || allowed.includes(rk);
    if (!isAllowed) {
      if (typeof keys !== 'undefined') {
        keys.a.pressed = false;
        keys.d.pressed = false;
      }
      return true;
    }

    if (state.activeId === 'game_core') {
      if (step.id === 'core_move' && (k === 'a' || k === 'd')) {
        keys[k].pressed = true;
        window.setTimeout(() => {
          if (state.activeId === 'game_core' && currentStep()?.id === 'core_move') {
            advanceStep();
          }
        }, 180);
        return false;
      }
      if (step.id === 'core_jump' && (k === 'w' || k === 'space')) {
        if (typeof player !== 'undefined' && player.velocity && player.velocity.y === 0) {
          player.velocity.y = -22;
        }
        window.setTimeout(() => {
          if (state.activeId === 'game_core' && currentStep()?.id === 'core_jump') {
            advanceStep();
          }
        }, 120);
        return true;
      }
      if (step.id === 'core_door') {
        if (k === 'up' || rk === 'arrowup' || k === 'w') {
          triggerTutorialDoorFeedback();
          window.setTimeout(() => {
            if (state.activeId === 'game_core' && currentStep()?.id === 'core_door') {
              advanceStep();
            }
          }, 120);
          return true;
        }
        return false;
      }
      if (step.id === 'core_attack') {
        if (k === 'a' || k === 'd') {
          nudgePlayerTowardNearestEnemy(k);
        }
        return false;
      }
    }

    if (state.activeId === 'game_skill_tree') {
      if (step.id === 'sp_open_tree' && k === 'u') {
        if (typeof openSkillTree === 'function') openSkillTree();
        return true;
      }
      if (step.id === 'sp_close_tree' && (k === 'u' || rk === 'escape')) {
        setTutorialStatus('game_skill_tree', 'completed');
        stopActiveTutorial({ restoreFocus: false });
        if (typeof closeSkillTree === 'function') closeSkillTree();
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
    if (state.activeId === 'game_skill_tree' && step.id === 'sp_close_tree') {
      event.preventDefault();
      setTutorialStatus('game_skill_tree', 'completed');
      stopActiveTutorial({ restoreFocus: false });
      if (typeof closeSkillTree === 'function') closeSkillTree();
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
    return false;
  }

  function interceptTouchButton(key, btn, event) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    if (!isStepActionRequired(step)) return true;
    if (step.allowClickSelector && btn && btn.matches(step.allowClickSelector)) {
      return false;
    }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    return true;
  }

  function onTouchButtonAction(key) {
    const step = currentStep();
    if (!state.activeId || !step) return;

    if (state.activeId === 'game_core') {
      if (step.id === 'core_move' && (key === 'a' || key === 'd')) {
        window.setTimeout(() => {
          if (state.activeId === 'game_core' && currentStep()?.id === 'core_move') {
            advanceStep();
          }
        }, 160);
      } else if (step.id === 'core_jump' && key === 'w') {
        if (typeof player !== 'undefined' && player.velocity && player.velocity.y === 0) {
          player.velocity.y = -22;
        }
        window.setTimeout(() => {
          if (state.activeId === 'game_core' && currentStep()?.id === 'core_jump') {
            advanceStep();
          }
        }, 120);
      } else if (step.id === 'core_door' && key === 'up') {
        triggerTutorialDoorFeedback();
        window.setTimeout(() => {
          if (state.activeId === 'game_core' && currentStep()?.id === 'core_door') {
            advanceStep();
          }
        }, 120);
      } else if (step.id === 'core_attack' && (key === 'a' || key === 'd')) {
        nudgePlayerTowardNearestEnemy(key);
      }
    }
  }

  function interceptPracticeClick(action, el) {
    const step = currentStep();
    if (!state.activeId || !step) return false;
    if (!isStepActionRequired(step)) return false;
    if (step.allowClickSelector && el && el.matches(step.allowClickSelector)) {
      return false;
    }
    return true;
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
    // Never block claiming a card reward or level-up upgrade during their contextual reward tutorials
    if (state.activeId === 'game_card_reward' && act === 'pickcard') {
      return false;
    }
    if (state.activeId === 'game_level_up' && act === 'upgrade') {
      return false;
    }
    if (!isStepActionRequired(step)) return true;
    if (step.allowClickSelector && btn && btn.matches(step.allowClickSelector)) {
      return false;
    }
    return true;
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
      if (step && step.id === 'core_attack') {
        advanceStep();
      }
    }
  }

  // --- Guide Button Visibility & Context Tutorial Resolution ---
  function getRelevantContextTutorialId() {
    if (!isAppReadyWithProfile()) return null;
    if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen) return 'game_skill_tree';
    if (typeof worldMapOpen !== 'undefined' && worldMapOpen) return 'game_world_map';
    if (window.mpUI?.isOpen) return null;

    if (typeof playViewActive !== 'undefined' && playViewActive) {
      if (isMultiplayer()) return null;
      if (typeof mode !== 'undefined' && mode === 'battle') {
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
    }

    window.setTimeout(() => maybeTriggerContextualTutorial(), 60);
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
      window.setTimeout(() => maybeTriggerContextualTutorial(), 80);
    } else if (state.activeId === 'game_skill_tree') {
      const step = currentStep();
      if (step && step.id === 'sp_close_tree') {
        setTutorialStatus('game_skill_tree', 'completed');
      }
      stopActiveTutorial({ restoreFocus: false });
    }
  }

  function onSkillTreeAction(action) {
    if (state.activeId !== 'game_skill_tree') return;
    const step = currentStep();
    if (!step) return;
    if (step.id === 'sp_find_and_inspect' && (action === 'start' || action === 'select')) {
      if (action === 'start') {
        const eligibleNode = findFirstEligibleSkillNode();
        if (eligibleNode && eligibleNode.dataset.skillSelect && eligibleNode.dataset.skillTree) {
          eligibleNode.click();
          return;
        }
      }
      advanceStep();
    }
  }

  function onWorldMapState(isOpen) {
    syncGuideButtonsVisibility();
    if (isOpen) {
      window.setTimeout(() => maybeTriggerContextualTutorial(), 80);
    } else if (state.activeId === 'game_world_map') {
      const step = currentStep();
      if (step && step.id === 'map_close') {
        setTutorialStatus('game_world_map', 'completed');
      }
      stopActiveTutorial({ restoreFocus: false });
    }
  }

  function onTryDoor() {
    if (state.activeId === 'game_core' && currentStep()?.id === 'core_door') {
      window.setTimeout(() => {
        if (state.activeId === 'game_core' && currentStep()?.id === 'core_door') {
          advanceStep();
        }
      }, 100);
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
    state.pendingSkillPointGuide = false;
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
      completeActiveTutorial('skipped');
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

    document.addEventListener('click', (e) => {
      const step = currentStep();
      if (!state.activeId || !step) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest('#tutorialBubble')) return;
      if (target.closest('#topbarTourButton, #hudTourButton')) return;

      // Special handling when clicking a Skill Tree purchase button during Step 4
      if (state.activeId === 'game_skill_tree' && step.id === 'sp_select_upgrade' && target.closest('#skillTreeDetail [data-skill-purchase]:not(:disabled)')) {
        window.setTimeout(() => {
          if (state.activeId === 'game_skill_tree' && currentStep()?.id === 'sp_select_upgrade') {
            advanceStep();
          }
        }, 120);
        return;
      }

      if (isStepActionRequired(step)) {
        if (step.allowClickSelector && target.closest(step.allowClickSelector)) {
          return;
        }
        if (!step.allowClickSelector && state.targetEl && state.targetEl.contains(target)) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    window.addEventListener('resize', () => {
      if (state.activeId) positionSpotlightAndBubble();
    });
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
    REQUIRED_TUTORIAL_IDS,
    TUTORIAL_CATALOG,
    get state() {
      return state;
    },
  };
})();
