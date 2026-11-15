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
const TOPIC_TRACKER_STORAGE_KEY = 'kings-pigs-topic-tracker-v1';
let activeTopicTrackerStorageKey = TOPIC_TRACKER_STORAGE_KEY;
const SKILL_TREES = {
  computerSystems: {
    name: 'Computer Systems',
    color: 'gold',
    skills: [
      { id: 'foundation', name: 'Hardware Tuning', description: 'Tune your knight’s gear for stronger physical attacks.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'operatingSystem', name: 'OS Stability', description: 'Harden system defenses to reduce incoming damage.', effect: '+1 DEF per rank', bonus: { defense: 1 }, requires: ['foundation'] },
      { id: 'recovery', name: 'Recovery Protocol', description: 'Restore more health whenever you answer correctly.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['foundation'] },
      { id: 'virtualization', name: 'Virtualization', description: 'Run isolated virtual systems to expand your health reserve.', effect: '+5 max HP per rank', bonus: { maxHp: 5 }, requires: ['operatingSystem'] },
      { id: 'thermalControl', name: 'Thermal Control', description: 'Keep hardware stable under pressure and reinforce your armor.', effect: '+2 DEF per rank', bonus: { defense: 2 }, requires: ['operatingSystem', 'recovery'] },
      { id: 'firmwareOverclock', name: 'Firmware Overclock', description: 'Push optimized firmware beyond its standard limits.', effect: '+2 ATK and +2 max HP per rank', bonus: { attack: 2, maxHp: 2 }, requires: ['virtualization', 'thermalControl'] },
    ],
  },
  networkingSecurity: {
    name: 'Networking & Security',
    color: 'blue',
    skills: [
      { id: 'foundation', name: 'Firewall', description: 'Filter incoming threats and strengthen your guard.', effect: '+1 DEF per rank', bonus: { defense: 1 } },
      { id: 'threatAnalysis', name: 'Threat Analysis', description: 'Identify weak points and turn threat intelligence into damage.', effect: '+1 ATK per rank', bonus: { attack: 1 }, requires: ['foundation'] },
      { id: 'secureChannel', name: 'Secure Channel', description: 'Recover mana through safe, reliable communication.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['foundation'] },
      { id: 'intrusionDetection', name: 'Intrusion Detection', description: 'Detect hostile activity early and prepare a stronger response.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['threatAnalysis', 'secureChannel'] },
      { id: 'packetRouting', name: 'Packet Routing', description: 'Route resources efficiently to increase your mana capacity.', effect: '+5 max MP per rank', bonus: { maxMana: 5 }, requires: ['secureChannel'] },
      { id: 'zeroTrust', name: 'Zero Trust', description: 'Verify every action and regain more health with correct answers.', effect: '+3 HP per correct answer per rank', bonus: { bonusHeal: 3 }, requires: ['intrusionDetection', 'packetRouting'] },
    ],
  },
  programming: {
    name: 'Programming',
    color: 'green',
    skills: [
      { id: 'foundation', name: 'Algorithm Efficiency', description: 'Improve attack routines with more efficient algorithms.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'errorHandling', name: 'Error Handling', description: 'Catch mistakes early and reduce the impact of enemy attacks.', effect: '+1 DEF per rank', bonus: { defense: 1 }, requires: ['foundation'] },
      { id: 'codeReuse', name: 'Code Reuse', description: 'Reuse reliable recovery routines to heal more on correct answers.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['foundation'] },
      { id: 'concurrency', name: 'Concurrency', description: 'Coordinate parallel tasks to restore mana more efficiently.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['errorHandling'] },
      { id: 'runtimeOptimization', name: 'Runtime Optimization', description: 'Optimize execution paths for greater combat output.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['errorHandling', 'codeReuse'] },
      { id: 'compilerMastery', name: 'Compiler Mastery', description: 'Transform advanced optimizations into a large attack increase.', effect: '+2 ATK per rank', bonus: { attack: 2 }, requires: ['concurrency', 'runtimeOptimization'] },
    ],
  },
  database: {
    name: 'Database',
    color: 'red',
    skills: [
      { id: 'foundation', name: 'Query Indexing', description: 'Index battle knowledge for faster, more decisive attacks.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'transactions', name: 'Transaction Safety', description: 'Apply reliable transaction principles to improve defense.', effect: '+1 DEF per rank', bonus: { defense: 1 }, requires: ['foundation'] },
      { id: 'queryCache', name: 'Query Cache', description: 'Cache useful results to regain mana on correct answers.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['foundation'] },
      { id: 'replication', name: 'Replication', description: 'Replicate critical resources to expand your mana reserve.', effect: '+5 max MP per rank', bonus: { maxMana: 5 }, requires: ['queryCache'] },
      { id: 'queryOptimizer', name: 'Query Optimizer', description: 'Choose efficient query plans for balanced combat improvements.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['transactions', 'queryCache'] },
      { id: 'acidGuarantee', name: 'ACID Guarantee', description: 'Protect consistency under pressure and increase health recovery.', effect: '+3 HP per correct answer per rank', bonus: { bonusHeal: 3 }, requires: ['replication', 'queryOptimizer'] },
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
    for (const key of SKILL_TREE_KEYS) {
      const source = stored?.[key];
      if (!source || typeof source !== 'object') continue;
      if (Number.isSafeInteger(source.correct) && source.correct >= 0) {
        progress[key].correct = source.correct;
      }
      for (const skill of SKILL_TREES[key].skills) {
        const rank = source.ranks?.[skill.id];
        if (Number.isInteger(rank) && rank >= 0 && rank <= SKILL_MAX_RANK) {
          progress[key].ranks[skill.id] = rank;
        }
      }
    }
  } catch (error) {
    console.error('Unable to load saved skill tree progress.', error);
    activeSkillSpecialization = null;
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

function saveSkillProgress() {
  if (practiceRunActive) return true;
  try {
    localStorage.setItem(activeSkillStorageKey, JSON.stringify({
      ...skillProgress,
      specialization: { activeTree: activeSkillSpecialization },
    }));
    if (typeof scheduleUserProfileSync === 'function') scheduleUserProfileSync();
    return true;
  } catch (error) {
    console.error('Unable to save skill tree progress.', error);
    return false;
  }
}

function skillPointsAvailable(key) {
  const progress = skillProgress[key];
  const spent = Object.values(progress.ranks).reduce((total, rank) => total + rank, 0);
  return Math.max(0, Math.floor(progress.correct / SKILL_POINT_INTERVAL) - spent);
}

function applySkillBonus(bonus, multiplier = 1) {
  for (const [stat, amount] of Object.entries(bonus)) {
    hero[stat] = (hero[stat] || 0) + amount * multiplier;
  }
}

function recordCorrectAnswer(category) {
  const key = SKILL_TREE_KEYS.find((treeKey) => SKILL_TREES[treeKey].name === category);
  if (!key) return false;

  const previousPoints = Math.floor(skillProgress[key].correct / SKILL_POINT_INTERVAL);
  skillProgress[key].correct++;
  saveSkillProgress();
  return Math.floor(skillProgress[key].correct / SKILL_POINT_INTERVAL) > previousPoints;
}

function countSpecializedSkills(key) {
  return SKILL_TREES[key].skills.filter((skill) => skillProgress[key].ranks[skill.id] > 0).length;
}

function canSwitchSkillSet() {
  return !activeSkillSpecialization ||
    countSpecializedSkills(activeSkillSpecialization) < SKILLS_TO_SPECIALIZE(activeSkillSpecialization);
}

function skillRequirements(skill) {
  return skill.requires || (skill.requiresFoundation ? ['foundation'] : []);
}

function canUpgradeSkill(key, skill) {
  if (!SKILL_TREES[key] || !skill || !skillProgress[key]) return false;
  const progress = skillProgress[key];
  return (
    skillPointsAvailable(key) > 0 &&
    progress.ranks[skill.id] < SKILL_MAX_RANK &&
    skillRequirements(skill).every((id) => progress.ranks[id] > 0) &&
    (!activeSkillSpecialization || activeSkillSpecialization === key || canSwitchSkillSet())
  );
}

function upgradeSkill(key, skillId) {
  const skill = SKILL_TREES[key]?.skills.find((entry) => entry.id === skillId);
  if (!skill || !canUpgradeSkill(key, skill)) return false;

  skillProgress[key].ranks[skill.id]++;
  activeSkillSpecialization = key;
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
  enemy: null, phase: 'choose', card: null, question: null, block: 0, tempDefense: 0,
  defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
  heroHealFlashT: 0, heroHealTintT: 0,
  log: '', popups: [], hand: [], drawPile: [], discard: [], rewards: [], upgrades: [],
  fromReview: false, newUnlocks: [], pendingAttack: false,
  lungeT: 0, heroAttackT: 0, bossAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
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

function endMultiplayerMatchState() {
  multiplayerMatchActive = false;
  mpState.matchId = null;
  mpState.movesByRound = {};
  mpState.resolvedRounds = new Set();
  mpState.fighters = null;
  mpState.outcome = null;
  mpState.endReason = '';
  mpState.dyingTarget = null;
  mpState.deathCountdown = 0;
  if (typeof setArenaTheme === 'function') setArenaTheme('arena');
}

function resetRun() {
  endMultiplayerMatchState();
  Object.assign(hero, { hp: 100, maxHp: 100, mana: 100, maxMana: 100, attack: 12, defense: 2, empowerCost: 20, bonusHeal: 0, bonusMana: 0 });
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
  while (battle.hand.length < HAND_SIZE) {
    const id = drawCardId();
    if (!id) break;
    battle.hand.push(id);
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
  const fallback = left
    ? (boss
      ? 'Mini boss ahead — touch it to battle.'
      : 'Touch a virus to battle and unlock the door.')
    : 'Room cleared! Walk to the door to continue.';
  const noun = boss ? 'boss' : (left === 1 ? 'virus' : 'viruses');
  const statusPrefix = left > 0 ? `${left} ${noun} left · ` : '';
  setPanel('');
  setExploreBanner(`${currentRoom.name}: ${statusPrefix}${msg || fallback}`);
}

function renderBattle() {
  const cards = battle.hand.map((id, i) => {
    const card = CARD_LIBRARY[id];
    const defendCooling = card.id === 'defend' && battle.defendCooldownTurns > 0;
    const blocked = hero.mana < cardCost(card, hero) || defendCooling;
    const detail = defendCooling
      ? `CD ${battle.defendCooldownTurns}t`
      : `${esc(cardCostLabel(card, hero))} · ${esc(describeCard(card, hero))}`;
    return `<button${defendCooling ? ' class="is-cooling-down"' : ''} data-act="card" data-val="${i}" ${blocked ? 'disabled' : ''}>${i + 1}. ${esc(card.name)}<small>${detail}</small></button>`;
  }).join('');
  if (multiplayerMatchActive) {
    setPanel(`<div class="battle-bar-head">
        <span class="log">${esc(battle.log)}</span>
        <span class="intent">VS ${esc(mpState.opponentName)} · Round ${mpState.round + 1}</span>
        <span class="dim">Room: ${esc(mpState.roomCode)} · Equal Stats</span>
        <button type="button" class="mp-inline-forfeit" data-act="mp-forfeit">Forfeit</button>
      </div>
      <div class="actions">${cards}</div>`);
    return;
  }
  setPanel(`<div class="battle-bar-head">
      <span class="log">${esc(battle.log)}</span>
      <span class="intent">${isHeavy() ? 'Next: HEAVY attack!' : 'Next: Normal attack'}</span>
      <span class="dim">Deck: ${runDeck.length} (${battle.drawPile.length} left)</span>
    </div>
    <div class="actions">${cards}</div>`);
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
  fillHand();
  Object.assign(battle, {
    enemy, phase: 'intro', card: null, question: null, block: 0, popups: [], tempDefense: 0,
    defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
    heroHealFlashT: 0, heroHealTintT: 0,
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    pendingAttack: false,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
    deathTimer: 0, enemyAttackedThisTurn: false,
    flash: { hero: 0, enemy: 0 }, fromReview: false, newUnlocks: [],
    log: enemy.isBoss ? `${enemy.name} blocks the way!` : `A wild ${enemy.name} appeared!`,
  });
  Sound.play(enemy.isBoss ? 'bossIntro' : 'encounter');
  Sound.music(enemy.isBoss ? 'boss' : 'battle');
  beginIntro();
}

function chooseCard(index) {
  if (battle.phase !== 'choose') return;
  const id = battle.hand[index];
  const card = id && CARD_LIBRARY[id];
  if (!card) return;
  if (id === 'defend' && battle.defendCooldownTurns > 0) return;
  const cost = cardCost(card, hero);
  if (hero.mana < cost) return;
  if (id === 'defend') {
    battle.defendCooldownTurns = DEFEND_COOLDOWN_TURNS;
    battle.defendUsedThisTurn = true;
  }
  mpState.pendingCardCost = cost;
  hero.mana -= cost;
  if (multiplayerMatchActive) {
    battle.hand = [...STARTING_DECK];
  } else {
    battle.hand.splice(index, 1);
    battle.discard.push(id);
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
  if (multiplayerMatchActive) {
    battle.question = mpGetQuestionForRound(mpState.round);
    battle.fromReview = false;
    mpState.questionStartedAt = performance.now();
  } else {
    battle.question = adaptive.nextQuestion();
    battle.fromReview = adaptive.fromReview;
  }
  battle.phase = 'question';
  renderQuestion();
}

function answerQuestion(index) {
  if (battle.phase !== 'question') return;
  const q = battle.question;
  const correct = index === q.answer;
  stats.total++;
  if (correct) stats.correct++;
  recordTopicAnswer(q, correct);
  if (multiplayerMatchActive) {
    stats.streak = correct ? stats.streak + 1 : 0;
    Sound.play(correct ? 'correct' : 'wrong');
    mpSubmitLocalMove(correct);
    return;
  }
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
    }
    // Performance-based recovery: a correct answer heals HP and restores mana, scaled by streak.
    const heal = 4 + 2 * Math.min(stats.streak, 5) + hero.bonusHeal;
    const previousHp = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    hero.mana = Math.min(hero.maxMana, hero.mana + 5 + hero.bonusMana);
    showHealFeedback(hero.hp - previousHp, { offsetX: 58, y: HERO_SPOT.y - 78 });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 14, 2.5);
    notes.push(`Focus restores ${heal} HP and 5 mana (streak ${stats.streak}).`);
  } else {
    notes.push('Saved for review.');
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
    const dmg = Math.round(hero.attack * card.power * (card.correctMult || 1));
    const note = card.id === 'strike' ? '' : `${card.name}! `;
    if (card.manaOnCorrect) hero.mana = Math.min(hero.maxMana, hero.mana + card.manaOnCorrect);
    battle.pendingAttack = true;
    const chargedAttack = battle.chargeCard;
    battle.lungeT = chargedAttack ? 0 : 1;
    battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
    battle.projectileCharged = chargedAttack;
    battle.projectileQueued = chargedAttack;
    battle.projectileT = chargedAttack ? -1 : 0;
    battle.projectileDamage = dmg;
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
    hero.mana = Math.min(hero.maxMana, hero.mana + gain);
    popup('hero', `+${gain} MP`, '#8fd0dc');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#8fd0dc', 14, 2);
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
    hero.mana = Math.min(hero.maxMana, hero.mana + gain);
    popup('hero', `+${gain} MP`, '#8fd0dc');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#8fd0dc', 12, 2);
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

function performEnemyAttack({ fromWrongAnswer = false } = {}) {
  // Enemy turn: every third turn (every second for bosses) is a telegraphed heavy attack.
  const heavy = isHeavy();
  const foe = battle.enemy;
  let dmg = fromWrongAnswer
    ? Math.max(24, Math.round(foe.attack * (heavy ? 2.2 : 1.8) - hero.defense - battle.tempDefense))
    : Math.max(1, Math.round(foe.attack * (heavy ? 1.7 : 1) - hero.defense - battle.tempDefense));
  dmg = Math.max(1, Math.round(dmg * (1 - battle.block)));
  if (battle.heroHitT > 0) dmg = 0;
  battle.enemyLungeT = 1;
  battle.enemyLungeDistance = foe.isBoss ? 260 : heavy ? 235 : 185;
  if (foe.isBoss) battle.bossAttackT = BOSS_ATTACK_FRAMES * BOSS_ATTACK_BUFFER;
  hero.hp = Math.max(0, hero.hp - dmg);
  if (dmg > 0) {
    battle.flash.hero = 12;
    battle.heroHitT = HERO_HIT_IFRAME_TICKS;
    battle.heroHitTintT = HERO_HIT_TINT_TICKS;
    battle.heroKnockbackT = 0;
    popup('hero', `-${dmg}`, '#e8706a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#e8706a', 14, 3.5);
  } else {
    popup('hero', 'DODGE', '#f2bb61');
  }
  Sound.play(heavy ? 'heavy' : 'enemy');
  battle.log = dmg > 0
    ? `${fromWrongAnswer ? 'Breach counter! ' : heavy ? 'Heavy charge! ' : ''}${foe.name} hits you for ${dmg}.`
    : `${foe.name} misses while your invincibility is active.`;
  battle.block = 0;
  foe.turns++;

  if (hero.hp <= 0) {
    startHeroDeathSequence();
  }
}

function continueBattle() {
  if (battle.phase !== 'feedback' || battle.pendingAttack) return;
  if (multiplayerMatchActive) {
    if (mpState.outcome || hero.hp <= 0 || battle.enemy.hp <= 0) {
      mpTriggerFinishSequence();
      return;
    }
    mpState.round++;
    if (battle.defendUsedThisTurn) {
      battle.defendUsedThisTurn = false;
    } else if (battle.defendCooldownTurns > 0) {
      battle.defendCooldownTurns--;
    }
    battle.hand = [...STARTING_DECK];
    battle.phase = 'choose';
    battle.log = `Round ${mpState.round + 1} — Choose your move!`;
    renderBattle();
    return;
  }
  if (battle.enemy.hp <= 0) return winBattle();

  if (!battle.enemyAttackedThisTurn) {
    performEnemyAttack({ fromWrongAnswer: false });
    if (hero.hp <= 0 || battle.phase === 'dying') return;
  }
  battle.enemyAttackedThisTurn = false;
  if (battle.defendUsedThisTurn) {
    battle.defendUsedThisTurn = false;
  } else if (battle.defendCooldownTurns > 0) {
    battle.defendCooldownTurns--;
  }
  battle.phase = 'choose';
  renderBattle();
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
  renderWin();
}

function afterWin() {
  if (battle.phase !== 'won') return;
  renderCardReward();
}

function pickReward(index) {
  const id = battle.rewards[index];
  if (battle.phase !== 'reward' || !id) return;
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
    heroHealFlashT: 0, heroHealTintT: 0,
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    pendingAttack: false,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
    deathTimer: 0, enemyAttackedThisTurn: false,
    flash: { hero: 0, enemy: 0 }, fromReview: false, newUnlocks: [],
    log: `1v1 Duel vs ${foe.name} — Equal stats & synced questions!`,
  });

  if (typeof playViewActive !== 'undefined' && !playViewActive && typeof showPlayView === 'function') {
    showPlayView();
  }
  Sound.play('encounter');
  Sound.music('battle');
  beginIntro();
}

function renderMultiplayerWaiting() {
  battle.phase = 'mp_waiting';
  const cardName = (CARD_LIBRARY[battle.card] && CARD_LIBRARY[battle.card].name) || 'Move';
  setPanel(`<div class="battle-feedback-row">
    <div class="battle-feedback-copy">
      <p><strong class="ok">Round ${mpState.round + 1} locked in: ${esc(cardName)}.</strong></p>
      <p class="log">Waiting for ${esc(mpState.opponentName)} to finish Round ${mpState.round + 1}...</p>
    </div>
    <button type="button" class="mp-inline-forfeit" data-act="mp-forfeit">Forfeit Match</button>
  </div>`);
}

function mpSubmitLocalMove(correct) {
  const round = mpState.round;
  const role = mpState.role === 'guest' ? 'guest' : 'host';
  const movePayload = {
    matchId: mpState.matchId,
    round,
    role,
    clientId: mpState.selfClientId,
    cardId: battle.card,
    cardCost: mpState.pendingCardCost || 0,
    correct: Boolean(correct),
    elapsedMs: Math.max(0, Math.round(performance.now() - (mpState.questionStartedAt || performance.now()))),
  };

  if (!mpState.movesByRound[round]) mpState.movesByRound[round] = {};
  mpState.movesByRound[round][role] = movePayload;

  if (window.mpUI?.matchmaking) {
    window.mpUI.matchmaking.sendMatchMove(movePayload);
  }

  const pair = mpState.movesByRound[round];
  if (pair.host && pair.guest) {
    mpResolveRound(round);
  } else {
    renderMultiplayerWaiting();
  }
}

function mpReceiveRemoteMove(payload) {
  if (!multiplayerMatchActive || !payload) return;
  if (payload.matchId && mpState.matchId && payload.matchId !== mpState.matchId) return;
  if (payload.clientId && mpState.selfClientId && payload.clientId === mpState.selfClientId) return;

  const moveRole = payload.role === 'host' || payload.role === 'guest'
    ? payload.role
    : (mpState.role === 'host' ? 'guest' : 'host');
  if (moveRole === mpState.role) return;

  const round = Number(payload.round);
  if (!Number.isFinite(round)) return;

  if (!mpState.movesByRound[round]) mpState.movesByRound[round] = {};
  mpState.movesByRound[round][moveRole] = payload;

  const pair = mpState.movesByRound[round];
  if (round === mpState.round && pair.host && pair.guest) {
    mpResolveRound(round);
  }
}

function mpResolveRound(round) {
  if (!multiplayerMatchActive || mpState.resolvedRounds.has(round)) return;
  const pair = mpState.movesByRound[round];
  if (!pair || !pair.host || !pair.guest) return;
  mpState.resolvedRounds.add(round);

  const fighters = mpState.fighters;
  const roles = ['host', 'guest'];
  const summary = { host: { heal: 0, dmgTaken: 0, dmgDealt: 0, glitch: 0 }, guest: { heal: 0, dmgTaken: 0, dmgDealt: 0, glitch: 0 } };

  // Phase A: Deterministic mana spend, block stance, streak, and heals
  for (const r of roles) {
    const f = fighters[r];
    const mv = pair[r];
    const card = CARD_LIBRARY[mv.cardId] || CARD_LIBRARY.strike;
    f.mana = Math.max(0, f.mana - (Number(mv.cardCost) || 0));
    f.block = 0;

    let focusHeal = 0;
    let manaGain = 0;
    let cardHeal = 0;
    if (mv.correct) {
      f.streak++;
      f.correct++;
      focusHeal = 4 + 2 * Math.min(f.streak, 5);
      manaGain = 5 + (card.manaOnCorrect || 0) + (card.kind === 'charge' ? 25 : 0);
      cardHeal = card.kind === 'heal' ? card.heal : 0;
      f.block = card.kind === 'defend' ? 0.75 : 0;
    } else {
      f.streak = 0;
      manaGain = card.kind === 'charge' ? 10 : 0;
      cardHeal = card.kind === 'heal' ? 2 : 0;
      f.block = card.kind === 'defend' ? 0.25 : 0;
    }

    f.mana = Math.min(f.maxMana, f.mana + manaGain);
    const hpBefore = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + focusHeal + cardHeal);
    summary[r].heal = f.hp - hpBefore;
  }

  // Phase B: Simultaneous attack resolution and wrong-answer glitch recoil
  const combatPairs = [['host', 'guest'], ['guest', 'host']];
  const rawAttacks = {};
  for (const [atkRole, defRole] of combatPairs) {
    const atk = fighters[atkRole];
    const def = fighters[defRole];
    const mv = pair[atkRole];
    const card = CARD_LIBRARY[mv.cardId] || CARD_LIBRARY.strike;
    let dmg = 0;
    if (card.kind === 'hit' && mv.correct) {
      const raw = Math.round(atk.attack * card.power * (card.correctMult || 1));
      const afterDef = Math.max(1, raw - def.defense);
      dmg = Math.max(1, Math.round(afterDef * (1 - def.block)));
    }
    rawAttacks[atkRole] = dmg;
  }

  for (const [atkRole, defRole] of combatPairs) {
    const def = fighters[defRole];
    const defMove = pair[defRole];
    const incoming = rawAttacks[atkRole];
    const glitch = defMove.correct ? 0 : 5;
    const totalDmg = incoming + glitch;
    def.hp = Math.max(0, def.hp - totalDmg);
    fighters[atkRole].damageDealt += incoming;
    summary[atkRole].dmgDealt = incoming;
    summary[defRole].dmgTaken = incoming;
    summary[defRole].glitch = glitch;
  }

  // Copy synchronized fighter states into local hero & opponent HUD objects
  const selfRole = mpState.role === 'guest' ? 'guest' : 'host';
  const oppRole = selfRole === 'host' ? 'guest' : 'host';
  const selfFighter = fighters[selfRole];
  const oppFighter = fighters[oppRole];
  const selfMove = pair[selfRole];
  const oppMove = pair[oppRole];
  const selfSummary = summary[selfRole];
  const oppSummary = summary[oppRole];

  hero.hp = selfFighter.hp;
  hero.mana = selfFighter.mana;
  battle.enemy.hp = oppFighter.hp;
  battle.enemy.mana = oppFighter.mana;
  battle.enemy.turns++;
  if (battle.enemy.hp <= 0) battle.enemy.alive = false;

  // Play synchronous canvas FX without double-applying HP changes
  if (selfSummary.heal > 0) {
    showHealFeedback(selfSummary.heal, { offsetX: 58, y: HERO_SPOT.y - 78 });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 14, 2.5);
  }
  if (selfSummary.dmgDealt > 0) {
    battle.pendingAttack = true;
    battle.lungeT = selfMove.cardId === 'power' ? 0 : 1;
    battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
    battle.projectileCharged = selfMove.cardId === 'power';
    battle.projectileQueued = selfMove.cardId === 'power';
    battle.projectileT = selfMove.cardId === 'power' ? -1 : 0;
    battle.projectileDamage = 0; // Damage already applied deterministically above
    popup('enemy', `-${selfSummary.dmgDealt}`, '#e8706a');
  } else {
    battle.chargeCard = false;
    battle.chargeMaxT = 0;
    battle.projectileQueued = false;
    battle.pendingAttack = false;
    if (oppSummary.glitch > 0) popup('enemy', `-${oppSummary.glitch} GLITCH`, '#f2bb61');
  }

  if (oppMove.cardId === 'defend') {
    if (selfMove.cardId === 'defend' && selfMove.correct) battle.defendEffectT = DEFEND_EFFECT_FRAMES;
  }
  if (selfMove.cardId === 'defend') {
    battle.defendEffectT = selfMove.correct ? DEFEND_EFFECT_FRAMES : 0;
    Sound.play('block');
  }

  const totalSelfHit = selfSummary.dmgTaken + selfSummary.glitch;
  if (totalSelfHit > 0) {
    if (selfSummary.dmgTaken > 0) {
      battle.enemyLungeT = 1;
      battle.enemyLungeDistance = 195;
      Sound.play('enemy');
    }
    battle.flash.hero = 12;
    battle.heroHitTintT = HERO_HIT_TINT_TICKS;
    battle.heroKnockbackT = 0;
    popup('hero', `-${totalSelfHit}`, '#e8706a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#e8706a', 14, 3.2);
  }

  // Check end-of-match condition
  if (hero.hp <= 0 && battle.enemy.hp <= 0) {
    mpState.outcome = 'draw';
    mpState.endReason = 'Double KO! Both challengers fell in the same round.';
  } else if (battle.enemy.hp <= 0) {
    mpState.outcome = 'won';
    mpState.endReason = `You defeated ${mpState.opponentName} in ${round + 1} round${round === 0 ? '' : 's'}!`;
  } else if (hero.hp <= 0) {
    mpState.outcome = 'lost';
    mpState.endReason = `${mpState.opponentName} claimed victory in Round ${round + 1}.`;
  }

  const selfCardName = CARD_LIBRARY[selfMove.cardId]?.name || 'Move';
  const oppCardName = CARD_LIBRARY[oppMove.cardId]?.name || 'Move';
  const notes = [
    `You (${selfCardName}): ${selfMove.correct ? `Correct!${selfSummary.dmgDealt > 0 ? ` Dealt ${selfSummary.dmgDealt} DMG.` : ''}` : `Missed${selfSummary.glitch > 0 ? ` (-${selfSummary.glitch} glitch)` : ''}.`}`,
    `${mpState.opponentName} (${oppCardName}): ${oppMove.correct ? `Correct!${selfSummary.dmgTaken > 0 ? ` Hit you for ${selfSummary.dmgTaken} DMG.` : ''}` : `Missed${oppSummary.glitch > 0 ? ` (-${oppSummary.glitch} glitch)` : ''}.`}`,
  ];
  battle.log = notes.join(' ');
  battle.phase = 'feedback';

  const q = battle.question || mpGetQuestionForRound(round);
  if (mpState.outcome) {
    renderHud();
    if (!battle.pendingAttack) {
      mpTriggerFinishSequence();
      return;
    }
    setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><strong class="${selfMove.correct ? 'ok' : 'bad'}">${selfMove.correct ? 'Correct!' : 'Not quite.'}</strong> <b>Answer: ${esc(q.choices[q.answer])}.</b></p>
        <p class="log">${esc(notes.join(' '))}</p>
      </div>
      <button type="button" disabled>Final Blow...</button>
    </div>`);
    return;
  }

  renderFeedback(Boolean(selfMove.correct), notes);
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

  go.innerHTML = `<div class="game-over-box">
    <div class="game-over-corruption">${banner}</div>
    <div class="game-over-skull" aria-hidden="true">${won ? '♛' : (draw ? '⚔' : '☠')}</div>
    <h2 class="game-over-title" id="gameOverTitle" data-text="${title}">${title}</h2>
    <p class="game-over-killer">${esc(mpState.endReason || `Match vs ${mpState.opponentName} completed.`)}</p>
    <div class="game-over-stats">
      <div class="game-over-stat"><span>ROUNDS</span><strong>${mpState.round + 1}</strong></div>
      <div class="game-over-stat"><span>YOUR HP</span><strong>${hero.hp}/${hero.maxHp}</strong></div>
      <div class="game-over-stat"><span>FOE HP</span><strong>${oppHp}/100</strong></div>
    </div>
    <p class="game-over-note">Room ${esc(mpState.roomCode)} · ${esc(mpState.arenaName)} · Accuracy ${accuracy()}</p>
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
  const actions = {
    card: () => chooseCard(Number(val)),
    answer: () => answerQuestion(Number(val)),
    continue: () => continueBattle(),
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
    else if (act === 'hub') {
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
