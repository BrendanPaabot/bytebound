// ===== Question selection: topic-aware adaptive difficulty, capability analytics, spaced review =====
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const REVIEW_CHANCE = 0.3;   // chance that a standard battle question is a due review question
const BOSS_REVIEW_CHANCE = 0.5; // higher chance during boss fights
const REVIEW_DELAY = 3;      // answers to wait before a missed question can come back
const REVIEW_LIMIT = 25;     // most questions kept in the review queue
const BASELINE_ATTEMPTS = 3; // first N attempts per topic form the diagnostic baseline
const REVIEW_STORAGE_KEY = 'kings-pigs-review-v1';
let practiceRunActive = false;

const QUESTION_DIFFICULTY = new Map();
const CATEGORY_TOPICS = {};
for (const difficulty of DIFFICULTIES) {
  for (const question of QUESTION_BANK[difficulty]) {
    QUESTION_DIFFICULTY.set(question.q, difficulty);
    CATEGORY_TOPICS[question.category] ||= new Set();
    CATEGORY_TOPICS[question.category].add(question.topic);
  }
}
const DISCIPLINE_CATEGORIES = Object.keys(CATEGORY_TOPICS);

function getTopicStats(category, topic) {
  return (typeof topicProgress !== 'undefined' && topicProgress[category]?.[topic])
    || { correct: 0, attempted: 0, baselineCorrect: 0, baselineAttempted: 0, streak: 0 };
}

function getTopicMasteryState(stats) {
  const attempted = stats?.attempted || 0;
  const correct = stats?.correct || 0;
  if (attempted === 0) return 'unexplored';
  if (attempted < BASELINE_ATTEMPTS) return 'diagnostic';
  const ratio = correct / attempted;
  if (ratio < 0.6) return 'weak';
  if (ratio >= 0.8 && attempted >= 4) return 'mastered';
  return 'practicing';
}

function getTopicCapabilityMeta(stats) {
  const state = getTopicMasteryState(stats);
  if (state === 'mastered') return { state, label: 'MASTERED', tone: 'mastered' };
  if (state === 'practicing') {
    const ratio = stats.attempted ? stats.correct / stats.attempted : 0;
    return { state, label: ratio >= 0.72 ? 'PROFICIENT' : 'DEVELOPING', tone: 'practicing' };
  }
  if (state === 'weak') return { state, label: 'NEEDS FOCUS', tone: 'weak' };
  if (state === 'diagnostic') return { state, label: 'CALIBRATING', tone: 'diagnostic' };
  return { state, label: 'UNEXPLORED', tone: 'unexplored' };
}

function getCapabilityRank(accuracyRatio, attempted, masteredCount = 0, totalTopics = 5) {
  if (!attempted) return { title: 'Unranked', code: 'UNRANKED', tier: 0, score: 0 };
  const coverage = Math.min(1, attempted / Math.max(4, totalTopics * 2));
  const masteryBonus = totalTopics > 0 ? (masteredCount / totalTopics) * 0.2 : 0;
  const composite = Math.min(1, accuracyRatio * 0.72 + coverage * 0.18 + masteryBonus);
  const score = Math.round(composite * 100);
  if (attempted < 3 || accuracyRatio < 0.45) {
    return { title: 'Novice', code: 'NOVICE', tier: 1, score: Math.max(12, score) };
  }
  if (accuracyRatio < 0.68 || attempted < 6) {
    return { title: 'Apprentice', code: 'APPRENTICE', tier: 2, score: Math.max(38, score) };
  }
  if (accuracyRatio < 0.84 || masteredCount < Math.max(1, Math.floor(totalTopics * 0.4))) {
    return { title: 'Specialist', code: 'SPECIALIST', tier: 3, score: Math.max(66, score) };
  }
  return { title: 'Master', code: 'MASTER', tier: 4, score: Math.max(88, score) };
}

// Topic-level adaptive need weight so every topic is weighted fairly.
function getTopicNeedWeight(category, topicName) {
  const stats = getTopicStats(category, topicName);
  const state = getTopicMasteryState(stats);
  if (state === 'unexplored') return 2.45;
  if (state === 'diagnostic') return 2.05;
  const ratio = stats.correct / stats.attempted;
  if (state === 'weak') {
    const streakPenalty = (stats.streak || 0) === 0 ? 0.35 : 0;
    return 1.85 + (1 - ratio) * 2.15 + streakPenalty;
  }
  if (state === 'practicing') {
    return 1.15 + (1 - ratio) * 0.9;
  }
  return 0.42;
}

// Kept for backward compatibility with any external caller expecting topicWeight(question).
function topicWeight(question) {
  return getTopicNeedWeight(question.category, question.topic);
}

function pickWeighted(pool, weightFn = topicWeight) {
  if (!pool.length) return null;
  const weights = pool.map(weightFn);
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

let activeReviewStorageKey = REVIEW_STORAGE_KEY;
let reviewQueue = [];   // { text, due }: due is the answer count from which the question can come back
let answerCount = 0;

function loadReviewStore(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    const queue = Array.isArray(saved && saved.queue)
      ? saved.queue.filter((entry) => entry && typeof entry.text === 'string' && QUESTION_DIFFICULTY.has(entry.text) && Number.isFinite(entry.due))
      : [];
    const counter = saved && Number.isSafeInteger(saved.counter) && saved.counter >= 0 ? saved.counter : 0;
    return { queue, counter };
  } catch (error) {
    console.error('Unable to load the review queue.', error);
    return { queue: [], counter: 0 };
  }
}

function saveReviewStore() {
  if (practiceRunActive) return;
  try {
    localStorage.setItem(activeReviewStorageKey, JSON.stringify({ queue: reviewQueue, counter: answerCount }));
    if (typeof scheduleUserProfileSync === 'function') scheduleUserProfileSync();
  } catch (error) {
    console.error('Unable to save the review queue.', error);
  }
}

function selectReviewProfile(profileId) {
  activeReviewStorageKey = `${REVIEW_STORAGE_KEY}:${encodeURIComponent(profileId)}`;
  const saved = loadReviewStore(activeReviewStorageKey);
  reviewQueue = saved.queue;
  answerCount = saved.counter;
}

function questionByText(text) {
  const difficulty = QUESTION_DIFFICULTY.get(text);
  return difficulty ? QUESTION_BANK[difficulty].find((question) => question.q === text) : null;
}

// Every answered question (battle or practice) goes through here.
function recordReview(question, correct) {
  answerCount++;
  const index = reviewQueue.findIndex((entry) => entry.text === question.q);
  if (correct) {
    if (index >= 0) reviewQueue.splice(index, 1);
  } else {
    const entry = { text: question.q, due: answerCount + REVIEW_DELAY };
    if (index >= 0) reviewQueue[index] = entry;
    else reviewQueue.push(entry);
    while (reviewQueue.length > REVIEW_LIMIT) reviewQueue.shift();
  }
  saveReviewStore();
}

function dueReviewQuestion() {
  const entry = reviewQueue.find((item) => item.due <= answerCount);
  return entry ? questionByText(entry.text) : null;
}

class AdaptiveDifficulty {
  constructor() {
    this.focusCategory = null;
    this.reset();
  }

  reset() {
    this.level = 0;
    this.mediumStreak = 0;
    this.used = { easy: [], medium: [], hard: [] };
    this.fromReview = false;
    this.categoryState = Object.fromEntries(
      DISCIPLINE_CATEGORIES.map((cat) => [cat, { level: 0, mediumStreak: 0 }]),
    );
    this.lastSelection = {
      mode: 'adaptive',
      badge: 'ADAPTIVE PROBE',
      category: DISCIPLINE_CATEGORIES[0] || 'Computer Systems',
      topic: null,
      difficulty: 'easy',
    };
    this.calibrateFromProgress();
  }

  get name() { return DIFFICULTIES[this.level] || 'easy'; }

  categoryLevel(category) {
    return this.categoryState?.[category]?.level ?? this.level;
  }

  categoryDifficultyName(category) {
    return DIFFICULTIES[this.categoryLevel(category)] || this.name;
  }

  calibrateFromProgress() {
    if (typeof topicProgress === 'undefined' || !topicProgress) return;
    let levelSum = 0;
    let activeCategories = 0;
    for (const category of DISCIPLINE_CATEGORIES) {
      const topics = Object.values(topicProgress[category] || {});
      const attempted = topics.reduce((sum, item) => sum + (item.attempted || 0), 0);
      const correct = topics.reduce((sum, item) => sum + (item.correct || 0), 0);
      const ratio = attempted ? correct / attempted : 0;
      let level = 0;
      if (attempted >= 8 && ratio >= 0.8) level = 2;
      else if (attempted >= 3 && ratio >= 0.62) level = 1;
      this.categoryState[category] = { level, mediumStreak: 0 };
      if (attempted > 0) {
        levelSum += level;
        activeCategories++;
      }
    }
    if (activeCategories > 0) {
      this.level = Math.min(2, Math.max(0, Math.round(levelSum / activeCategories)));
    }
  }

  setFocusCategory(category) {
    this.focusCategory = category && DISCIPLINE_CATEGORIES.includes(category) ? category : null;
    if (this.focusCategory) {
      this.level = this.categoryLevel(this.focusCategory);
    }
  }

  // Finds the weakest topic (or unexplored/diagnostic topic) for Boss Weakness Exams or Tracker insights.
  getWeakestTarget(preferredCategory = null) {
    const candidates = [];
    const categories = preferredCategory && DISCIPLINE_CATEGORIES.includes(preferredCategory)
      ? [preferredCategory]
      : DISCIPLINE_CATEGORIES;
    for (const category of categories) {
      for (const topic of CATEGORY_TOPICS[category] || []) {
        const stats = getTopicStats(category, topic);
        const state = getTopicMasteryState(stats);
        const ratio = stats.attempted ? stats.correct / stats.attempted : 0;
        candidates.push({
          category,
          topic,
          stats,
          state,
          ratio,
          weight: getTopicNeedWeight(category, topic),
        });
      }
    }
    const attemptedWeak = candidates
      .filter((item) => item.stats.attempted > 0)
      .sort((a, b) => a.ratio - b.ratio || b.stats.attempted - a.stats.attempted);
    if (attemptedWeak.length && attemptedWeak[0].ratio < 0.78) {
      return attemptedWeak[0];
    }
    return candidates.sort((a, b) => b.weight - a.weight)[0] || null;
  }

  nextQuestion() {
    const isBossEncounter = typeof battle !== 'undefined' && Boolean(battle?.enemy?.isBoss);
    const due = dueReviewQuestion();
    const reviewChance = isBossEncounter ? BOSS_REVIEW_CHANCE : REVIEW_CHANCE;
    if (due && (!this.focusCategory || due.category === this.focusCategory) && Math.random() < reviewChance) {
      this.fromReview = true;
      const diff = QUESTION_DIFFICULTY.get(due.q) || this.categoryDifficultyName(due.category);
      this.lastSelection = {
        mode: 'review',
        badge: isBossEncounter ? 'BOSS REVIEW CHECK' : 'SPACED REVIEW',
        category: due.category,
        topic: due.topic,
        difficulty: diff,
      };
      return due;
    }
    this.fromReview = false;

    // 1. Choose target topic fairly at the topic level (or boss weakness target).
    let chosenTopicEntry = null;
    if (isBossEncounter) {
      chosenTopicEntry = this.getWeakestTarget(this.focusCategory);
    }
    if (!chosenTopicEntry) {
      const topicEntries = [];
      const categories = this.focusCategory ? [this.focusCategory] : DISCIPLINE_CATEGORIES;
      for (const category of categories) {
        for (const topic of CATEGORY_TOPICS[category] || []) {
          topicEntries.push({
            category,
            topic,
            state: getTopicMasteryState(getTopicStats(category, topic)),
            weight: getTopicNeedWeight(category, topic),
          });
        }
      }
      chosenTopicEntry = pickWeighted(topicEntries, (entry) => entry.weight);
    }

    const targetCategory = chosenTopicEntry?.category || this.focusCategory || DISCIPLINE_CATEGORIES[0];
    const targetTopic = chosenTopicEntry?.topic || null;
    const topicState = chosenTopicEntry?.state || 'unexplored';

    // 2. Determine difficulty for the chosen discipline/topic.
    let targetLevel = this.categoryLevel(targetCategory);
    if (isBossEncounter) {
      targetLevel = Math.max(1, targetLevel); // Bosses test at least Medium difficulty
    } else if (topicState === 'weak' && targetLevel === 2) {
      targetLevel = 1; // Step down from Hard to Medium when remediating a weak topic
    } else if (topicState === 'mastered' && targetLevel === 0) {
      targetLevel = 1; // Nudge mastered topics up from Easy to Medium
    }
    this.level = targetLevel;
    const key = DIFFICULTIES[targetLevel] || 'easy';

    // 3. Draw an unused question matching the chosen topic & difficulty.
    let pool = QUESTION_BANK[key].filter(
      (q) => q.category === targetCategory && (!targetTopic || q.topic === targetTopic) && !this.used[key].includes(q),
    );
    if (pool.length === 0) {
      // Clear used questions for this specific topic so all 4 questions in the topic cycle cleanly
      this.used[key] = this.used[key].filter(
        (q) => !(q.category === targetCategory && (!targetTopic || q.topic === targetTopic)),
      );
      pool = QUESTION_BANK[key].filter(
        (q) => q.category === targetCategory && (!targetTopic || q.topic === targetTopic),
      );
    }
    if (pool.length === 0) {
      pool = QUESTION_BANK[key].filter((q) => !this.used[key].includes(q));
      if (pool.length === 0) {
        this.used[key] = [];
        pool = QUESTION_BANK[key];
      }
    }

    const q = pool[Math.floor(Math.random() * pool.length)] || pickWeighted(pool);
    this.used[key].push(q);

    let badge = 'ADAPTIVE CHALLENGE';
    let mode = 'adaptive';
    if (isBossEncounter) {
      badge = 'BOSS WEAKNESS EXAM';
      mode = 'boss-weakness';
    } else if (this.focusCategory) {
      badge = 'PINNED FOCUS';
      mode = 'pinned-focus';
    } else if (topicState === 'weak') {
      badge = 'WEAK TOPIC FOCUS';
      mode = 'weak-focus';
    } else if (topicState === 'unexplored' || topicState === 'diagnostic') {
      badge = 'DIAGNOSTIC PROBE';
      mode = 'diagnostic';
    } else if (topicState === 'mastered') {
      badge = 'MASTERY CHALLENGE';
      mode = 'mastery';
    }

    this.lastSelection = {
      mode,
      badge,
      category: q.category,
      topic: q.topic,
      difficulty: key,
    };
    return q;
  }

  // Correct answers raise difficulty for that discipline (and overall), wrong answers lower it.
  // Medium advances to Hard only after two consecutive correct answers at Medium.
  record(correct, question = typeof battle !== 'undefined' ? battle?.question : null) {
    const category = question?.category;
    if (category && this.categoryState?.[category]) {
      const catState = this.categoryState[category];
      if (!correct) {
        catState.mediumStreak = 0;
        catState.level = Math.max(0, catState.level - 1);
      } else if (catState.level === 0) {
        catState.level = 1;
      } else if (catState.level === 1 && ++catState.mediumStreak >= 2) {
        catState.level = 2;
        catState.mediumStreak = 0;
      }
      this.level = catState.level;
    } else if (!correct) {
      this.mediumStreak = 0;
      this.level = Math.max(0, this.level - 1);
    } else if (this.level === 0) {
      this.level = 1;
    } else if (this.level === 1 && ++this.mediumStreak >= 2) {
      this.level = 2;
      this.mediumStreak = 0;
    }
  }
}

const SKILL_POINT_INTERVAL = 5;
const SKILL_STORAGE_KEY = 'kings-pigs-skill-tree-v1';
let activeSkillStorageKey = SKILL_STORAGE_KEY;
let activeSkillSpecialization = null;
let exclusiveSkillTree = null;
const TOPIC_TRACKER_STORAGE_KEY = 'kings-pigs-topic-tracker-v1';
let activeTopicTrackerStorageKey = TOPIC_TRACKER_STORAGE_KEY;
const SKILL_TREES = {
  computerSystems: {
    name: 'Computer Systems',
    color: 'gold',
    exclusiveId: 'kernelAegis',
    skills: [
      { id: 'foundation', name: 'Hardware Tuning', description: 'Tune your knight’s gear for stronger physical attacks.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'operatingSystem', name: 'OS Stability', description: 'Harden system defenses to reduce incoming damage.', effect: '+1 DEF per rank', bonus: { defense: 1 }, requires: ['foundation'] },
      { id: 'kernelAegis', name: 'Kernel Aegis', description: 'Costs 10 MP; blocks standard hits, fully heals you, grants 40 MP and an ATK/DEF surge, but wrong answers drain HP/MP and bosses pierce the shield.', effect: 'Active Card: Shield Normal Hits + Full Heal + 35/70/105 DMG (4t CD)', bonus: {}, isExclusiveActive: true, activeCardId: 'kernel_aegis', maxRank: 3, requires: ['operatingSystem'] },
      { id: 'recovery', name: 'Recovery Protocol', description: 'Restore more health whenever you answer correctly.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['kernelAegis'] },
      { id: 'virtualization', name: 'Virtualization', description: 'Run isolated virtual systems to expand your health reserve.', effect: '+5 max HP per rank', bonus: { maxHp: 5 }, requires: ['kernelAegis'] },
      { id: 'thermalControl', name: 'Thermal Control', description: 'Keep hardware stable under pressure and reinforce your armor.', effect: '+2 DEF per rank', bonus: { defense: 2 }, requires: ['recovery'] },
      { id: 'firmwareOverclock', name: 'Firmware Overclock', description: 'Push optimized firmware beyond its standard limits.', effect: '+2 ATK and +2 max HP per rank', bonus: { attack: 2, maxHp: 2 }, requires: ['virtualization'] },
    ],
  },
  networkingSecurity: {
    name: 'Networking & Security',
    color: 'blue',
    exclusiveId: 'packetLockdown',
    skills: [
      { id: 'foundation', name: 'Firewall', description: 'Filter incoming threats and strengthen your guard.', effect: '+1 DEF per rank', bonus: { defense: 1 } },
      { id: 'threatAnalysis', name: 'Threat Analysis', description: 'Identify weak points and turn threat intelligence into damage.', effect: '+1 ATK per rank', bonus: { attack: 1 }, requires: ['foundation'] },
      { id: 'packetLockdown', name: 'Packet Lockdown', description: 'Costs 10 MP; stuns foes for 8–12 turns, deals 40–120 breach damage, makes them take 50% more hit damage, and grants 20 MP.', effect: 'Active Card: 8–12t Stun + 40/80/120 DMG + 1.5x Vulnerable (3t CD)', bonus: {}, isExclusiveActive: true, activeCardId: 'packet_lockdown', maxRank: 3, requires: ['threatAnalysis'] },
      { id: 'secureChannel', name: 'Secure Channel', description: 'Recover mana through safe, reliable communication.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['packetLockdown'] },
      { id: 'intrusionDetection', name: 'Intrusion Detection', description: 'Detect hostile activity early and prepare a stronger response.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['packetLockdown'] },
      { id: 'packetRouting', name: 'Packet Routing', description: 'Route resources efficiently to increase your mana capacity.', effect: '+5 max MP per rank', bonus: { maxMana: 5 }, requires: ['secureChannel'] },
      { id: 'zeroTrust', name: 'Zero Trust', description: 'Verify every action and regain more health with correct answers.', effect: '+3 HP per correct answer per rank', bonus: { bonusHeal: 3 }, requires: ['intrusionDetection'] },
    ],
  },
  programming: {
    name: 'Programming',
    color: 'green',
    exclusiveId: 'overburnExecution',
    skills: [
      { id: 'foundation', name: 'Algorithm Efficiency', description: 'Improve attack routines with more efficient algorithms.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'errorHandling', name: 'Error Handling', description: 'Catch mistakes early and reduce the impact of enemy attacks.', effect: '+1 DEF per rank', bonus: { defense: 1 }, requires: ['foundation'] },
      { id: 'overburnExecution', name: 'Overburn Execution', description: 'Costs 15 MP; deals 100–200 base damage, doubles buffs, gains a 1.5× execute below 40% HP, and burns for 20–60 damage per turn for 5 turns.', effect: 'Active Card: 100–200+ DMG (Execute) & 20–60 Burn/t (2t CD)', bonus: {}, isExclusiveActive: true, activeCardId: 'plasma_compile', maxRank: 3, requires: ['errorHandling'] },
      { id: 'codeReuse', name: 'Code Reuse', description: 'Reuse reliable recovery routines to heal more on correct answers.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['overburnExecution'] },
      { id: 'concurrency', name: 'Concurrency', description: 'Coordinate parallel tasks to restore mana more efficiently.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['overburnExecution'] },
      { id: 'runtimeOptimization', name: 'Runtime Optimization', description: 'Optimize execution paths for greater combat output.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['codeReuse'] },
      { id: 'compilerMastery', name: 'Compiler Mastery', description: 'Transform advanced optimizations into a large attack increase.', effect: '+2 ATK per rank', bonus: { attack: 2 }, requires: ['concurrency'] },
    ],
  },
  database: {
    name: 'Database',
    color: 'red',
    exclusiveId: 'necromancy',
    skills: [
      { id: 'foundation', name: 'Query Indexing', description: 'Index battle knowledge for faster, more decisive attacks.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'transactions', name: 'Transaction Safety', description: 'Apply reliable transaction principles to improve defense.', effect: '+1 DEF per rank', bonus: { defense: 1 }, requires: ['foundation'] },
      { id: 'necromancy', name: 'Necromancy', description: 'Spend MP to raise up to three fallen enemies or bosses, who attack after each correct answer; stronger allies cost more MP.', effect: 'Max Undead Allies: 1 per rank (up to 3 · Costs MP)', bonus: {}, isExclusiveActive: true, activeCardId: null, isNecromancy: true, maxRank: 3, requires: ['transactions'] },
      { id: 'queryCache', name: 'Query Cache', description: 'Cache useful results to regain mana on correct answers.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['necromancy'] },
      { id: 'replication', name: 'Replication', description: 'Replicate critical resources to expand your mana reserve.', effect: '+5 max MP per rank', bonus: { maxMana: 5 }, requires: ['necromancy'] },
      { id: 'queryOptimizer', name: 'Query Optimizer', description: 'Choose efficient query plans for balanced combat improvements.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['queryCache'] },
      { id: 'acidGuarantee', name: 'ACID Guarantee', description: 'Protect consistency under pressure and increase health recovery.', effect: '+3 HP per correct answer per rank', bonus: { bonusHeal: 3 }, requires: ['replication'] },
    ],
  },
};
const SKILL_TREE_KEYS = Object.keys(SKILL_TREES);
const SKILL_MAX_RANK = 3;
const SKILLS_TO_SPECIALIZE = (treeKey) => Math.ceil(SKILL_TREES[treeKey].skills.length / 2);

function createSkillProgress() {
  return Object.fromEntries(SKILL_TREE_KEYS.map((key) => [
    key,
    {
      correct: 0,
      transferredIn: 0,
      transferredOut: 0,
      ranks: Object.fromEntries(SKILL_TREES[key].skills.map((skill) => [skill.id, 0])),
    },
  ]));
}

function createTopicProgress() {
  const progress = {};
  for (const questions of Object.values(QUESTION_BANK)) {
    for (const question of questions) {
      progress[question.category] ||= {};
      progress[question.category][question.topic] ||= {
        correct: 0,
        attempted: 0,
        baselineCorrect: 0,
        baselineAttempted: 0,
        streak: 0,
      };
    }
  }
  return progress;
}

function loadTopicProgress(storageKey = activeTopicTrackerStorageKey) {
  const progress = createTopicProgress();
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return progress;
    const stored = JSON.parse(saved);
    for (const [category, topics] of Object.entries(progress)) {
      for (const topic of Object.keys(topics)) {
        const source = stored?.[category]?.[topic];
        if (!source || typeof source !== 'object') continue;
        if (Number.isSafeInteger(source.attempted) && source.attempted >= 0) {
          topics[topic].attempted = source.attempted;
        }
        if (Number.isSafeInteger(source.correct) && source.correct >= 0) {
          topics[topic].correct = Math.min(source.correct, topics[topic].attempted);
        }
        if (Number.isSafeInteger(source.baselineAttempted) && source.baselineAttempted >= 0) {
          topics[topic].baselineAttempted = Math.min(BASELINE_ATTEMPTS, source.baselineAttempted, topics[topic].attempted);
          topics[topic].baselineCorrect = Number.isSafeInteger(source.baselineCorrect)
            ? Math.min(source.baselineCorrect, topics[topic].baselineAttempted)
            : 0;
        } else if (topics[topic].attempted > 0) {
          topics[topic].baselineAttempted = Math.min(BASELINE_ATTEMPTS, topics[topic].attempted);
          topics[topic].baselineCorrect = Math.min(
            topics[topic].baselineAttempted,
            Math.round((topics[topic].correct / topics[topic].attempted) * topics[topic].baselineAttempted),
          );
        }
        if (Number.isSafeInteger(source.streak) && source.streak >= 0) {
          topics[topic].streak = source.streak;
        }
      }
    }
  } catch (error) {
    console.error('Unable to load saved topic tracker progress.', error);
  }
  return progress;
}

const topicProgress = loadTopicProgress();
const adaptive = new AdaptiveDifficulty();

function saveTopicProgress() {
  if (practiceRunActive) return true;
  try {
    localStorage.setItem(activeTopicTrackerStorageKey, JSON.stringify(topicProgress));
    if (typeof scheduleUserProfileSync === 'function') scheduleUserProfileSync();
    return true;
  } catch (error) {
    console.error('Unable to save topic tracker progress.', error);
    return false;
  }
}

function selectTopicProfile(profileId) {
  activeTopicTrackerStorageKey = `${TOPIC_TRACKER_STORAGE_KEY}:${encodeURIComponent(profileId)}`;
  const profileProgress = loadTopicProgress(activeTopicTrackerStorageKey);
  for (const category of Object.keys(topicProgress)) delete topicProgress[category];
  Object.assign(topicProgress, profileProgress);
  selectReviewProfile(profileId);
  adaptive.calibrateFromProgress();
}

function recordTopicAnswer(question, correct) {
  const topic = topicProgress[question.category]?.[question.topic];
  if (!topic) throw new Error(`Unknown question topic: ${question.category} / ${question.topic}`);
  topic.attempted++;
  if (correct) topic.correct++;
  if ((topic.baselineAttempted || 0) < BASELINE_ATTEMPTS) {
    topic.baselineAttempted = (topic.baselineAttempted || 0) + 1;
    if (correct) topic.baselineCorrect = (topic.baselineCorrect || 0) + 1;
  }
  topic.streak = correct ? (topic.streak || 0) + 1 : 0;
  saveTopicProgress();
  refreshAchievements();
}

function loadSkillProgress(storageKey = activeSkillStorageKey) {
  const progress = createSkillProgress();
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      activeSkillSpecialization = null;
      return progress;
    }
    const stored = JSON.parse(saved);
    activeSkillSpecialization = SKILL_TREE_KEYS.includes(stored?.specialization?.activeTree)
      ? stored.specialization.activeTree
      : null;
    exclusiveSkillTree = SKILL_TREE_KEYS.includes(stored?.specialization?.exclusiveTree)
      ? stored.specialization.exclusiveTree
      : null;
    for (const key of SKILL_TREE_KEYS) {
      const source = stored?.[key];
      if (!source || typeof source !== 'object') continue;
      if (Number.isSafeInteger(source.correct) && source.correct >= 0) {
        progress[key].correct = source.correct;
      }
      if (Number.isSafeInteger(source.transferredIn) && source.transferredIn >= 0) {
        progress[key].transferredIn = source.transferredIn;
      }
      if (Number.isSafeInteger(source.transferredOut) && source.transferredOut >= 0) {
        progress[key].transferredOut = source.transferredOut;
      }
      for (const skill of SKILL_TREES[key].skills) {
        const rank = source.ranks?.[skill.id];
        const maxR = skill.maxRank || SKILL_MAX_RANK;
        if (Number.isInteger(rank) && rank >= 0 && rank <= maxR) {
          progress[key].ranks[skill.id] = rank;
          if (skill.isExclusiveActive && rank > 0) exclusiveSkillTree = key;
        }
      }
    }
  } catch (error) {
    console.error('Unable to load saved skill tree progress.', error);
    activeSkillSpecialization = null;
    exclusiveSkillTree = null;
  }
  return progress;
}

const skillProgress = loadSkillProgress();

function selectSkillProfile(profileId) {
  activeSkillStorageKey = `${SKILL_STORAGE_KEY}:${encodeURIComponent(profileId)}`;
  const profileProgress = loadSkillProgress(activeSkillStorageKey);
  for (const key of Object.keys(skillProgress)) delete skillProgress[key];
  Object.assign(skillProgress, profileProgress);
  selectTopicProfile(profileId);
}

function saveSkillProgress({ skipSlotSave = false } = {}) {
  if (practiceRunActive) return true;
  try {
    localStorage.setItem(activeSkillStorageKey, JSON.stringify({
      ...skillProgress,
      specialization: { activeTree: activeSkillSpecialization, exclusiveTree: exclusiveSkillTree },
    }));
    if (!skipSlotSave && typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
    if (typeof scheduleUserProfileSync === 'function') scheduleUserProfileSync();
    return true;
  } catch (error) {
    console.error('Unable to save skill tree progress.', error);
    return false;
  }
}

function resetSkillTreeForNewRun() {
  const fresh = createSkillProgress();
  for (const key of Object.keys(skillProgress)) delete skillProgress[key];
  Object.assign(skillProgress, fresh);
  activeSkillSpecialization = null;
  exclusiveSkillTree = null;
  saveSkillProgress({ skipSlotSave: true });
}

function applyRunSkillSnapshot(savedSkillProgress, activeSpec = null, exclusiveSpec = null, { skipSlotSave = false } = {}) {
  const base = createSkillProgress();
  if (savedSkillProgress && typeof savedSkillProgress === 'object') {
    for (const key of SKILL_TREE_KEYS) {
      const src = savedSkillProgress[key];
      if (!src || typeof src !== 'object') continue;
      if (Number.isSafeInteger(src.correct) && src.correct >= 0) base[key].correct = src.correct;
      if (Number.isSafeInteger(src.transferredIn) && src.transferredIn >= 0) base[key].transferredIn = src.transferredIn;
      if (Number.isSafeInteger(src.transferredOut) && src.transferredOut >= 0) base[key].transferredOut = src.transferredOut;
      for (const skill of SKILL_TREES[key].skills) {
        const r = src.ranks?.[skill.id];
        const maxR = skill.maxRank || SKILL_MAX_RANK;
        if (Number.isSafeInteger(r) && r >= 0 && r <= maxR) base[key].ranks[skill.id] = r;
      }
    }
  }
  for (const key of Object.keys(skillProgress)) delete skillProgress[key];
  Object.assign(skillProgress, base);
  activeSkillSpecialization = SKILL_TREE_KEYS.includes(activeSpec) ? activeSpec : null;
  exclusiveSkillTree = SKILL_TREE_KEYS.includes(exclusiveSpec) ? exclusiveSpec : null;
  reconcileExclusiveSkillPoints();
  saveSkillProgress({ skipSlotSave });
}

function skillPointsAvailable(key) {
  const progress = skillProgress[key];
  if (!progress) return 0;
  const spent = Object.values(progress.ranks).reduce((total, rank) => total + rank, 0);
  const earned = Math.floor((progress.correct || 0) / SKILL_POINT_INTERVAL);
  const netTransferred = (progress.transferredIn || 0) - (progress.transferredOut || 0);
  return Math.max(0, earned + netTransferred - spent);
}

function reconcileExclusiveSkillPoints() {
  if (!exclusiveSkillTree || !skillProgress[exclusiveSkillTree]) return false;
  let moved = false;
  for (const otherKey of SKILL_TREE_KEYS) {
    if (otherKey === exclusiveSkillTree) continue;
    const unspent = skillPointsAvailable(otherKey);
    if (unspent > 0) {
      skillProgress[otherKey].transferredOut = (skillProgress[otherKey].transferredOut || 0) + unspent;
      skillProgress[exclusiveSkillTree].transferredIn = (skillProgress[exclusiveSkillTree].transferredIn || 0) + unspent;
      moved = true;
    }
  }
  return moved;
}

function applySkillBonus(bonus, multiplier = 1) {
  for (const [stat, amount] of Object.entries(bonus)) {
    hero[stat] = (hero[stat] || 0) + amount * multiplier;
  }
}

function hasNecromancyUnlocked() {
  return (skillProgress.database?.ranks?.necromancy || 0) > 0;
}
function getNecromancyMaxAllies() {
  return skillProgress.database?.ranks?.necromancy || 0;
}
function getNecroAllies() {
  if (Array.isArray(hero.necroAllies) && hero.necroAllies.length) return hero.necroAllies;
  return hero.necroAlly ? [hero.necroAlly] : [];
}
function getNecromancyManaCost(cand) {
  if (!cand) return 20;
  const tierBase = cand.isFinal
    ? 50
    : cand.isBoss
      ? 35
      : cand.nyrmed
        ? 24
        : cand.grenu
          ? 18
          : cand.brute
            ? 14
            : 7;
  const statCost = Math.round((cand.attack || 9) * 1.1 + (cand.maxHp || 40) * 0.08);
  return Math.max(20, Math.min(95, tierBase + statCost));
}

function getUnlockedExclusiveCardId() {
  for (const key of SKILL_TREE_KEYS) {
    for (const skill of SKILL_TREES[key].skills) {
      if (skill.isExclusiveActive && skill.activeCardId && (skillProgress[key]?.ranks?.[skill.id] || 0) > 0) {
        return skill.activeCardId;
      }
    }
  }
  return null;
}

function isSkillTreeLockedOut(key) {
  if (exclusiveSkillTree && exclusiveSkillTree !== key) return true;
  if (activeSkillSpecialization && activeSkillSpecialization !== key && !canSwitchSkillSet()) return true;
  return false;
}

function recordCorrectAnswer(category) {
  const key = SKILL_TREE_KEYS.find((treeKey) => SKILL_TREES[treeKey].name === category);
  if (!key) return false;
  if (exclusiveSkillTree && key !== exclusiveSkillTree) return false;

  const previousPoints = Math.floor(skillProgress[key].correct / SKILL_POINT_INTERVAL);
  skillProgress[key].correct++;
  saveSkillProgress();
  const earned = Math.floor(skillProgress[key].correct / SKILL_POINT_INTERVAL) > previousPoints;
  if (earned && typeof window.ByteboundTutorial?.onSkillPointEarned === 'function') {
    window.ByteboundTutorial.onSkillPointEarned(category, key);
  }
  return earned;
}

function countSpecializedSkills(key) {
  return SKILL_TREES[key].skills.filter((skill) => skillProgress[key].ranks[skill.id] > 0).length;
}

function canSwitchSkillSet() {
  if (exclusiveSkillTree) return false;
  return !activeSkillSpecialization ||
    countSpecializedSkills(activeSkillSpecialization) < SKILLS_TO_SPECIALIZE(activeSkillSpecialization);
}

function skillRequirements(skill) {
  return skill.requires || (skill.requiresFoundation ? ['foundation'] : []);
}

function canUpgradeSkill(key, skill) {
  if (!SKILL_TREES[key] || !skill || !skillProgress[key]) return false;
  if (isSkillTreeLockedOut(key)) return false;
  const progress = skillProgress[key];
  const maxRank = skill.maxRank || SKILL_MAX_RANK;
  return (
    skillPointsAvailable(key) > 0 &&
    progress.ranks[skill.id] < maxRank &&
    skillRequirements(skill).every((id) => progress.ranks[id] > 0)
  );
}

function upgradeSkill(key, skillId) {
  const skill = SKILL_TREES[key]?.skills.find((entry) => entry.id === skillId);
  if (!skill || !canUpgradeSkill(key, skill)) return false;

  skillProgress[key].ranks[skill.id]++;
  activeSkillSpecialization = key;
  if (skill.isExclusiveActive) {
    exclusiveSkillTree = key;
    reconcileExclusiveSkillPoints();
  }
  applySkillBonus(skill.bonus);
  saveSkillProgress();
  refreshAchievements();
  return true;
}

// ===== Hero, stats and battle state =====
const HAND_SIZE = 4;                       // cards in hand each turn
const HERO_HIT_IFRAME_TICKS = 36;
const HERO_HIT_TINT_TICKS = 18;
const HERO_KNOCKBACK_TICKS = 20;
const HERO_HEAL_FLASH_TICKS = 4;
const HERO_HEAL_TINT_TICKS = 30;
const DEFEND_COOLDOWN_TURNS = 2;
const DEFEND_EFFECT_FRAMES = 24;
const runDeck = [...STARTING_DECK];        // card ids in this run's deck; rewards add to it
const hero = {};
const stats = {};
const battle = {
  enemy: null, enemyFollower: null, phase: 'choose', card: null, question: null, block: 0, tempDefense: 0,
  defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
  heroHealFlashT: 0, heroHealTintT: 0,
  log: '', popups: [], hand: [], drawPile: [], discard: [], rewards: [], upgrades: [],
  fromReview: false, newUnlocks: [], pendingAttack: false,
  lungeT: 0, heroAttackT: 0, bossAttackT: 0, driusAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
  chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
  projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
  hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
  heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
  deathTimer: 0, enemyAttackedThisTurn: false,
  flash: { hero: 0, enemy: 0 },
};
const panel = document.getElementById('panel');

let multiplayerMatchActive = false;
const mpState = {
  matchId: null,
  roomCode: '',
  arenaId: 'arena',
  arenaName: 'Cyber Arena',
  category: 'ALL',
  role: null,
  selfClientId: null,
  selfName: 'Player 1',
  selfAvatar: 'cpu',
  opponentClientId: null,
  opponentName: 'Challenger',
  opponentAvatar: 'shield',
  round: 0,
  questions: [],
  fighters: null,
  movesByRound: {},
  resolvedRounds: new Set(),
  questionStartedAt: 0,
  pendingCardCost: 0,
  outcome: null,
  endReason: '',
  dyingTarget: null,
  deathCountdown: 0,
  onForfeit: null,
};

let mpSyncIntervalId = null;

function endMultiplayerMatchState() {
  stopMpSyncHeartbeat();
  multiplayerMatchActive = false;
  mpState.matchId = null;
  mpState.movesByRound = {};
  mpState.resolvedRounds = new Set();
  mpState.fighters = null;
  mpState.outcome = null;
  mpState.endReason = '';
  mpState.dyingTarget = null;
  mpState.deathCountdown = 0;
  Object.assign(stats, { kills: 0, correct: 0, total: 0, streak: 0 });
  if (battle.enemy && battle.enemy.isMultiplayerPlayer) {
    battle.enemy = null;
    battle.phase = 'choose';
    battle.pendingAttack = false;
  battle.lastAnswerCorrect = false;
    battle.question = null;
    battle.popups = [];
  }
  if (typeof mode !== 'undefined' && (mode === 'battle' || mode === 'intro')) {
    mode = 'menu';
  }
  if (typeof setArenaTheme === 'function') setArenaTheme('arena');
}

function resetRun() {
  endMultiplayerMatchState();
  Object.assign(hero, { hp: 100, maxHp: 100, mana: 100, maxMana: 100, attack: 12, defense: 2, empowerCost: 20, bonusHeal: 0, bonusMana: 0, runInvincible: false, necroAlly: null, necroAllies: [], tempAttack: 0 });
  for (const key of SKILL_TREE_KEYS) {
    for (const skill of SKILL_TREES[key].skills) {
      applySkillBonus(skill.bonus, skillProgress[key].ranks[skill.id]);
    }
  }
  Object.assign(stats, { kills: 0, correct: 0, total: 0, streak: 0, roomKills: 0, upgrades: [], cardsTaken: 0 });
  runDeck.splice(0, runDeck.length, ...STARTING_DECK);
  adaptive.reset();
}
resetRun();

const UPGRADES = [
  { name: 'Iron Hide', text: '+3 Defense', apply: () => { hero.defense += 3; } },
  { name: 'Sharp Blade', text: '+3 Attack', apply: () => { hero.attack += 3; } },
  { name: 'Hearty Stew', text: '+20 Max HP and heal 20', apply: () => { hero.maxHp += 20; hero.hp = Math.min(hero.maxHp, hero.hp + 20); } },
  { name: 'Deep Reserve', text: '+20 Max Mana', apply: () => { hero.maxMana += 20; } },
  { name: 'Quick Study', text: 'Correct answers heal +3 more', apply: () => { hero.bonusHeal += 3; } },
  { name: 'Arcane Focus', text: 'Power Strike costs 15 mana', apply: () => { hero.empowerCost = 15; } },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHeavy = (enemy = battle.enemy) => {
  if (!enemy || enemy.hp <= 0) return false;
  const every = enemy.heavyEvery || 3;
  return enemy.turns % every === every - 1;
};
const accuracy = () => (stats.total ? Math.round((100 * stats.correct) / stats.total) + '%' : '-');
const shuffle = (items) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

// Deck handling: draw from the draw pile; when it runs out, shuffle the discard pile back in.
function drawCardId() {
  if (battle.drawPile.length === 0) {
    if (battle.discard.length === 0) return null;
    battle.drawPile = shuffle(battle.discard);
    battle.discard = [];
  }
  return battle.drawPile.pop();
}

function fillHand() {
  battle.hand = battle.hand.filter((id) => !CARD_LIBRARY[id]?.exclusiveActive);
  while (battle.hand.length < HAND_SIZE) {
    const id = drawCardId();
    if (!id) break;
    battle.hand.push(id);
  }
  if (!multiplayerMatchActive) {
    const exId = getUnlockedExclusiveCardId();
    if (exId) {
      const cooling = (battle.exclusiveCooldownTurns || 0) > 0;
      const shouldShow = cooling || (battle.exclusiveAppearTick || 0) % 2 === 0 || Math.random() < 0.65;
      battle.exclusiveAppearTick = (battle.exclusiveAppearTick || 0) + 1;
      if (shouldShow && !battle.hand.includes(exId)) {
        battle.hand.push(exId);
      }
    }
  }
}

// ===== Panel and HUD rendering =====
function setExploreBanner(text) {
  const banner = document.getElementById('playExploreBanner');
  if (!banner) return;
  banner.textContent = text || '';
  banner.hidden = !text;
}

function hideGameOverOverlay() {
  const go = document.getElementById('gameOverOverlay');
  if (go) {
    go.hidden = true;
    go.classList.remove('is-victory', 'is-draw', 'is-necromancy');
    go.innerHTML = '';
  }
}

function setPanel(html) {
  if (html) {
    setExploreBanner('');
    hideGameOverOverlay();
  }
  panel.innerHTML = html;
  renderHud();
  if (typeof syncTouchVisibility === 'function') syncTouchVisibility();
}

function renderHud() {
  const $ = (id) => document.getElementById(id);
  $('hpFill').style.width = `${(100 * hero.hp) / hero.maxHp}%`;
  $('hpTxt').textContent = `${hero.hp}/${hero.maxHp}`;
  $('manaFill').style.width = `${(100 * hero.mana) / hero.maxMana}%`;
  $('manaTxt').textContent = `${hero.mana}/${hero.maxMana}`;
  if (multiplayerMatchActive) {
    $('roomTxt').textContent = mpState.arenaName || '1v1 Arena';
    $('diffTxt').textContent = '1V1 DUEL';
  } else {
    $('roomTxt').textContent = currentRoom.name;
    $('diffTxt').textContent = adaptive.name.toUpperCase();
  }
  $('killsTxt').textContent = stats.kills;
  $('accTxt').textContent = accuracy();
  renderDashboard();
}

function renderExplore(msg) {
  const left = enemies.filter((e) => e.alive).length;
  const boss = currentRoom.boss;
  const aliveBoss = boss ? enemies.find((e) => e.alive) : null;
  const fallback = left
    ? (boss
      ? (currentRoom.final
        ? `${typeof FINAL_BOSS_NAME !== 'undefined' ? FINAL_BOSS_NAME : 'King Crolue'}, Lord of the Loop, awaits ahead — touch him to begin the battle.`
        : `${aliveBoss?.name || 'Mini Boss Kor'} ahead — touch to battle.`)
      : 'Touch a virus to battle and unlock the way.')
    : (currentRoom.edgeExits
      ? 'Room cleared! Walk off the left or right road to continue.'
      : 'Room cleared! Walk to the door to continue.');
  const noun = boss ? 'boss' : (left === 1 ? 'virus' : 'viruses');
  const statusPrefix = left > 0 ? `${left} ${noun} left · ` : '';
  setPanel('');
  setExploreBanner(`${currentRoom.name}: ${statusPrefix}${msg || fallback}`);
}

function renderBattle() {
  const cards = battle.hand.map((id, i) => {
    const card = CARD_LIBRARY[id];
    const defendCooling = card.id === 'defend' && battle.defendCooldownTurns > 0;
    const exclusiveCooling = card.exclusiveActive && (battle.exclusiveCooldownTurns || 0) > 0;
    const coolingTurns = defendCooling ? battle.defendCooldownTurns : (exclusiveCooling ? battle.exclusiveCooldownTurns : 0);
    const isCooling = defendCooling || exclusiveCooling;
    const blocked = hero.mana < cardCost(card, hero) || isCooling;
    const detail = isCooling
      ? `CD ${coolingTurns}t`
      : `${esc(cardCostLabel(card, hero))} · ${esc(describeCard(card, hero))}`;
    const cls = [
      isCooling ? 'is-cooling-down' : '',
      card.exclusiveActive ? `is-exclusive-card card-${card.id}` : '',
    ].filter(Boolean).join(' ');
    return `<button${cls ? ` class="${cls}"` : ''} data-act="card" data-val="${i}" ${blocked ? 'disabled' : ''}>${i + 1}. ${esc(card.name)}${card.exclusiveActive ? ' ✦' : ''}<small>${detail}</small></button>`;
  }).join('');
  if (multiplayerMatchActive) {
    setPanel(`<div class="battle-bar-head">
        <span class="mp-turn-pill is-yours">YOUR TURN</span>
        <span class="log">${esc(battle.log)}</span>
        <span class="intent">VS ${esc(mpState.opponentName)} · Turn ${mpState.round + 1}</span>
        <span class="dim">Room: ${esc(mpState.roomCode)} · Equal Stats</span>
        <button type="button" class="mp-inline-forfeit" data-act="mp-forfeit">Forfeit</button>
      </div>
      <div class="actions">${cards}</div>`);
    window.ByteboundTutorial?.onBattlePhaseRendered?.('choose');
    return;
  }
  const noManaRemedial = !multiplayerMatchActive && hero.mana <= 0
    ? `<button class="is-remedial-action" data-act="remedial">R. Remedial Surge ✦<small>0 MP Only · Answer 2–5 remedial questions for buff + HP/MP restore</small></button>`
    : '';
  const buffParts = [];
  if ((hero.tempAttack || 0) > 0) buffParts.push(`+${hero.tempAttack} ATK`);
  if ((battle.tempDefense || 0) > 0) buffParts.push(`+${battle.tempDefense} DEF`);
  const buffBadge = buffParts.length ? `<span class="battle-buff-pill">${buffParts.join(' · ')}</span>` : '';
  setPanel(`<div class="battle-bar-head">
      <span class="log">${esc(battle.log)}</span>
      <span class="intent">${isHeavy() ? 'Next: HEAVY attack!' : 'Next: Normal attack'}</span>
      ${buffBadge}
      <span class="dim">Deck: ${runDeck.length} (${battle.drawPile.length} left)</span>
    </div>
    <div class="actions">${cards}${noManaRemedial}</div>`);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('choose');
}

function withShuffledChoices(question) {
  if (!question || !Array.isArray(question.choices) || question.choices.length < 2) return question;
  const order = question.choices.map((_, idx) => idx);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...question,
    choices: order.map((idx) => question.choices[idx]),
    answer: order.indexOf(question.answer),
  };
}

function renderQuestion() {
  const q = battle.question;
  const choices = q.choices.map((text, i) => {
    return `<button data-act="answer" data-val="${i}">${i + 1}. ${esc(text)}</button>`;
  }).join('');
  const diffLabel = multiplayerMatchActive
    ? String(q.difficulty || 'medium').toUpperCase()
    : (adaptive.lastSelection?.difficulty || adaptive.name).toUpperCase();
  const reasonBadge = multiplayerMatchActive
    ? `1V1 SYNCED · ROUND ${mpState.round + 1}`
    : (battle.fromReview
      ? (adaptive.lastSelection?.badge || 'SPACED REVIEW')
      : (adaptive.lastSelection?.badge || 'ADAPTIVE'));
  setPanel(`<div class="battle-bar-head">
      <p class="question">${esc(q.q)}</p>
      <span class="tag">${esc(q.category)} · ${esc(q.topic)} · ${esc(diffLabel)} · <span class="adaptive-reason-tag">${esc(reasonBadge)}</span></span>
    </div>
    <div class="choices">${choices}</div>`);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('question');
}

function renderFeedback(correct, notes) {
  const q = battle.question;
  const attackPending = battle.pendingAttack;
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><strong class="${correct ? 'ok' : 'bad'}">${correct ? 'Correct!' : 'Not quite.'}</strong> <b>Answer: ${esc(q.choices[q.answer])}.</b> ${esc(q.explain)}</p>
        ${notes.length ? `<p class="log">${notes.map((n) => esc(n)).join(' ')}</p>` : ''}
      </div>
      <button data-act="continue"${attackPending ? ' disabled' : ''}>${attackPending ? 'Resolving...' : 'Continue<span class="keyhint"> (Enter)</span>'}</button>
    </div>`);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('feedback', { correct, notes });
}

function renderMenu() {
  setPanel('');
}

function renderWin() {
  const boss = battle.enemy.isBoss;
  const progressMessages = [
    boss ? 'Boss room cleared!' : '',
    stats.kills % 2 === 0 ? 'Upgrade unlocked!' : '',
  ].filter(Boolean);
  const unlocked = battle.newUnlocks.length
    ? `New card: ${battle.newUnlocks.map((id) => esc(CARD_LIBRARY[id].name)).join(', ')}`
    : '';
  const extra = [...progressMessages, unlocked].filter(Boolean).join(' · ');
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><strong class="ok">${esc(battle.enemy.name)} ${boss ? 'defeated!' : 'killed!'}</strong>${extra ? ` <span>${extra}</span>` : ''}</p>
      </div>
      <button data-act="won">Continue<span class="keyhint"> (Enter)</span></button>
    </div>`);
}

function renderLose() {
  setPanel('');
  const go = document.getElementById('gameOverOverlay');
  if (!go) return;
  const foeName = battle.enemy ? battle.enemy.name : 'a virus';
  const roomName = currentRoom ? currentRoom.name : `Room ${level}`;
  const noteText = practiceRunActive
    ? 'Practice run — progress will be discarded on exit.'
    : 'Your run progress is saved. Rise again in this room with 50% HP.';
  go.innerHTML = `<div class="game-over-box">
    <div class="game-over-corruption">FATAL SYSTEM BREACH // SIGNAL LOST</div>
    <div class="game-over-skull" aria-hidden="true">☠</div>
    <h2 class="game-over-title" id="gameOverTitle" data-text="GAME OVER">GAME OVER</h2>
    <p class="game-over-killer">Slain by <strong>${esc(foeName)}</strong> in <strong>${esc(roomName)}</strong></p>
    <div class="game-over-stats">
      <div class="game-over-stat"><span>ROOM</span><strong>${String(level).padStart(2, '0')}</strong></div>
      <div class="game-over-stat"><span>SLAIN</span><strong>${stats.kills}</strong></div>
      <div class="game-over-stat"><span>ACCURACY</span><strong>${accuracy()}</strong></div>
    </div>
    <p class="game-over-note">${esc(noteText)}</p>
    <div class="game-over-actions">
      <button type="button" class="game-over-btn is-primary" data-act="retry">Retry Room <span class="keyhint">(Enter)</span></button>
      <button type="button" class="game-over-btn is-secondary" data-act="hub">Return to Hub</button>
    </div>
  </div>`;
  go.hidden = false;
}

function renderUpgrades() {
  battle.upgrades = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  battle.phase = 'upgrade';
  setPanel(`<div class="battle-bar-head"><span class="ok">Level up! Choose one upgrade (1–3):</span></div>
    <div class="choices card-pick">${battle.upgrades.map((u, i) => `<button data-act="upgrade" data-val="${i}">${i + 1}. ${u.name}<small>${u.text}</small></button>`).join('')}</div>`);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('upgrade');
}

function renderCardReward() {
  battle.phase = 'reward';
  battle.rewards = rewardChoices(3, getAchievementMetrics());
  const choices = battle.rewards.map((id, i) => {
    const card = CARD_LIBRARY[id];
    return `<button data-act="pickcard" data-val="${i}">${i + 1}. ${esc(card.name)}<small>${esc(cardCostLabel(card, hero))} · ${esc(describeCard(card, hero))}</small></button>`;
  }).join('');
  setPanel(`<div class="battle-bar-head"><span class="ok">Choose a card for your deck (1–${battle.rewards.length}):</span><span class="dim">Deck: ${runDeck.length} cards</span></div>
    <div class="choices card-pick">${choices}</div>`);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('reward');
}

function showVictory() {
  Sound.music(null);
  Sound.play('win');
  submitLeaderboardRun();
  setPanel(`<p class="ok">Kingdom cleared!</p>
    <p>All foes defeated. Your run is complete.</p>
    <button data-act="again">Play again</button>`);
}

// ===== Battle flow =====
function startBattle(enemy) {
  hideGameOverOverlay();
  if (!multiplayerMatchActive && typeof setArenaTheme === 'function') {
    setArenaTheme((typeof currentRoom !== 'undefined' && currentRoom?.arenaTheme) || 'datacenter');
  }
  if (typeof battleKingDeath !== 'undefined' && battleKingDeath) {
    battleKingDeath.currentFrame = 0;
    battleKingDeath.elapsedFrames = 0;
    battleKingDeath.autoplay = false;
  }
  keys.a.pressed = false;
  keys.d.pressed = false;
  player.velocity = { x: 0, y: 0 };
  battle.drawPile = shuffle([...runDeck]);
  battle.discard = [];
  battle.hand = [];
  battle.exclusiveCooldownTurns = 0;
  battle.exclusiveAppearTick = 0;
  hero.tempAttack = 0;
  fillHand();
  Object.assign(battle, {
    enemy,
    enemyFollower: (!multiplayerMatchActive && enemy.nyrmed)
      ? {
          name: 'Grenu',
          grenu: true,
          hp: 65,
          maxHp: 65,
          attack: Math.max(9, Math.round((enemy.attack || 15) * 0.72)),
          lungeT: 0,
        }
      : null,
    phase: 'intro', card: null, question: null, remedial: null, block: 0, popups: [], tempDefense: 0,
    defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
    exclusiveCooldownTurns: 0, exclusiveUsedThisTurn: false,
    enemyStunTurns: 0, enemyBurnTurns: 0, enemyBurnDamage: 0,
    aegisAnimT: 0, stunAnimT: 0, burnAnimT: 0, allyAttackT: 0, allyLungeT: 0, allyAttackTs: [0, 0, 0], allyLungeTs: [0, 0, 0], allyTurnIndex: 0, necroCandidate: null,
    enemyDefendEffectT: 0, enemyHealTintT: 0, enemyChargeT: 0,
    enemyProjectileT: -1, enemyProjectileCharged: false, enemyImpactRingT: 0, enemyPreviewCard: null,
    heroHealFlashT: 0, heroHealTintT: 0,
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, driusAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    pendingAttack: false,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
    deathTimer: 0, enemyAttackedThisTurn: false, lastAnswerCorrect: true,
    flash: { hero: 0, enemy: 0 }, fromReview: false, newUnlocks: [],
    log: enemy.nyrmed ? `${enemy.name} & follower Grenu block the way!` : enemy.isBoss ? `${enemy.name} blocks the way!` : `A wild ${enemy.name} appeared!`,
  });
  Sound.play(enemy.isBoss ? 'bossIntro' : 'encounter');
  Sound.music(enemy.isBoss ? 'boss' : 'battle');
  beginIntro();
  window.ByteboundTutorial?.onBattleStarted?.(enemy);
}

function chooseCard(index) {
  if (battle.phase !== 'choose') return;
  if (multiplayerMatchActive && !mpIsMyTurn()) return;
  const id = battle.hand[index];
  const card = id && CARD_LIBRARY[id];
  if (!card) return;
  if (id === 'defend' && battle.defendCooldownTurns > 0) return;
  if (card.exclusiveActive && (battle.exclusiveCooldownTurns || 0) > 0) return;
  const cost = cardCost(card, hero);
  if (hero.mana < cost) return;
  if (id === 'defend') {
    battle.defendCooldownTurns = DEFEND_COOLDOWN_TURNS;
    battle.defendUsedThisTurn = true;
  }
  if (card.exclusiveActive) {
    battle.exclusiveCooldownTurns = card.cooldown || 3;
    battle.exclusiveUsedThisTurn = true;
  }
  mpState.pendingCardCost = cost;
  hero.mana -= cost;
  if (cost > 0) {
    popup('hero', `-${cost} MP`, '#ff9b85', { offsetX: -56, y: HERO_SPOT.y - 54 });
  }
  if (multiplayerMatchActive) {
    battle.hand = [...STARTING_DECK];
  } else {
    battle.hand.splice(index, 1);
    if (!card.exclusiveActive) battle.discard.push(id);
    fillHand();
  }
  battle.card = id;
  battle.chargeCard = id === 'power' || id === 'overclock';
  battle.chargeStartedAt = battle.chargeCard ? performance.now() : 0;
  battle.chargeReady = false;
  battle.chargeMaxT = 0;
  battle.chargeSparks = battle.chargeCard
    ? Array.from({ length: 14 }, () => ({ angle: Math.random() * Math.PI * 2, spread: 0.55 + Math.random() * 0.45 }))
    : [];
  battle.projectileT = -1;
  battle.projectileQueued = false;
  battle.projectileCharged = false;
  battle.projectileDamage = 0;
  battle.pendingAttack = false;
  battle.lastAnswerCorrect = false;
  if (multiplayerMatchActive) {
    battle.question = withShuffledChoices(mpGetQuestionForRound(mpState.round));
    battle.fromReview = false;
    mpState.questionStartedAt = performance.now();
    if (window.mpUI?.matchmaking) {
      window.mpUI.matchmaking.sendMatchMove({
        kind: 'preview',
        matchId: mpState.matchId,
        round: mpState.round,
        role: mpState.role,
        clientId: mpState.selfClientId,
        cardId: id,
      });
    }
  } else {
    battle.question = withShuffledChoices(adaptive.nextQuestion());
    battle.fromReview = adaptive.fromReview;
  }
  battle.phase = 'question';
  renderQuestion();
}

function answerQuestion(index) {
  if (battle.phase !== 'question') return;
  const q = battle.question;
  const correct = index === q.answer;
  battle.lastAnswerCorrect = correct;
  if (multiplayerMatchActive) {
    mpState.selfTotal = (mpState.selfTotal || 0) + 1;
    if (correct) mpState.selfCorrect = (mpState.selfCorrect || 0) + 1;
    recordTopicAnswer(q, correct);
    recordReview(q, correct);
    Sound.play(correct ? 'correct' : 'wrong');
    mpSubmitLocalMove(correct);
    return;
  }
  stats.total++;
  if (correct) stats.correct++;
  recordTopicAnswer(q, correct);
  recordReview(q, correct);
  stats.streak = correct ? stats.streak + 1 : 0;
  recordAchievementProgress('bestStreak', stats.streak);
  adaptive.record(correct);
  Sound.play(correct ? 'correct' : 'wrong');

  const notes = [resolveCard(battle.card, correct)];
  if (correct) {
    battle.enemyAttackedThisTurn = false;
    if (recordCorrectAnswer(q.category)) {
      notes.push(`${q.category} skill point earned. Press U to spend it.`);
      if (typeof showSkillPointEarnedBanner === 'function') {
        showSkillPointEarnedBanner(q.category);
      }
    }
    // Performance-based recovery: a correct answer heals HP and restores mana, scaled by streak.
    const heal = 4 + 2 * Math.min(stats.streak, 5) + hero.bonusHeal;
    const previousHp = hero.hp;
    const previousMana = hero.mana;
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    hero.mana = Math.min(hero.maxMana, hero.mana + 5 + hero.bonusMana);
    const actualHeal = hero.hp - previousHp;
    const actualManaGain = hero.mana - previousMana;
    showHealFeedback(actualHeal, { offsetX: 58, y: HERO_SPOT.y - 78 });
    if (actualManaGain > 0) {
      popup('hero', `+${actualManaGain} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 54, style: 'heal' });
    }
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 14, 2.5);
    notes.push(`Focus restores ${heal} HP and 5 mana (streak ${stats.streak}).`);
  } else {
    notes.push('Saved for review.');
    if (getNecroAllies().length > 0) {
      notes.push('Summoned allies hold back on a wrong answer.');
    }
    performEnemyAttack({ fromWrongAnswer: true });
    battle.enemyAttackedThisTurn = true;
    if (hero.hp <= 0 || battle.phase === 'dying') return;
    if (battle.log) notes.push(battle.log);
  }
  battle.phase = 'feedback';
  renderFeedback(correct, notes);
  if (typeof scheduleLeaderboardRunSync === 'function') {
    scheduleLeaderboardRunSync(400);
  }
}

function buildRemedialQuestions(count) {
  const picked = [];
  const usedTexts = new Set();

  // 1. Prioritize missed questions from the spaced-review queue.
  for (const entry of reviewQueue) {
    if (picked.length >= count) break;
    const match = typeof findQuestionByText === 'function' ? findQuestionByText(entry.text) : null;
    if (match && !usedTexts.has(match.q)) {
      usedTexts.add(match.q);
      picked.push({ ...match, difficulty: QUESTION_DIFFICULTY.get(match.q) || 'medium', remedialSource: 'REVIEW DRILL' });
    }
  }

  // 2. Fill remaining slots with foundational (easy/medium) questions, preferring weaker topics.
  const weakTopics = new Set(
    Object.values(topicProgress)
      .flatMap((cat) => Object.entries(cat))
      .filter(([, entry]) => entry.attempted > 0 && entry.correct / entry.attempted < 0.75)
      .map(([name]) => name)
  );
  const easyAndMedium = [
    ...(QUESTION_BANK.easy || []).map((q) => ({ ...q, difficulty: 'easy' })),
    ...(QUESTION_BANK.medium || []).map((q) => ({ ...q, difficulty: 'medium' })),
  ];
  const weakPool = shuffle(easyAndMedium.filter((q) => !usedTexts.has(q.q) && weakTopics.has(q.topic)));
  for (const q of weakPool) {
    if (picked.length >= count) break;
    usedTexts.add(q.q);
    picked.push({ ...q, remedialSource: 'REMEDIAL DRILL' });
  }

  const fallbackPool = shuffle(easyAndMedium.filter((q) => !usedTexts.has(q.q)));
  for (const q of fallbackPool) {
    if (picked.length >= count) break;
    usedTexts.add(q.q);
    picked.push({ ...q, remedialSource: 'REMEDIAL DRILL' });
  }
  return picked.map((entry) => withShuffledChoices(entry));
}

function startRemedialChallenge() {
  if (battle.phase !== 'choose' || multiplayerMatchActive || hero.mana > 0) return;
  const total = 2 + Math.floor(Math.random() * 4); // 2 to 5 consecutive remedial questions
  const questions = buildRemedialQuestions(total);
  if (!questions.length) return;
  battle.remedial = {
    questions,
    index: 0,
    results: [],
    correctCount: 0,
  };
  battle.phase = 'remedial';
  renderRemedialQuestion();
}

function renderRemedialQuestion() {
  const rem = battle.remedial;
  if (!rem || rem.index >= rem.questions.length) return;
  const q = rem.questions[rem.index];
  const total = rem.questions.length;
  const pips = Array.from({ length: total }, (_, idx) => {
    const done = idx < rem.results.length;
    const cls = done ? (rem.results[idx] ? 'is-pass' : 'is-fail') : (idx === rem.index ? 'is-active' : '');
    return `<span class="remedial-pip ${cls}">${done ? (rem.results[idx] ? '✓' : '✕') : (idx + 1)}</span>`;
  }).join('');
  const choices = q.choices.map((text, i) => {
    return `<button data-act="remedial-answer" data-val="${i}">${i + 1}. ${esc(text)}</button>`;
  }).join('');
  setPanel(`<div class="battle-bar-head">
      <div class="remedial-header">
        <span class="remedial-badge">REMEDIAL SURGE · ${rem.index + 1} / ${total}</span>
        <div class="remedial-pips" aria-label="Remedial question progress">${pips}</div>
      </div>
      <p class="question">${esc(q.q)}</p>
      <span class="tag">${esc(q.category)} · ${esc(q.topic)} · ${esc(String(q.difficulty || 'easy').toUpperCase())} · <span class="adaptive-reason-tag">${esc(q.remedialSource || 'REMEDIAL DRILL')}</span></span>
    </div>
    <div class="choices">${choices}</div>`);
}

function answerRemedialQuestion(index) {
  if (battle.phase !== 'remedial' || !battle.remedial) return;
  const rem = battle.remedial;
  const q = rem.questions[rem.index];
  if (!q) return;
  const correct = index === q.answer;
  stats.total++;
  if (correct) stats.correct++;
  recordTopicAnswer(q, correct);
  recordReview(q, correct);
  stats.streak = correct ? stats.streak + 1 : 0;
  recordAchievementProgress('bestStreak', stats.streak);
  adaptive.record(correct);
  Sound.play(correct ? 'correct' : 'wrong');

  if (correct) {
    rem.correctCount++;
    if (recordCorrectAnswer(q.category) && typeof showSkillPointEarnedBanner === 'function') {
      showSkillPointEarnedBanner(q.category);
    }
  }
  rem.results.push(correct);
  rem.index++;

  if (rem.index < rem.questions.length) {
    renderRemedialQuestion();
    return;
  }

  // All consecutive remedial questions completed: resolve outcome tier.
  const total = rem.questions.length;
  const score = rem.correctCount;
  const allCorrect = score === total;
  const passThreshold = Math.ceil(total / 2);
  const notes = [];

  if (allCorrect) {
    const atkBuff = 8;
    const defBuff = 4;
    hero.tempAttack = (hero.tempAttack || 0) + atkBuff;
    battle.tempDefense += defBuff;
    const mpGain = Math.max(0, hero.maxMana - hero.mana);
    hero.mana = hero.maxMana;
    const prevHp = hero.hp;
    const hpGain = Math.min(hero.maxHp - hero.hp, Math.max(20, Math.round(hero.maxHp * 0.35)));
    hero.hp += hpGain;
    showHealFeedback(hero.hp - prevHp, { offsetX: 58, y: HERO_SPOT.y - 78 });
    if (mpGain > 0) popup('hero', `+${mpGain} MP`, '#6fe3e8');
    popup('hero', `+${atkBuff} ATK / +${defBuff} DEF`, '#ffe07a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#4be3b0', 28, 4.2);
    Sound.play('heal');
    notes.push(`PERFECT REMEDIAL SURGE (${score}/${total})! Restored ${hero.hp - prevHp} HP & ${mpGain} MP, plus +${atkBuff} ATK and +${defBuff} DEF for this battle!`);
  } else if (score > 0) {
    const ratio = score / total;
    const mpGain = Math.min(hero.maxMana - hero.mana, Math.max(10 * score, Math.round(hero.maxMana * 0.5 * ratio)));
    hero.mana += mpGain;
    const prevHp = hero.hp;
    const hpGain = Math.min(hero.maxHp - hero.hp, Math.max(5 * score, Math.round(hero.maxHp * 0.18 * ratio)));
    hero.hp += hpGain;
    const atkBuff = score >= passThreshold ? (score >= total - 1 ? 3 : 2) : 0;
    if (atkBuff > 0) hero.tempAttack = (hero.tempAttack || 0) + atkBuff;
    showHealFeedback(hero.hp - prevHp, { offsetX: 58, y: HERO_SPOT.y - 78 });
    if (mpGain > 0) popup('hero', `+${mpGain} MP`, '#6fe3e8');
    if (atkBuff > 0) popup('hero', `+${atkBuff} ATK`, '#ffe07a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 76, '#7fd49a', 16, 3);
    Sound.play('heal');
    notes.push(`Remedial Recovery (${score}/${total}): Restored ${hero.hp - prevHp} HP & ${mpGain} MP${atkBuff ? ` + ${atkBuff} ATK` : ''}.`);
  } else {
    notes.push(`Remedial Surge fizzled (${score}/${total} correct). Nothing happened — 0 HP, 0 MP, no buffs.`);
  }

  battle.remedial = null;
  battle.question = q;
  battle.lastAnswerCorrect = score > 0;
  battle.enemyAttackedThisTurn = false;
  battle.phase = 'feedback';
  renderFeedback(correct, notes);
  if (typeof scheduleLeaderboardRunSync === 'function') {
    scheduleLeaderboardRunSync(400);
  }
}

// Resolves the card played this turn and returns a short description of what happened.
function resolveCard(id, correct) {
  const card = CARD_LIBRARY[id];
  if (card.kind === 'hit') {
    if (!correct) {
      battle.chargeCard = false;
      battle.chargeMaxT = 0;
      battle.projectileQueued = false;
      return 'Wrong answer! Your attack missed.';
    }
    const stunMult = battle.enemyStunTurns > 0 ? 1.5 : 1;
    const dmg = Math.round((hero.attack + (hero.tempAttack || 0)) * card.power * (card.correctMult || 1) * stunMult);
    const note = card.id === 'strike' ? '' : `${card.name}! `;
    if (card.manaOnCorrect) {
      const prevMp = hero.mana;
      hero.mana = Math.min(hero.maxMana, hero.mana + card.manaOnCorrect);
      if (hero.mana > prevMp) {
        popup('hero', `+${hero.mana - prevMp} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 82, style: 'heal' });
      }
    }
    if (battle.enemy && !battle.enemy.isMultiplayerPlayer) {
      battle.enemy.hp = Math.max(0, battle.enemy.hp - dmg);
      if (battle.enemy.hp <= 0) battle.enemyDefeatT = 0;
    }
    popup('enemy', `-${dmg}`, '#ffd27a');
    battle.pendingAttack = false;
    const chargedAttack = battle.chargeCard;
    battle.lungeT = chargedAttack ? 0 : 1;
    battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
    battle.projectileCharged = chargedAttack;
    battle.projectileQueued = chargedAttack;
    battle.projectileT = chargedAttack ? -1 : 0;
    battle.projectileDamage = 0;
    return `${note}You hit for ${dmg}.`;
  }
  if (card.kind === 'defend') {
    battle.block = correct ? 0.75 : 0.25;
    if (correct) {
      battle.defendEffectT = DEFEND_EFFECT_FRAMES;
      if (!document.body.classList.contains('reduce-motion')) {
        battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.55);
      }
      emitFx(HERO_SPOT.x + 52, HERO_SPOT.y - 82, '#e8fbff', 14, 3.8);
      emitFx(HERO_SPOT.x + 52, HERO_SPOT.y - 82, '#6fe3e8', 10, 3);
    } else {
      emitFx(HERO_SPOT.x + 60, HERO_SPOT.y - 70, '#6fe3e8', 8, 1.8);
    }
    Sound.play('block');
    return correct ? 'Guard up: you block 75% of the next hit.' : 'Shaky guard: you block 25% of the next hit.';
  }
  if (card.kind === 'charge') {
    const gain = correct ? 25 : 10;
    const prevMp = hero.mana;
    hero.mana = Math.min(hero.maxMana, hero.mana + gain);
    popup('hero', `+${hero.mana - prevMp || gain} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 70, style: 'heal' });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#7ef0a2', 14, 2);
    Sound.play('charge');
    return `You charge ${gain} mana.`;
  }
  if (card.kind === 'heal') {
    const heal = correct ? card.heal + hero.bonusHeal : 2;
    const previousHp = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    const healed = hero.hp - previousHp;
    showHealFeedback(healed, { offsetX: -60, y: HERO_SPOT.y - 62 });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 12, 2);
    Sound.play('heal');
    return `${card.name} restores ${healed} HP.`;
  }
  if (card.kind === 'mana') {
    const gain = correct ? card.gain : 2;
    const prevMp = hero.mana;
    hero.mana = Math.min(hero.maxMana, hero.mana + gain);
    popup('hero', `+${hero.mana - prevMp || gain} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 70, style: 'heal' });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#7ef0a2', 12, 2);
    Sound.play('charge');
    return `${card.name} restores ${gain} mana.`;
  }
  if (card.kind === 'buff') {
    const bonus = correct ? card.defense : 1;
    battle.tempDefense += bonus;
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#c9b6ff', 12, 2);
    Sound.play('block');
    return `${card.name}: +${bonus} defense for this battle.`;
  }
  if (card.kind === 'aegis') {
    if (!correct) {
      return `Wrong answer! ${card.name} failed to activate.`;
    }
    const rank = Math.max(1, skillProgress.computerSystems?.ranks?.kernelAegis || 1);
    const shockDmg = 35 * rank;
    const atkSurge = 4 * rank;
    const defSurge = 3 * rank;
    hero.runInvincible = true;
    const prevHp = hero.hp;
    hero.hp = hero.maxHp;
    const mpGain = Math.min(hero.maxMana - hero.mana, 40);
    hero.mana += mpGain;
    hero.tempAttack = (hero.tempAttack || 0) + atkSurge;
    battle.tempDefense += defSurge;
    battle.aegisAnimT = 56;
    if (battle.enemy && battle.enemy.hp > 0) {
      battle.enemy.hp = Math.max(0, battle.enemy.hp - shockDmg);
      battle.flash.enemy = Math.max(battle.flash.enemy, 10);
      battle.hitT = Math.max(battle.hitT, 0.9);
      popup('enemy', `-${shockDmg} AEGIS`, '#ffe07a');
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 76, '#ffe07a', 22, 4);
      if (battle.enemy.hp <= 0) battle.enemyDefeatT = 0;
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.7);
    }
    popup('hero', 'INVINCIBLE!', '#ffe07a');
    if (hero.hp > prevHp) showHealFeedback(hero.hp - prevHp, { offsetX: 58, y: HERO_SPOT.y - 78 });
    popup('hero', `+${atkSurge} ATK / +${defSurge} DEF`, '#ffe07a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#ffe07a', 26, 4.2);
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#6fe3e8', 18, 3.2);
    Sound.play('block');
    return `${card.name} (R${rank})! Run Invincible + Full HP + ${mpGain} MP + ${shockDmg} Aegis DMG + ${atkSurge} ATK/${defSurge} DEF!`;
  }
  if (card.kind === 'stun') {
    if (!correct) {
      return `Wrong answer! ${card.name} missed.`;
    }
    const rank = Math.max(1, skillProgress.networkingSecurity?.ranks?.packetLockdown || 1);
    const stunTurns = 8 + (rank - 1) * 2;
    const breachDmg = 40 * rank;
    battle.enemyStunTurns = stunTurns;
    const mpGain = Math.min(hero.maxMana - hero.mana, 20);
    hero.mana += mpGain;
    battle.stunAnimT = 50;
    battle.flash.enemy = 10;
    if (battle.enemy && battle.enemy.hp > 0) {
      battle.enemy.hp = Math.max(0, battle.enemy.hp - breachDmg);
      battle.hitT = Math.max(battle.hitT, 0.9);
      popup('enemy', `-${breachDmg} BREACH`, '#6fe3e8');
      if (battle.enemy.hp <= 0) battle.enemyDefeatT = 0;
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.75);
    }
    popup('enemy', `STUNNED ${battle.enemyStunTurns}t!`, '#6fe3e8');
    if (mpGain > 0) popup('hero', `+${mpGain} MP`, '#6fe3e8');
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#6fe3e8', 28, 4.5);
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#e8fbff', 16, 3.2);
    Sound.play('heavy');
    return `${card.name} (R${rank}): ${breachDmg} DMG, ${battle.enemy.name} STUNNED ${battle.enemyStunTurns}t (1.5x Vulnerable) + ${mpGain} MP!`;
  }
  if (card.kind === 'burn_hit') {
    if (!correct) {
      battle.chargeCard = false;
      battle.chargeMaxT = 0;
      battle.projectileQueued = false;
      return `Wrong answer! ${card.name} fizzled out.`;
    }
    const rank = Math.max(1, skillProgress.programming?.ranks?.overburnExecution || 1);
    const baseDmg = 100 + (rank - 1) * 50;
    const passiveAndBuffBonus = (Math.max(0, (hero.attack || 12) - 12) + (hero.tempAttack || 0)) * 2;
    const isExecute = battle.enemy && battle.enemy.hp <= battle.enemy.maxHp * 0.4;
    const dmg = Math.round((baseDmg + passiveAndBuffBonus) * (isExecute ? 1.5 : 1));
    battle.enemyBurnTurns = 5;
    battle.enemyBurnDamage = 20 * rank;
    battle.burnAnimT = 52;
    if (battle.enemy && !battle.enemy.isMultiplayerPlayer) {
      battle.enemy.hp = Math.max(0, battle.enemy.hp - dmg);
      if (battle.enemy.hp <= 0) battle.enemyDefeatT = 0;
    }
    popup('enemy', `-${dmg}`, '#ff9659');
    battle.pendingAttack = false;
    battle.lungeT = 0;
    battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
    battle.projectileCharged = true;
    battle.projectileQueued = false;
    battle.projectileT = 0;
    battle.projectileDamage = 0;
    emitFx(HERO_SPOT.x + 60, HERO_SPOT.y - 90, '#ff7b47', 16, 3.4);
    Sound.play('heavy');
    return `${card.name} (R${rank})${isExecute ? ' [EXECUTE!]' : ''}! ${dmg} DMG + ${battle.enemyBurnDamage}/turn Burning (${battle.enemyBurnTurns}t).`;
  }
  return 'Nothing happened.';
}

function startHeroDeathSequence() {
  hero.hp = 0;
  battle.phase = 'dying';
  battle.deathTimer = 0;
  battle.heroHitT = 0;
  battle.heroHitTintT = 0;
  battle.heroKnockbackT = -1;
  battle.flash.hero = 0;
  battle.heroAttackT = 0;
  battle.lungeT = 0;
  battle.chargeCard = false;
  battle.chargeMaxT = 0;
  if (typeof battleKingDeath !== 'undefined' && battleKingDeath) {
    battleKingDeath.play();
  }
  hideGameOverOverlay();
  setPanel('<div class="battle-bar-head"><span class="bad">CRITICAL FAILURE — SYSTEM HP DEPLETED!</span></div>');
  Sound.music(null);
  Sound.play('lose');
  if (typeof submitLeaderboardRun === 'function') submitLeaderboardRun();
}

function performSingleAllyAttack(allyIndex = 0) {
  const allies = getNecroAllies();
  const ally = allies[allyIndex];
  const foe = battle.enemy;
  if (!ally || !foe || foe.hp <= 0) return { killed: false, msg: '' };
  const dmg = Math.max(6, Math.round(ally.attack || 10));
  foe.hp = Math.max(0, foe.hp - dmg);
  popup('enemy', `-${dmg} ${ally.name.toUpperCase()}`, '#c77dff');
  if (!Array.isArray(battle.allyLungeTs)) battle.allyLungeTs = [0, 0, 0];
  if (!Array.isArray(battle.allyAttackTs)) battle.allyAttackTs = [0, 0, 0];
  battle.allyLungeTs[allyIndex] = 1;
  battle.allyAttackTs[allyIndex] = 24;
  battle.allyLungeT = 1;
  battle.allyAttackT = 24;
  battle.hitT = Math.max(battle.hitT, 0.8);
  battle.flash.enemy = Math.max(battle.flash.enemy, 10);
  emitFx(FOE_SPOT.x, FOE_SPOT.y - 76, '#b565ff', 18, 3.6);
  Sound.play('hit');
  const msg = `${ally.name} (Undead Ally ${allyIndex + 1}/${allies.length}) strikes ${foe.name} for ${dmg} DMG!`;
  battle.log = msg;
  if (foe.hp <= 0) {
    battle.enemyDefeatT = 0;
    return { killed: true, msg };
  }
  return { killed: false, msg };
}

function performAllyAttack() {
  return performSingleAllyAttack(0).killed;
}

function renderAllyTurn(allyIndex, msg) {
  const allies = getNecroAllies();
  battle.phase = 'ally_turn';
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><span class="ally-turn-pill">ALLY ${allyIndex + 1} / ${allies.length} TURN</span> <strong>${esc(msg)}</strong></p>
      </div>
      <button data-act="ally-continue">${allyIndex + 1 < allies.length ? 'Next Ally' : 'Enemy Turn'}<span class="keyhint"> (Enter)</span></button>
    </div>`);
}

function performEnemyFollowerAttack() {
  const follower = battle.enemyFollower;
  const foe = battle.enemy;
  if (!follower || follower.hp <= 0 || !foe || foe.hp <= 0) return '';
  let dmg = Math.max(1, Math.round((follower.attack || 11) - hero.defense - battle.tempDefense));
  if (hero.runInvincible || battle.heroHitT > 0) dmg = 0;
  follower.lungeT = 1;
  hero.hp = Math.max(0, hero.hp - dmg);
  if (dmg > 0) {
    battle.flash.hero = 12;
    battle.heroHitT = HERO_HIT_IFRAME_TICKS;
    battle.heroHitTintT = HERO_HIT_TINT_TICKS;
    battle.heroKnockbackT = 0;
    popup('hero', `-${dmg} GRENU`, '#ff9659');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#ff9659', 14, 3.5);
  } else if (hero.runInvincible) {
    battle.aegisAnimT = Math.max(battle.aegisAnimT, 22);
    popup('hero', 'INVINCIBLE!', '#ffe07a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 75, '#ffe07a', 14, 3);
  } else {
    popup('hero', 'DODGE', '#f2bb61');
  }
  Sound.play('enemy');
  const msg = dmg > 0
    ? `${follower.name} (Nyrmed's Follower) strikes you for ${dmg} DMG!`
    : hero.runInvincible
      ? `${follower.name}'s follow-up attack bounces off your Kernel Aegis!`
      : `${follower.name} misses while your invincibility is active.`;
  battle.log = msg;
  if (hero.hp <= 0) startHeroDeathSequence();
  return msg;
}

function renderEnemyFollowerTurn(msg) {
  battle.phase = 'enemy_follower_turn';
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><span class="enemy-follower-pill">EXTRA ENEMY TURN // GRENU</span> <strong>${esc(msg)}</strong></p>
      </div>
      <button data-act="enemy-follower-continue">Your Turn<span class="keyhint"> (Enter)</span></button>
    </div>`);
}

function continueEnemyFollowerTurn() {
  if (battle.phase !== 'enemy_follower_turn') return;
  if (hero.hp <= 0 || battle.phase === 'dying') return;
  finishChoosePhase();
}

function finishChoosePhase() {
  if (battle.defendUsedThisTurn) {
    battle.defendUsedThisTurn = false;
  } else if (battle.defendCooldownTurns > 0) {
    battle.defendCooldownTurns--;
  }
  if (battle.exclusiveUsedThisTurn) {
    battle.exclusiveUsedThisTurn = false;
  } else if ((battle.exclusiveCooldownTurns || 0) > 0) {
    battle.exclusiveCooldownTurns--;
  }
  battle.phase = 'choose';
  fillHand();
  renderBattle();
}

function finishTurnAfterAllies() {
  if (!battle.enemyAttackedThisTurn) {
    performEnemyAttack({ fromWrongAnswer: false });
    if (hero.hp <= 0 || battle.phase === 'dying') return;
  }
  battle.enemyAttackedThisTurn = false;
  if (battle.enemyFollower && battle.enemyFollower.hp > 0 && battle.enemy && battle.enemy.hp > 0) {
    const followerMsg = performEnemyFollowerAttack();
    if (hero.hp <= 0 || battle.phase === 'dying') return;
    renderEnemyFollowerTurn(followerMsg);
    return;
  }
  finishChoosePhase();
}

function continueAllyTurn() {
  if (battle.phase !== 'ally_turn') return;
  if (battle.enemy.hp <= 0) return winBattle();
  const allies = getNecroAllies();
  battle.allyTurnIndex = (battle.allyTurnIndex || 0) + 1;
  if (battle.allyTurnIndex < allies.length) {
    const res = performSingleAllyAttack(battle.allyTurnIndex);
    renderAllyTurn(battle.allyTurnIndex, res.msg);
    return;
  }
  battle.allyTurnIndex = 0;
  finishTurnAfterAllies();
}

function performEnemyAttack({ fromWrongAnswer = false } = {}) {
  const foe = battle.enemy;
  if (!foe || foe.hp <= 0) return;
  if (battle.enemyStunTurns > 0) {
    battle.enemyStunTurns--;
    battle.stunAnimT = Math.max(battle.stunAnimT, 22);
    popup('enemy', 'STUNNED!', '#6fe3e8');
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#6fe3e8', 10, 2.2);
    battle.log = `${foe.name} is STUNNED and cannot attack (${battle.enemyStunTurns} turns left)!`;
    return;
  }
  // Enemy turn: every third turn (every second for bosses) is a telegraphed heavy attack.
  const heavy = isHeavy();
  let dmg = fromWrongAnswer
    ? Math.max(24, Math.round(foe.attack * (heavy ? 2.2 : 1.8) - hero.defense - battle.tempDefense))
    : Math.max(1, Math.round(foe.attack * (heavy ? 1.7 : 1) - hero.defense - battle.tempDefense));
  dmg = Math.max(1, Math.round(dmg * (1 - battle.block)));
  let aegisBreakNote = '';
  let aegisOverload = false;
  if (hero.runInvincible) {
    if (fromWrongAnswer) {
      const mpDrain = Math.min(hero.mana, 10);
      hero.mana = Math.max(0, hero.mana - mpDrain);
      if (mpDrain > 0) popup('hero', `-${mpDrain} MP`, '#6fe3e8');
      if (foe.isBoss) {
        dmg = Math.max(6, Math.round(dmg * 0.5));
        aegisBreakNote = `Aegis pierced by Boss breach! -${dmg} HP & -${mpDrain} MP (accuracy & streak penalized).`;
      } else {
        dmg = 4;
        aegisOverload = true;
        aegisBreakNote = `Aegis overload! Wrong answer drains ${mpDrain} MP & shocks you for 4 HP.`;
      }
    } else {
      dmg = 0;
    }
  } else if (battle.heroHitT > 0) {
    dmg = 0;
  }
  if (foe.isBoss) {
    const isCrolue = Boolean(foe.isFinal);
    battle.enemyLungeT = 1;
    battle.enemyLungeDistance = isCrolue ? 55 : 260;
    battle.bossAttackT = typeof getBossAttackDuration === 'function'
      ? getBossAttackDuration(foe)
      : BOSS_ATTACK_FRAMES * BOSS_ATTACK_BUFFER;
    if (isCrolue && typeof emitFx === 'function') {
      emitFx(HERO_SPOT.x + 40, HERO_SPOT.y - 36, '#d92638', 18, 4.5);
    }
  } else if (foe.brute) {
    // Drius uses a stationary attack animation instead of shoving forward.
    battle.enemyLungeT = 0;
    battle.enemyLungeDistance = 0;
    battle.driusAttackT = (typeof DRIUS_ATTACK_FRAMES_COUNT !== 'undefined' ? DRIUS_ATTACK_FRAMES_COUNT : 10) * (typeof DRIUS_ATTACK_BUFFER !== 'undefined' ? DRIUS_ATTACK_BUFFER : 3);
  } else {
    battle.enemyLungeT = 1;
    battle.enemyLungeDistance = heavy ? 235 : 185;
  }
  hero.hp = Math.max(0, hero.hp - dmg);
  if (dmg > 0) {
    battle.flash.hero = 12;
    battle.heroHitT = HERO_HIT_IFRAME_TICKS;
    battle.heroHitTintT = HERO_HIT_TINT_TICKS;
    battle.heroKnockbackT = 0;
    popup('hero', aegisOverload ? `-${dmg} OVERLOAD` : fromWrongAnswer && hero.runInvincible ? `-${dmg} PIERCE` : `-${dmg}`, '#e8706a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#e8706a', 14, 3.5);
  } else if (hero.runInvincible) {
    battle.aegisAnimT = Math.max(battle.aegisAnimT, 22);
    popup('hero', 'INVINCIBLE!', '#ffe07a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 75, '#ffe07a', 14, 3);
  } else {
    popup('hero', 'DODGE', '#f2bb61');
  }
  Sound.play(heavy ? 'heavy' : 'enemy');
  battle.log = aegisBreakNote
    ? aegisBreakNote
    : dmg > 0
      ? `${fromWrongAnswer ? 'Breach counter! ' : heavy ? 'Heavy charge! ' : ''}${foe.name} hits you for ${dmg}.`
      : hero.runInvincible
        ? `${foe.name}'s attack bounces off your Kernel Aegis invincibility!`
        : `${foe.name} misses while your invincibility is active.`;
  battle.block = 0;
  foe.turns++;

  if (hero.hp <= 0) {
    startHeroDeathSequence();
  }
}

function continueBattle() {
  if (battle.phase !== 'feedback' || battle.pendingAttack) return;
  window.ByteboundTutorial?.onBattleContinue?.();
  if (multiplayerMatchActive) {
    if (mpState.outcome || hero.hp <= 0 || battle.enemy.hp <= 0) {
      mpTriggerFinishSequence();
      return;
    }
    if (battle.defendUsedThisTurn) {
      battle.defendUsedThisTurn = false;
    } else if (battle.defendCooldownTurns > 0) {
      battle.defendCooldownTurns--;
    }
    battle.hand = [...STARTING_DECK];
    const activeRole = mpActiveRole(mpState.round);
    const queuedMove = mpState.movesByRound[mpState.round]?.[activeRole];
    if (queuedMove) {
      mpResolveTurn(mpState.round, queuedMove);
      return;
    }
    if (mpIsMyTurn()) {
      battle.phase = 'choose';
      battle.log = `Turn ${mpState.round + 1} — Your turn! Choose your move.`;
      renderBattle();
    } else {
      renderMultiplayerWaiting();
    }
    return;
  }
  if (battle.enemy.hp <= 0) return winBattle();

  // Burning tick at start of enemy turn resolution
  if (battle.enemyBurnTurns > 0 && battle.enemy.hp > 0) {
    const burnDmg = battle.enemyBurnDamage || 10;
    battle.enemy.hp = Math.max(0, battle.enemy.hp - burnDmg);
    battle.enemyBurnTurns--;
    battle.burnAnimT = Math.max(battle.burnAnimT, 28);
    battle.flash.enemy = Math.max(battle.flash.enemy, 8);
    popup('enemy', `-${burnDmg} BURN`, '#ff7b47');
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 72, '#ff7b47', 16, 3.2);
    if (battle.enemy.hp <= 0) {
      battle.enemyDefeatT = 0;
      return winBattle();
    }
  }

  // Necromancy resurrected allies take their own separate turns sequentially before the enemy turn
  // only when the player answered correctly this turn!
  if (!battle.enemyAttackedThisTurn && battle.lastAnswerCorrect !== false && getNecroAllies().length > 0 && battle.enemy.hp > 0) {
    battle.allyTurnIndex = 0;
    const res = performSingleAllyAttack(0);
    renderAllyTurn(0, res.msg);
    return;
  }

  finishTurnAfterAllies();
}

function winBattle() {
  battle.phase = 'won';
  battle.enemy.alive = false;
  const before = unlockedCardIds(getAchievementMetrics());
  stats.kills++;
  stats.roomKills++;
  recordAchievementProgress('kills', 1);
  if (battle.enemy.isBoss) recordAchievementProgress('bosses', 1);
  battle.newUnlocks = unlockedCardIds(getAchievementMetrics())
    .filter((id) => !before.includes(id) && !CARD_LIBRARY[id].start);
  Sound.play(battle.enemy.isBoss ? 'bossWin' : 'win');
  if (typeof submitLeaderboardRun === 'function') submitLeaderboardRun();
  if (!multiplayerMatchActive && hasNecromancyUnlocked() && battle.enemy) {
    const allies = getNecroAllies();
    const maxAllies = getNecromancyMaxAllies();
    if (allies.length < maxAllies) {
      const cand = {
        name: battle.enemy.name,
        isBoss: Boolean(battle.enemy.isBoss),
        isFinal: Boolean(battle.enemy.isFinal),
        kor: Boolean(battle.enemy.kor),
        brute: Boolean(battle.enemy.brute),
        nyrmed: Boolean(battle.enemy.nyrmed),
        grenu: Boolean(battle.enemy.grenu),
        maxHp: battle.enemy.maxHp,
        attack: Math.max(8, Math.round((battle.enemy.attack || 10) * 1.15)),
      };
      cand.manaCost = getNecromancyManaCost(cand);
      battle.necroCandidate = cand;
      renderNecromancyPrompt();
      return;
    }
    battle.log = `Necromancy capacity full (${allies.length}/${maxAllies}) — upgrade Necromancy in Skill Tree to raise more allies.`;
  }
  renderWin();
}

function renderNecromancyPrompt() {
  const cand = battle.necroCandidate;
  if (!cand) return renderWin();
  const allies = getNecroAllies();
  const maxAllies = getNecromancyMaxAllies();
  const manaCost = cand.manaCost ?? getNecromancyManaCost(cand);
  const canAfford = hero.mana >= manaCost;
  battle.phase = 'necro_prompt';
  setPanel('');
  const go = document.getElementById('gameOverOverlay');
  if (!go) return renderWin();
  go.classList.remove('is-victory', 'is-draw');
  go.classList.add('is-necromancy');
  go.innerHTML = `<div class="game-over-box is-necromancy">
    <div class="game-over-corruption">NECROMANCY PACT // ${esc(cand.isBoss ? 'BOSS SOUL' : 'SOUL HARVESTED')} (${allies.length}/${maxAllies})</div>
    <div class="game-over-skull" aria-hidden="true">☠</div>
    <h2 class="game-over-title" id="gameOverTitle" data-text="RESURRECT?">RESURRECT?</h2>
    <p class="game-over-killer">Raise <strong>${esc(cand.name)}</strong> (${cand.attack} ATK · ${cand.maxHp} HP) to fight beside you? (Ally ${allies.length + 1} of ${maxAllies})</p>
    <div class="game-over-stats">
      <div class="game-over-stat"><span>ALLY ATK</span><strong>${cand.attack}</strong></div>
      <div class="game-over-stat"><span>MANA COST</span><strong>${manaCost} MP</strong></div>
      <div class="game-over-stat"><span>YOUR MANA</span><strong>${hero.mana}/${hero.maxMana} MP</strong></div>
    </div>
    <p class="game-over-note">${canAfford ? `Costs ${manaCost} MP (stronger souls require more mana). Summoned allies only attack when you answer correctly.` : `Not enough mana! Need ${manaCost} MP to bind ${esc(cand.name)} (you have ${hero.mana} MP).`}</p>
    <div class="game-over-actions">
      <button type="button" class="game-over-btn is-primary" data-act="necro-yes" ${canAfford ? '' : 'disabled'}>${canAfford ? `Yes (-${manaCost} MP)` : `Need ${manaCost} MP`}</button>
      <button type="button" class="game-over-btn is-secondary" data-act="necro-no">${canAfford ? 'No' : 'Continue'}</button>
    </div>
  </div>`;
  go.hidden = false;
}

function afterWin() {
  if (battle.phase !== 'won') return;
  renderCardReward();
}

function pickReward(index) {
  const id = battle.rewards[index];
  if (battle.phase !== 'reward' || !id) return;
  window.ByteboundTutorial?.onRewardCardPicked?.(index, id);
  runDeck.push(id);
  stats.cardsTaken++;
  Sound.play('pick');
  afterReward();
}

function afterReward() {
  if (stats.kills % 2 === 0) return renderUpgrades();
  exitBattle();
}

function applyUpgrade(i) {
  const up = battle.upgrades[i];
  if (!up) return;
  window.ByteboundTutorial?.onUpgradePicked?.(i, up);
  up.apply();
  stats.upgrades.push(up.name);
  recordAchievementProgress('upgrades', 1);
  exitBattle(`Upgrade gained: ${up.name}. ${up.text}.`);
}

function exitBattle(msg) {
  mode = 'explore';
  grace = 90;
  renderExplore(msg);
  Sound.music('explore');
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  gsap.killTweensOf(overlay);
  gsap.fromTo(overlay, { opacity: 0.8 }, { opacity: 0, duration: 0.5 });
}

function retryRoom() {
  hideGameOverOverlay();
  if (typeof battleKingDeath !== 'undefined' && battleKingDeath) {
    battleKingDeath.autoplay = false;
    battleKingDeath.currentFrame = 0;
    battleKingDeath.elapsedFrames = 0;
  }
  hero.hp = Math.round(hero.maxHp / 2);
  gsap.killTweensOf(overlay);
  loadLevel(level);
  gsap.fromTo(overlay, { opacity: 1 }, { opacity: 0, duration: 0.5 });
}

function popup(target, text, color, options = {}) {
  const onHero = target === 'hero';
  const duration = options.duration || 50;
  const y = options.y === undefined ? 400 : options.y;
  battle.popups.push({
    text,
    color,
    life: duration,
    duration,
    rise: options.rise === undefined ? duration * 0.9 : options.rise,
    originY: y,
    x: (onHero ? HERO_SPOT.x : FOE_SPOT.x) + (options.offsetX || 0),
    y,
    style: options.style || '',
  });
}

function showHealFeedback(amount, options = {}) {
  if (amount <= 0) return;
  battle.heroHealFlashT = HERO_HEAL_FLASH_TICKS;
  battle.heroHealTintT = HERO_HEAL_TINT_TICKS;
  popup('hero', `+${amount}`, '#9dffd0', {
    duration: 42,
    rise: 40,
    style: 'heal',
    ...options,
  });
}

// ===== 1v1 Online Multiplayer Combat =====
function mpActiveRole(turn = mpState.round) {
  return turn % 2 === 0 ? 'host' : 'guest';
}

function mpIsMyTurn() {
  return Boolean(multiplayerMatchActive && mpActiveRole(mpState.round) === mpState.role);
}

function mpGetQuestionForRound(round) {
  if (Array.isArray(mpState.questions) && mpState.questions.length > 0) {
    return mpState.questions[round % mpState.questions.length];
  }
  const fallback = (typeof QUESTION_BANK !== 'undefined' && QUESTION_BANK.easy && QUESTION_BANK.easy[0]) || {
    q: 'What does CPU stand for?',
    choices: ['Central Processing Unit', 'Computer Power Unit', 'Core Program Utility', 'Control Processing Unit'],
    answer: 0,
    explain: 'CPU stands for Central Processing Unit.',
    category: 'Computer Systems',
    topic: 'Hardware',
    difficulty: 'easy',
  };
  return fallback;
}

function startMultiplayerMatch(matchConfig, role, selfClientId) {
  hideGameOverOverlay();
  endMultiplayerMatchState();
  multiplayerMatchActive = true;

  const selfRole = role === 'guest' ? 'guest' : 'host';
  const oppRole = selfRole === 'host' ? 'guest' : 'host';
  const selfSlot = matchConfig[selfRole] || {};
  const oppSlot = matchConfig[oppRole] || {};
  const base = matchConfig.baseStats || { maxHp: 100, maxMana: 100, attack: 12, defense: 2, empowerCost: 20 };

  Object.assign(mpState, {
    matchId: matchConfig.matchId || `${matchConfig.roomCode || 'MP'}-${Date.now()}`,
    roomCode: matchConfig.roomCode || '',
    arenaId: matchConfig.arenaId || 'arena',
    arenaName: matchConfig.arenaName || 'Cyber Arena',
    category: matchConfig.category || 'ALL',
    role: selfRole,
    selfClientId: selfClientId || selfSlot.clientId || null,
    selfName: selfSlot.username || (typeof activePlayerName !== 'undefined' ? activePlayerName : 'Knight'),
    selfAvatar: selfSlot.avatar || 'gold',
    opponentClientId: oppSlot.clientId || null,
    opponentName: oppSlot.username || 'Challenger',
    opponentAvatar: oppSlot.avatar || 'cyan',
    round: 0,
    questions: Array.isArray(matchConfig.questions) ? matchConfig.questions : [],
    movesByRound: {},
    resolvedRounds: new Set(),
    questionStartedAt: 0,
    pendingCardCost: 0,
    outcome: null,
    endReason: '',
    dyingTarget: null,
    deathCountdown: 0,
    selfCorrect: 0,
    selfTotal: 0,
    pvpSubmitted: false,
  });

  const makeFighter = () => ({
    hp: base.maxHp,
    maxHp: base.maxHp,
    mana: base.maxMana,
    maxMana: base.maxMana,
    attack: base.attack,
    defense: base.defense,
    empowerCost: base.empowerCost,
    streak: 0,
    correct: 0,
    damageDealt: 0,
    block: 0,
  });
  mpState.fighters = { host: makeFighter(), guest: makeFighter() };

  // Fair equal starting stats regardless of single-player Campaign Skill Tree or unlocks
  Object.assign(hero, {
    hp: base.maxHp,
    maxHp: base.maxHp,
    mana: base.maxMana,
    maxMana: base.maxMana,
    attack: base.attack,
    defense: base.defense,
    empowerCost: base.empowerCost,
    bonusHeal: 0,
    bonusMana: 0,
  });
  Object.assign(stats, { kills: 0, correct: 0, total: 0, streak: 0, roomKills: 0, upgrades: [], cardsTaken: 0 });
  runDeck.splice(0, runDeck.length, ...STARTING_DECK);

  if (typeof setArenaTheme === 'function') {
    setArenaTheme(mpState.arenaId);
  }
  if (typeof battleKingDeath !== 'undefined' && battleKingDeath) {
    battleKingDeath.currentFrame = 0;
    battleKingDeath.elapsedFrames = 0;
    battleKingDeath.autoplay = false;
  }
  if (typeof opponentKingDeath !== 'undefined' && opponentKingDeath) {
    opponentKingDeath.currentFrame = 0;
    opponentKingDeath.elapsedFrames = 0;
    opponentKingDeath.autoplay = false;
  }

  keys.a.pressed = false;
  keys.d.pressed = false;
  player.velocity = { x: 0, y: 0 };
  battle.drawPile = [...STARTING_DECK];
  battle.discard = [];
  battle.hand = [...STARTING_DECK];

  const foe = {
    name: mpState.opponentName,
    hp: base.maxHp,
    maxHp: base.maxHp,
    mana: base.maxMana,
    maxMana: base.maxMana,
    attack: base.attack,
    defense: base.defense,
    isBoss: false,
    isMultiplayerPlayer: true,
    alive: true,
    turns: 0,
    avatar: mpState.opponentAvatar,
  };

  Object.assign(battle, {
    enemy: foe, phase: 'intro', card: null, question: null, block: 0, popups: [], tempDefense: 0,
    defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
    enemyDefendEffectT: 0, enemyHealTintT: 0, enemyChargeT: 0,
    enemyProjectileT: -1, enemyProjectileCharged: false, enemyImpactRingT: 0, enemyPreviewCard: null,
    heroHealFlashT: 0, heroHealTintT: 0,
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, driusAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    pendingAttack: false,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
    deathTimer: 0, enemyAttackedThisTurn: false, lastAnswerCorrect: true,
    flash: { hero: 0, enemy: 0 }, fromReview: false, newUnlocks: [],
    log: mpState.role === 'host'
      ? `Turn 1: YOUR TURN vs ${foe.name} — Choose your move!`
      : `Turn 1: ${foe.name}'s turn — Waiting for opponent...`,
  });

  if (typeof playViewActive !== 'undefined' && !playViewActive && typeof showPlayView === 'function') {
    showPlayView();
  }
  Sound.play('encounter');
  Sound.music('battle');
  beginIntro();
}

function stopMpSyncHeartbeat() {
  if (mpSyncIntervalId) {
    clearInterval(mpSyncIntervalId);
    mpSyncIntervalId = null;
  }
}

function startMpSyncHeartbeat() {
  stopMpSyncHeartbeat();
  mpSyncIntervalId = setInterval(() => {
    if (!multiplayerMatchActive || battle.phase !== 'mp_waiting' || mpState.outcome) {
      stopMpSyncHeartbeat();
      return;
    }
    const activeRole = mpActiveRole(mpState.round);
    const queuedMove = mpState.movesByRound[mpState.round]?.[activeRole];
    if (queuedMove && !mpState.resolvedRounds.has(mpState.round)) {
      stopMpSyncHeartbeat();
      mpResolveTurn(mpState.round, queuedMove);
      return;
    }
    if (window.mpUI?.matchmaking) {
      window.mpUI.matchmaking.sendMatchMove({
        kind: 'sync_request',
        matchId: mpState.matchId,
        round: mpState.round,
        role: mpState.role,
        clientId: mpState.selfClientId,
      });
      if (typeof window.mpUI.matchmaking.fetchMatchMoves === 'function') {
        window.mpUI.matchmaking.fetchMatchMoves().then((moves) => {
          if (!Array.isArray(moves) || !multiplayerMatchActive) return;
          for (const mv of moves) mpReceiveRemoteMove(mv);
        }).catch(() => {});
      }
    }
  }, 2200);
}

function renderMultiplayerWaiting() {
  const activeRole = mpActiveRole(mpState.round);
  const queuedMove = mpState.movesByRound[mpState.round]?.[activeRole];
  if (queuedMove && !mpState.resolvedRounds.has(mpState.round)) {
    stopMpSyncHeartbeat();
    mpResolveTurn(mpState.round, queuedMove);
    return;
  }
  battle.phase = 'mp_waiting';
  startMpSyncHeartbeat();
  const previewCard = battle.enemyPreviewCard && CARD_LIBRARY[battle.enemyPreviewCard];
  const detailText = previewCard
    ? `${esc(mpState.opponentName)} selected <strong>${esc(previewCard.name)}</strong> and is answering their question...`
    : `Wait for ${esc(mpState.opponentName)} to choose an action and answer their question.`;
  setPanel(`<div class="battle-feedback-row">
    <div class="battle-feedback-copy">
      <p><span class="mp-turn-pill is-theirs">OPPONENT'S TURN</span> <strong>Turn ${mpState.round + 1}: ${esc(mpState.opponentName)} is acting...</strong></p>
      <p class="log">${detailText}</p>
    </div>
    <button type="button" class="mp-inline-forfeit" data-act="mp-forfeit">Forfeit Match</button>
  </div>`);
}

function mpSubmitLocalMove(correct) {
  const turn = mpState.round;
  const role = mpState.role === 'guest' ? 'guest' : 'host';
  if (mpActiveRole(turn) !== role) return;
  const movePayload = {
    matchId: mpState.matchId,
    round: turn,
    role,
    clientId: mpState.selfClientId,
    cardId: battle.card,
    cardCost: mpState.pendingCardCost || 0,
    correct: Boolean(correct),
    elapsedMs: Math.max(0, Math.round(performance.now() - (mpState.questionStartedAt || performance.now()))),
  };

  if (!mpState.movesByRound[turn]) mpState.movesByRound[turn] = {};
  mpState.movesByRound[turn][role] = movePayload;

  if (window.mpUI?.matchmaking) {
    window.mpUI.matchmaking.sendMatchMove(movePayload);
  }

  mpResolveTurn(turn, movePayload);
}

function mpReceiveRemoteMove(payload) {
  if (!multiplayerMatchActive || !payload) return;
  if (payload.matchId && mpState.matchId && payload.matchId !== mpState.matchId) return;
  if (payload.clientId && mpState.selfClientId && payload.clientId === mpState.selfClientId) return;

  const moveRole = payload.role === 'host' || payload.role === 'guest'
    ? payload.role
    : (mpState.role === 'host' ? 'guest' : 'host');
  if (moveRole === mpState.role) return;

  const turn = Number(payload.round);
  if (!Number.isFinite(turn)) return;

  if (payload.kind === 'sync_request') {
    const startRound = Math.max(0, turn);
    for (let r = startRound; r <= mpState.round; r++) {
      if (mpActiveRole(r) === mpState.role && mpState.movesByRound[r]?.[mpState.role]) {
        window.mpUI?.matchmaking?.sendMatchMove(mpState.movesByRound[r][mpState.role]);
      }
    }
    return;
  }

  if (mpActiveRole(turn) !== moveRole) return;

  if (payload.kind === 'preview') {
    if (turn === mpState.round && battle.phase === 'mp_waiting') {
      battle.enemyPreviewCard = payload.cardId || null;
      if (payload.cardId === 'power' || payload.cardId === 'overclock') {
        battle.enemyChargeT = 48;
        emitFx(FOE_SPOT.x, FOE_SPOT.y - 76, '#ff9659', 10, 2.6);
      } else if (payload.cardId === 'defend') {
        emitFx(FOE_SPOT.x - 42, FOE_SPOT.y - 82, '#6fe3e8', 8, 2.2);
      }
      renderMultiplayerWaiting();
    }
    return;
  }

  if (!mpState.movesByRound[turn]) mpState.movesByRound[turn] = {};
  mpState.movesByRound[turn][moveRole] = payload;

  if (turn === mpState.round && battle.phase !== 'feedback') {
    mpResolveTurn(turn, payload);
  } else if (turn === mpState.round && battle.phase === 'feedback' && !battle.pendingAttack) {
    const continueBtn = panel.querySelector('[data-act="continue"]');
    if (continueBtn && !continueBtn.disabled) {
      continueBtn.innerHTML = 'Continue — Your Turn Ready<span class="keyhint"> (Enter)</span>';
    }
  }
}

function mpResolveTurn(turn, move) {
  if (!multiplayerMatchActive || mpState.resolvedRounds.has(turn) || !move) return;
  const actorRole = mpActiveRole(turn);
  const defRole = actorRole === 'host' ? 'guest' : 'host';
  if (move.role !== actorRole) return;
  mpState.resolvedRounds.add(turn);

  const actor = mpState.fighters[actorRole];
  const defender = mpState.fighters[defRole];
  const card = CARD_LIBRARY[move.cardId] || CARD_LIBRARY.strike;

  actor.mana = Math.max(0, actor.mana - (Number(move.cardCost) || 0));
  actor.block = 0;

  let focusHeal = 0;
  let manaGain = 0;
  let cardHeal = 0;
  if (move.correct) {
    actor.streak++;
    actor.correct++;
    focusHeal = 4 + 2 * Math.min(actor.streak, 5);
    manaGain = 5 + (card.manaOnCorrect || 0) + (card.kind === 'charge' ? 25 : 0);
    cardHeal = card.kind === 'heal' ? card.heal : 0;
    actor.block = card.kind === 'defend' ? 0.75 : 0;
  } else {
    actor.streak = 0;
    manaGain = card.kind === 'charge' ? 10 : 0;
    cardHeal = card.kind === 'heal' ? 2 : 0;
    actor.block = card.kind === 'defend' ? 0.25 : 0;
  }

  actor.mana = Math.min(actor.maxMana, actor.mana + manaGain);
  const hpBefore = actor.hp;
  actor.hp = Math.min(actor.maxHp, actor.hp + focusHeal + cardHeal);
  const healAmt = actor.hp - hpBefore;

  let dmgDealt = 0;
  if (card.kind === 'hit' && move.correct) {
    const raw = Math.round(actor.attack * card.power * (card.correctMult || 1));
    const afterDef = Math.max(1, raw - defender.defense);
    dmgDealt = Math.max(1, Math.round(afterDef * (1 - (defender.block || 0))));
    defender.block = 0;
    defender.hp = Math.max(0, defender.hp - dmgDealt);
    actor.damageDealt += dmgDealt;
  }

  const glitch = move.correct ? 0 : 5;
  if (glitch > 0) {
    actor.hp = Math.max(0, actor.hp - glitch);
  }

  const selfRole = mpState.role === 'guest' ? 'guest' : 'host';
  const oppRole = selfRole === 'host' ? 'guest' : 'host';
  const selfFighter = mpState.fighters[selfRole];
  const oppFighter = mpState.fighters[oppRole];
  const isSelfActor = actorRole === selfRole;

  hero.hp = selfFighter.hp;
  hero.mana = selfFighter.mana;
  battle.enemy.hp = oppFighter.hp;
  battle.enemy.mana = oppFighter.mana;
  battle.enemy.turns++;
  if (battle.enemy.hp <= 0) battle.enemy.alive = false;

  if (isSelfActor) {
    if (healAmt > 0) {
      showHealFeedback(healAmt, { offsetX: 58, y: HERO_SPOT.y - 78 });
      emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 14, 2.5);
    }
    if (dmgDealt > 0) {
      battle.pendingAttack = true;
      battle.lungeT = move.cardId === 'power' ? 0 : 1;
      battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
      battle.projectileCharged = move.cardId === 'power';
      battle.projectileQueued = move.cardId === 'power';
      battle.projectileT = move.cardId === 'power' ? -1 : 0;
      battle.projectileDamage = 0;
      popup('enemy', `-${dmgDealt}`, '#e8706a');
    } else {
      battle.chargeCard = false;
      battle.chargeMaxT = 0;
      battle.projectileQueued = false;
      battle.pendingAttack = false;
  battle.lastAnswerCorrect = false;
    }
    if (move.cardId === 'defend') {
      battle.defendEffectT = move.correct ? DEFEND_EFFECT_FRAMES : 0;
      Sound.play('block');
    }
    if (glitch > 0) {
      battle.flash.hero = 12;
      battle.heroHitTintT = HERO_HIT_TINT_TICKS;
      battle.heroKnockbackT = 0;
      popup('hero', `-${glitch} GLITCH`, '#e8706a');
      emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#e8706a', 14, 3.2);
    }
  } else {
    battle.enemyPreviewCard = null;
    battle.enemyChargeT = 0;
    if (healAmt > 0) {
      if (card.kind === 'heal') {
        battle.enemyHealTintT = 18;
        Sound.play('heal');
      }
      popup('enemy', `+${healAmt} HP`, '#7fd49a');
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#7fd49a', 14, 2.5);
    }
    if (move.cardId === 'defend') {
      battle.enemyDefendEffectT = move.correct ? DEFEND_EFFECT_FRAMES : Math.round(DEFEND_EFFECT_FRAMES * 0.6);
      emitFx(FOE_SPOT.x - 52, FOE_SPOT.y - 82, '#e8fbff', 14, 3.6);
      emitFx(FOE_SPOT.x - 52, FOE_SPOT.y - 82, '#6fe3e8', 10, 2.8);
      Sound.play('block');
      popup('enemy', move.correct ? 'SHIELD UP!' : 'WEAK GUARD', '#8beaff');
    } else if (move.cardId === 'charge' || move.cardId === 'mana') {
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 78, '#8fd0dc', 14, 3.0);
      Sound.play('charge');
      popup('enemy', '+MANA', '#8fd0dc');
    } else if (move.cardId === 'buff') {
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 78, '#c9b6ff', 14, 3.0);
      Sound.play('block');
      popup('enemy', '+DEF', '#c9b6ff');
    }
    if (dmgDealt > 0) {
      if (move.cardId === 'power' || move.cardId === 'overclock') {
        battle.enemyProjectileT = 0;
        battle.enemyProjectileCharged = true;
        battle.enemyImpactRingT = 1;
        if (!document.body.classList.contains('reduce-motion')) {
          battle.cameraShakeT = Math.max(battle.cameraShakeT, 1.0);
        }
        Sound.play('heavy');
        popup('enemy', 'POWER STRIKE!', '#ff9659');
      } else {
        battle.enemyLungeT = 1;
        battle.enemyLungeDistance = 195;
        Sound.play('enemy');
      }
      battle.flash.hero = 12;
      battle.heroHitTintT = HERO_HIT_TINT_TICKS;
      battle.heroKnockbackT = 0;
      popup('hero', `-${dmgDealt}`, '#e8706a');
      emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#e8706a', 14, 3.2);
    }
    if (glitch > 0) {
      popup('enemy', `-${glitch} GLITCH`, '#f2bb61');
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, '#f2bb61', 12, 2.8);
    }
  }

  if (hero.hp <= 0 && battle.enemy.hp <= 0) {
    mpState.outcome = 'draw';
    mpState.endReason = 'Double KO! Both challengers fell.';
  } else if (battle.enemy.hp <= 0) {
    mpState.outcome = 'won';
    mpState.endReason = `You defeated ${mpState.opponentName} on Turn ${turn + 1}!`;
  } else if (hero.hp <= 0) {
    mpState.outcome = 'lost';
    mpState.endReason = `${mpState.opponentName} claimed victory on Turn ${turn + 1}.`;
  }

  const cardName = card.name || 'Move';
  const actionNote = move.correct
    ? `${cardName}: Correct!${dmgDealt > 0 ? ` Dealt ${dmgDealt} DMG.` : ''}${healAmt > 0 ? ` +${healAmt} HP.` : ''}`
    : `${cardName}: Missed (-${glitch} glitch).`;

  if (mpState.outcome) {
    battle.log = actionNote;
    battle.phase = 'feedback';
    renderHud();
    if (!battle.pendingAttack) {
      mpTriggerFinishSequence();
      return;
    }
    const q = battle.question || mpGetQuestionForRound(turn);
    setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><strong class="${move.correct ? 'ok' : 'bad'}">${move.correct ? 'Correct!' : 'Not quite.'}</strong> <b>Answer: ${esc(q.choices[q.answer])}.</b></p>
        <p class="log">${esc(actionNote)}</p>
      </div>
      <button type="button" disabled>Final Blow...</button>
    </div>`);
    return;
  }

  mpState.round = turn + 1;

  if (isSelfActor) {
    const notes = [`You (${actionNote})`, `Next: ${mpState.opponentName}'s turn.`];
    battle.log = notes.join(' ');
    battle.phase = 'feedback';
    renderFeedback(Boolean(move.correct), notes);
  } else {
    stopMpSyncHeartbeat();
    battle.log = `${mpState.opponentName} (${actionNote}) — Your turn!`;
    battle.hand = [...STARTING_DECK];
    battle.phase = 'choose';
    renderBattle();
  }
}

function mpTriggerFinishSequence() {
  if (!multiplayerMatchActive) return;
  battle.phase = 'mp_dying';
  mpState.deathCountdown = 66;
  if (hero.hp <= 0 && typeof battleKingDeath !== 'undefined' && battleKingDeath) {
    battleKingDeath.currentFrame = 0;
    battleKingDeath.elapsedFrames = 0;
    battleKingDeath.autoplay = true;
    mpState.dyingTarget = battle.enemy && battle.enemy.hp <= 0 ? 'both' : 'hero';
  }
  if (battle.enemy && battle.enemy.hp <= 0 && typeof opponentKingDeath !== 'undefined' && opponentKingDeath) {
    opponentKingDeath.currentFrame = 0;
    opponentKingDeath.elapsedFrames = 0;
    opponentKingDeath.autoplay = true;
    mpState.dyingTarget = mpState.dyingTarget === 'hero' ? 'both' : 'enemy';
  }
  if (!mpState.dyingTarget) mpState.deathCountdown = 10;
  setPanel(`<div class="battle-feedback-row">
    <div class="battle-feedback-copy">
      <p><strong>${mpState.outcome === 'won' ? 'VICTORY STRIKE!' : mpState.outcome === 'draw' ? 'DOUBLE KNOCKOUT!' : 'SIGNAL LOST!'}</strong> ${esc(mpState.endReason)}</p>
    </div>
  </div>`);
}

function mpHandleForfeit(payload) {
  if (!multiplayerMatchActive) return;
  const selfWins = payload?.winnerClientId
    ? payload.winnerClientId === mpState.selfClientId
    : true;
  mpState.outcome = selfWins ? 'won' : 'lost';
  mpState.endReason = payload?.reason || (selfWins ? `${mpState.opponentName} disconnected or forfeited.` : 'You forfeited the match.');
  renderMultiplayerResult();
}

function renderMultiplayerResult() {
  setPanel('');
  const go = document.getElementById('gameOverOverlay');
  if (!go) return;
  const won = mpState.outcome === 'won';
  const draw = mpState.outcome === 'draw';
  battle.phase = won ? 'mp_won' : 'mp_lost';
  Sound.music(null);
  Sound.play(won ? 'win' : 'lose');

  const title = won ? 'VICTORY' : (draw ? 'DRAW' : 'DEFEAT');
  const banner = won
    ? '1V1 ARENA DOMINATED // CHALLENGER DEFEATED'
    : (draw ? 'SIMULTANEOUS BREACH // MATCH TIED' : 'FATAL SYSTEM BREACH // DUEL LOST');
  const oppHp = battle.enemy ? battle.enemy.hp : 0;
  const boxClass = won ? ' is-victory' : (draw ? ' is-draw' : '');
  const matchAccuracy = mpState.selfTotal
    ? `${Math.floor((100 * (mpState.selfCorrect || 0)) / mpState.selfTotal)}%`
    : '0%';

  if (!mpState.pvpSubmitted && mpState.matchId) {
    mpState.pvpSubmitted = true;
    if (typeof recordAchievementProgress === 'function') {
      recordAchievementProgress('pvpMatches', 1);
      if (won) recordAchievementProgress('pvpWins', 1);
    }
    if (typeof submitPvpLeaderboardMatch === 'function') {
      const selfDamage = mpState.fighters?.[mpState.role]?.damageDealt || 0;
      submitPvpLeaderboardMatch({
        matchId: mpState.matchId,
        playerName: mpState.selfName,
        outcome: mpState.outcome || (won ? 'won' : draw ? 'draw' : 'lost'),
        correctAnswers: mpState.selfCorrect || 0,
        totalAnswers: mpState.selfTotal || 0,
        damageDealt: selfDamage,
      });
    }
  }

  go.classList.toggle('is-victory', won);
  go.classList.toggle('is-draw', draw);
  go.innerHTML = `<div class="game-over-box${boxClass}">
    <div class="game-over-corruption">${banner}</div>
    <div class="game-over-skull" aria-hidden="true">${won ? '♛' : (draw ? '⚔' : '☠')}</div>
    <h2 class="game-over-title" id="gameOverTitle" data-text="${title}">${title}</h2>
    <p class="game-over-killer">${esc(mpState.endReason || `Match vs ${mpState.opponentName} completed.`)}</p>
    <div class="game-over-stats">
      <div class="game-over-stat"><span>ROUNDS</span><strong>${mpState.round + 1}</strong></div>
      <div class="game-over-stat"><span>YOUR HP</span><strong>${hero.hp}/${hero.maxHp}</strong></div>
      <div class="game-over-stat"><span>FOE HP</span><strong>${oppHp}/100</strong></div>
    </div>
    <p class="game-over-note">Room ${esc(mpState.roomCode)} · ${esc(mpState.arenaName)} · Accuracy ${matchAccuracy}</p>
    <div class="game-over-actions">
      <button type="button" class="game-over-btn is-primary" data-act="mp-lobby">Return to Lobby</button>
      <button type="button" class="game-over-btn is-secondary" data-act="mp-menu">Main Menu</button>
    </div>
  </div>`;
  go.hidden = false;
}

// Every button in the panel goes through one delegated click handler.
panel.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const { act, val } = btn.dataset;
  if (typeof window.ByteboundTutorial?.interceptCombatAction === 'function') {
    if (window.ByteboundTutorial.interceptCombatAction(act, val, btn, e)) return;
  }
  const actions = {
    card: () => chooseCard(Number(val)),
    remedial: () => startRemedialChallenge(),
    'remedial-answer': () => answerRemedialQuestion(Number(val)),
    answer: () => answerQuestion(Number(val)),
    continue: () => continueBattle(),
    'ally-continue': () => continueAllyTurn(),
    'enemy-follower-continue': () => continueEnemyFollowerTurn(),
    won: () => afterWin(),
    pickcard: () => pickReward(Number(val)),
    upgrade: () => applyUpgrade(Number(val)),
    retry: () => retryRoom(),
    again: () => startGame(),
    start: () => startGame(),
    'mp-forfeit': () => {
      if (!multiplayerMatchActive) return;
      mpState.outcome = 'lost';
      mpState.endReason = 'You forfeited the 1v1 match.';
      window.mpUI?.matchmaking?.forfeitMatch(`${mpState.selfName} forfeited the match.`);
      renderMultiplayerResult();
    },
  };
  if (actions[act]) actions[act]();
});

const gameOverOverlayEl = document.getElementById('gameOverOverlay');
if (gameOverOverlayEl) {
  gameOverOverlayEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'retry') retryRoom();
    else if (act === 'necro-yes') {
      const allies = getNecroAllies();
      const maxAllies = getNecromancyMaxAllies();
      const cand = battle.necroCandidate;
      const manaCost = cand ? (cand.manaCost ?? getNecromancyManaCost(cand)) : 0;
      if (cand && allies.length < maxAllies && hero.mana >= manaCost) {
        hero.mana = Math.max(0, hero.mana - manaCost);
        const nextAllies = [...allies, { ...cand }];
        hero.necroAllies = nextAllies;
        hero.necroAlly = nextAllies[0];
        battle.necroCandidate = null;
        popup('hero', `-${manaCost} MP`, '#c77dff');
        emitFx(HERO_SPOT.x - 135, HERO_SPOT.y - 60, '#c77dff', 28, 4.2);
        Sound.play('heal');
      } else {
        battle.necroCandidate = null;
      }
      hideGameOverOverlay();
      battle.phase = 'won';
      renderWin();
    } else if (act === 'necro-no') {
      battle.necroCandidate = null;
      hideGameOverOverlay();
      battle.phase = 'won';
      renderWin();
    } else if (act === 'hub') {
      hideGameOverOverlay();
      showDashboard();
    } else if (act === 'mp-lobby') {
      hideGameOverOverlay();
      endMultiplayerMatchState();
      showDashboard('quest');
      if (window.mpUI) {
        window.mpUI.matchmaking?.returnRoomToLobby();
        window.mpUI.open();
      }
    } else if (act === 'mp-menu') {
      hideGameOverOverlay();
      endMultiplayerMatchState();
      window.mpUI?.matchmaking?.leaveCurrentRoom();
      showDashboard('quest');
    }
  });
}
