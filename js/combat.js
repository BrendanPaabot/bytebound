// ===== Question selection: topic-aware adaptive difficulty, capability analytics, spaced review =====
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const REVIEW_CHANCE = 0.3;   // chance that a standard battle question is a due review question
const BOSS_REVIEW_CHANCE = 0.5; // higher chance during boss fights
const REVIEW_DELAY = 3;      // answers to wait before a missed question can come back
const REVIEW_LIMIT = 25;     // most questions kept in the review queue
const BASELINE_ATTEMPTS = 3; // first N attempts per topic form the diagnostic baseline
const REVIEW_STORAGE_KEY = 'kings-pigs-review-v1';
const ACADEMIC_YEAR_STORAGE_KEY = 'bytebound-academic-year-v1';
const ACADEMIC_YEARS = [1, 2, 3, 4];
const ACADEMIC_YEAR_META = {
  1: {
    year: 1,
    label: '1st Year',
    shortLabel: '1st Yr',
    rangeLabel: '1st Year only',
    summary: 'Foundations: Computing basics, Intro Programming, OOP, Logic & Sets, DB intro, and HTML/CSS/JS (Software Eng unlocks in 2nd Year).',
  },
  2: {
    year: 2,
    label: '2nd Year',
    shortLabel: '2nd Yr',
    rangeLabel: 'Years 1–2',
    summary: 'Adds Data Structures, Architecture, Networking, SQL, Proofs/Trees, Web APIs, and unlocks Software Engineering (SDLC, UML, Testing).',
  },
  3: {
    year: 3,
    label: '3rd Year',
    shortLabel: '3rd Yr',
    rangeLabel: 'Years 1–3',
    summary: 'Adds OS, Security, Cryptography, Transactions, HCI & Usability Principles, Software Architecture, and Mobile State patterns.',
  },
  4: {
    year: 4,
    label: '4th Year',
    shortLabel: '4th Yr',
    rangeLabel: 'All Years (1–4)',
    summary: 'Full 7-discipline curriculum including enterprise security, distributed databases, multicore coherence, and advanced topics.',
  },
};

let activeAcademicYear = 4;
let activeAcademicYearStorageKey = ACADEMIC_YEAR_STORAGE_KEY;

function normalizeAcademicYear(value, fallback = 4) {
  const num = Number(value);
  if (Number.isInteger(num) && num >= 1 && num <= 4) return num;
  return fallback;
}

function getQuestionYear(question) {
  if (!question || typeof question !== 'object') return null;
  return Number.isInteger(question.year) && question.year >= 1 && question.year <= 4 ? question.year : null;
}

function getActiveAcademicYear() {
  return normalizeAcademicYear(activeAcademicYear, 4);
}

function getAcademicYearMeta(year = getActiveAcademicYear()) {
  return ACADEMIC_YEAR_META[normalizeAcademicYear(year, 4)] || ACADEMIC_YEAR_META[4];
}

function getAcademicYearLabel(year = getActiveAcademicYear()) {
  return getAcademicYearMeta(year).label;
}

function getAcademicYearRangeLabel(year = getActiveAcademicYear()) {
  return getAcademicYearMeta(year).rangeLabel;
}

// Strict eligibility check: unclassified questions (missing/invalid year) are ALWAYS excluded.
function isQuestionEligibleForYear(question, maxYear = getActiveAcademicYear()) {
  const qYear = getQuestionYear(question);
  if (qYear === null) return false;
  return qYear <= normalizeAcademicYear(maxYear, 4);
}

function getEligibleQuestionsForDifficulty(difficulty, maxYear = getActiveAcademicYear()) {
  const list = (typeof QUESTION_BANK !== 'undefined' && Array.isArray(QUESTION_BANK[difficulty]))
    ? QUESTION_BANK[difficulty]
    : [];
  const cap = normalizeAcademicYear(maxYear, 4);
  return list.filter((q) => isQuestionEligibleForYear(q, cap));
}

function getAllEligibleQuestions(maxYear = getActiveAcademicYear()) {
  const cap = normalizeAcademicYear(maxYear, 4);
  return DIFFICULTIES.flatMap((diff) => getEligibleQuestionsForDifficulty(diff, cap));
}

function getTopicMinYear(category, topic) {
  let minY = null;
  for (const diff of DIFFICULTIES) {
    const list = (typeof QUESTION_BANK !== 'undefined' && Array.isArray(QUESTION_BANK[diff])) ? QUESTION_BANK[diff] : [];
    for (const q of list) {
      if (q.category !== category || q.topic !== topic) continue;
      const y = getQuestionYear(q);
      if (y !== null && (minY === null || y < minY)) minY = y;
    }
  }
  return minY;
}

function getEligibleTopicCount(category, topic, maxYear = getActiveAcademicYear()) {
  const cap = normalizeAcademicYear(maxYear, 4);
  let count = 0;
  for (const diff of DIFFICULTIES) {
    const list = (typeof QUESTION_BANK !== 'undefined' && Array.isArray(QUESTION_BANK[diff])) ? QUESTION_BANK[diff] : [];
    for (const q of list) {
      if (q.category === category && q.topic === topic && isQuestionEligibleForYear(q, cap)) count++;
    }
  }
  return count;
}

function readSavedAcademicYear(profileId) {
  const key = profileId ? `${ACADEMIC_YEAR_STORAGE_KEY}:${encodeURIComponent(String(profileId).trim().toLowerCase())}` : ACADEMIC_YEAR_STORAGE_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : null;
  } catch {
    return null;
  }
}

function selectAcademicYearProfile(profileId) {
  const norm = String(profileId || '').trim().toLowerCase();
  activeAcademicYearStorageKey = norm ? `${ACADEMIC_YEAR_STORAGE_KEY}:${encodeURIComponent(norm)}` : ACADEMIC_YEAR_STORAGE_KEY;
  const saved = readSavedAcademicYear(norm);
  activeAcademicYear = saved !== null ? saved : 4;
  return activeAcademicYear;
}

function setActiveAcademicYear(year, { profileId = null, persist = true, syncCloud = true } = {}) {
  const nextYear = normalizeAcademicYear(year, 4);
  activeAcademicYear = nextYear;
  const targetKey = profileId
    ? `${ACADEMIC_YEAR_STORAGE_KEY}:${encodeURIComponent(String(profileId).trim().toLowerCase())}`
    : activeAcademicYearStorageKey;
  if (persist) {
    try {
      localStorage.setItem(targetKey, String(nextYear));
    } catch (error) {
      console.error('Unable to save academic year preference.', error);
    }
    if (syncCloud && typeof scheduleUserProfileSync === 'function') {
      scheduleUserProfileSync();
    }
  }
  if (typeof window !== 'undefined' && window.mpUI && !window.mpUI.snapshot?.currentRoom) {
    window.mpUI.selectedYearLevel = nextYear;
  }
  return nextYear;
}

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
  return { state, label: 'NOT STARTED', tone: 'unexplored' };
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

function dueReviewQuestion(maxYear = getActiveAcademicYear()) {
  const cap = normalizeAcademicYear(maxYear, 4);
  for (const item of reviewQueue) {
    if (item.due > answerCount) continue;
    const match = questionByText(item.text);
    if (match && isQuestionEligibleForYear(match, cap)) return match;
  }
  return null;
}

function getEligibleReviewQuestions(maxYear = getActiveAcademicYear()) {
  const cap = normalizeAcademicYear(maxYear, 4);
  const seen = new Set();
  const out = [];
  for (const item of reviewQueue) {
    if (!item || typeof item.text !== 'string' || seen.has(item.text)) continue;
    const match = questionByText(item.text);
    if (match && isQuestionEligibleForYear(match, cap)) {
      seen.add(item.text);
      out.push(match);
    }
  }
  return out;
}

const QUESTION_DIFFICULTY_SCALE = {
  easy: { mult: 1.0, bonusMp: 5, bonusHp: 0, label: 'STANDARD', counterMult: 1.0 },
  medium: { mult: 1.18, bonusMp: 8, bonusHp: 2, label: '+18% MED BONUS', counterMult: 0.95 },
  hard: { mult: 1.38, bonusMp: 12, bonusHp: 4, label: '+38% HARD MASTERY', counterMult: 0.88 },
};

function getQuestionDifficultyScale(diff) {
  const key = String(diff || '').toLowerCase();
  return QUESTION_DIFFICULTY_SCALE[key] || QUESTION_DIFFICULTY_SCALE.easy;
}

class AdaptiveDifficulty {
  constructor() {
    this.focusCategory = null;
    this.reset();
  }

  reset() {
    this.level = 0;
    this.mediumStreak = 0;
    this.missStreak = 0;
    this.correctStreak = 0;
    this.consecutiveMisses = 0;
    this.recentResults = [];
    this.used = { easy: [], medium: [], hard: [] };
    this.fromReview = false;
    this.categoryState = Object.fromEntries(
      DISCIPLINE_CATEGORIES.map((cat) => [cat, { level: 0, mediumStreak: 0, missStreak: 0, correctStreak: 0 }]),
    );
    this.lastSelection = {
      mode: 'adaptive',
      badge: 'ADAPTIVE PROBE',
      category: DISCIPLINE_CATEGORIES[0] || 'Computer Systems',
      topic: null,
      difficulty: 'easy',
      difficultyScale: getQuestionDifficultyScale('easy'),
    };
    this.calibrateFromProgress();
  }

  get name() { return DIFFICULTIES[this.level] || 'easy'; }

  getRecentAccuracy() {
    if (!Array.isArray(this.recentResults) || !this.recentResults.length) return null;
    const hits = this.recentResults.filter(Boolean).length;
    return hits / this.recentResults.length;
  }

  getAdaptiveCombatProfile() {
    const count = Array.isArray(this.recentResults) ? this.recentResults.length : 0;
    const recentAcc = this.getRecentAccuracy();
    if ((this.consecutiveMisses || 0) >= 2 || (count >= 4 && recentAcc !== null && recentAcc < 0.5)) {
      return {
        mode: 'comeback',
        label: 'COMEBACK ASSIST',
        enemyHpMult: 1.0,
        enemyAtkMult: 1.0,
        enemyDmgMult: 0.8,
        recoveryMult: 1.25,
        questionShift: -1,
      };
    }
    if (count >= 6 && recentAcc !== null && recentAcc >= 0.8) {
      return {
        mode: 'mastery',
        label: 'ADAPTIVE MASTERY',
        enemyHpMult: 1.15,
        enemyAtkMult: 1.08,
        enemyDmgMult: 1.05,
        recoveryMult: 1.0,
        questionShift: 1,
      };
    }
    return {
      mode: 'balanced',
      label: '',
      enemyHpMult: 1.0,
      enemyAtkMult: 1.0,
      enemyDmgMult: 1.0,
      recoveryMult: 1.0,
      questionShift: 0,
    };
  }

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
      this.categoryState[category] = { level, mediumStreak: 0, missStreak: 0, correctStreak: 0 };
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

  // Finds the weakest eligible topic (or unexplored/diagnostic topic) for Boss Weakness Exams or Tracker insights.
  getWeakestTarget(preferredCategory = null, maxYear = getActiveAcademicYear()) {
    const cap = normalizeAcademicYear(maxYear, 4);
    const candidates = [];
    const categories = preferredCategory && DISCIPLINE_CATEGORIES.includes(preferredCategory)
      ? [preferredCategory]
      : DISCIPLINE_CATEGORIES;
    for (const category of categories) {
      for (const topic of CATEGORY_TOPICS[category] || []) {
        if (getEligibleTopicCount(category, topic, cap) <= 0) continue;
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

  nextQuestion(maxYear = getActiveAcademicYear(), context = {}) {
    const cap = normalizeAcademicYear(maxYear, 4);
    const ctxEnemy = context?.enemy || (typeof battle !== 'undefined' ? battle?.enemy : null);
    const isBossEncounter = Boolean(ctxEnemy?.isBoss);
    const roomNumber = Number(context?.roomNumber || (typeof level !== 'undefined' ? level : 1)) || 1;
    const cardId = context?.cardId || null;
    const profile = this.getAdaptiveCombatProfile();
    const due = dueReviewQuestion(cap);
    const reviewChance = isBossEncounter ? BOSS_REVIEW_CHANCE : REVIEW_CHANCE;
    if (due && (!this.focusCategory || due.category === this.focusCategory) && Math.random() < reviewChance) {
      this.fromReview = true;
      const diff = QUESTION_DIFFICULTY.get(due.q) || this.categoryDifficultyName(due.category);
      const scale = getQuestionDifficultyScale(diff);
      this.lastSelection = {
        mode: 'review',
        badge: isBossEncounter ? 'BOSS REVIEW CHECK' : 'SPACED REVIEW',
        category: due.category,
        topic: due.topic,
        difficulty: diff,
        difficultyScale: scale,
      };
      return { ...due, difficulty: diff };
    }
    this.fromReview = false;

    // 1. Choose target topic strictly from topics that have eligible questions for the player's year.
    let chosenTopicEntry = null;
    if (isBossEncounter) {
      chosenTopicEntry = this.getWeakestTarget(this.focusCategory, cap);
      if (!chosenTopicEntry && this.focusCategory) {
        chosenTopicEntry = this.getWeakestTarget(null, cap);
      }
    }
    if (!chosenTopicEntry) {
      const collectTopics = (cats) => {
        const entries = [];
        for (const category of cats) {
          for (const topic of CATEGORY_TOPICS[category] || []) {
            if (getEligibleTopicCount(category, topic, cap) <= 0) continue;
            entries.push({
              category,
              topic,
              state: getTopicMasteryState(getTopicStats(category, topic)),
              weight: getTopicNeedWeight(category, topic),
            });
          }
        }
        return entries;
      };
      let topicEntries = collectTopics(this.focusCategory ? [this.focusCategory] : DISCIPLINE_CATEGORIES);
      if (!topicEntries.length && this.focusCategory) {
        topicEntries = collectTopics(DISCIPLINE_CATEGORIES);
      }
      chosenTopicEntry = pickWeighted(topicEntries, (entry) => entry.weight);
    }

    const targetCategory = chosenTopicEntry?.category || this.focusCategory || DISCIPLINE_CATEGORIES[0];
    const targetTopic = chosenTopicEntry?.topic || null;
    const topicState = chosenTopicEntry?.state || 'unexplored';
    const card = cardId && typeof CARD_LIBRARY !== 'undefined' ? CARD_LIBRARY[cardId] : null;
    const isHighRiskCard = Boolean(card && (card.exclusiveActive || card.id === 'heavy' || card.id === 'overclock'));
    const isRecoveryCard = Boolean(card && (card.kind === 'charge' || card.kind === 'mana' || card.kind === 'heal' || card.id === 'quick'));
    const isElite = Boolean(ctxEnemy && !isBossEncounter && (ctxEnemy.brute || ctxEnemy.nyrmed || ctxEnemy.grenu));

    // 2. Scale question difficulty by discipline skill, room depth, enemy tier, card risk, and recent performance.
    let targetLevel = this.categoryLevel(targetCategory);
    if (roomNumber >= 12 && topicState === 'mastered') {
      targetLevel = Math.max(targetLevel, 2);
    } else if (roomNumber >= 6 && (topicState === 'practicing' || topicState === 'mastered')) {
      targetLevel = Math.max(targetLevel, 1);
    }
    if (isBossEncounter) {
      const recentAcc = this.getRecentAccuracy();
      if (ctxEnemy?.isFinal && (recentAcc === null ? this.categoryLevel(targetCategory) >= 1 : recentAcc >= 0.65)) {
        targetLevel = Math.max(targetLevel, 2);
      } else if (profile.mode !== 'comeback') {
        targetLevel = Math.max(targetLevel, 1);
      }
    } else if (isElite && typeof stats !== 'undefined' && (stats.streak || 0) >= 2 && topicState !== 'weak') {
      targetLevel = Math.max(targetLevel, 1);
    }
    if (topicState === 'weak' && targetLevel === 2) {
      targetLevel = 1; // Step down from Hard to Medium when remediating a weak topic
    } else if (topicState === 'mastered' && targetLevel === 0) {
      targetLevel = 1; // Nudge mastered topics up from Easy to Medium
    }
    if (isHighRiskCard && profile.mode !== 'comeback') {
      targetLevel = Math.min(2, targetLevel + 1);
    }
    if (isRecoveryCard && profile.mode === 'comeback') {
      targetLevel = Math.min(targetLevel, 1);
    }
    if (profile.questionShift < 0) {
      targetLevel = Math.max(0, targetLevel + profile.questionShift);
    } else if (profile.questionShift > 0 && topicState !== 'weak') {
      targetLevel = Math.min(2, targetLevel + profile.questionShift);
    }
    targetLevel = Math.max(0, Math.min(2, targetLevel));
    this.level = targetLevel;
    let key = DIFFICULTIES[targetLevel] || 'easy';

    // 3. Filter eligible pool by academic year BEFORE random/adaptive draw (never leak later-year or unclassified questions).
    const drawEligibleFor = (diffKey, cat, top) => {
      const eligible = getEligibleQuestionsForDifficulty(diffKey, cap).filter(
        (q) => (!cat || q.category === cat) && (!top || q.topic === top),
      );
      if (!eligible.length) return [];
      let unused = eligible.filter((q) => !this.used[diffKey].includes(q));
      if (!unused.length) {
        const eligibleSet = new Set(eligible);
        this.used[diffKey] = this.used[diffKey].filter((q) => !eligibleSet.has(q));
        unused = eligible;
      }
      return unused;
    };

    let pool = drawEligibleFor(key, targetCategory, targetTopic);
    if (!pool.length && targetTopic) {
      // If the chosen difficulty has no eligible questions for this topic at this year, stay in the same topic across other difficulties.
      const altOrder = DIFFICULTIES.filter((d) => d !== key);
      for (const altKey of altOrder) {
        const altPool = drawEligibleFor(altKey, targetCategory, targetTopic);
        if (altPool.length) {
          key = altKey;
          pool = altPool;
          break;
        }
      }
    }
    if (!pool.length) {
      pool = drawEligibleFor(key, targetCategory, null);
    }
    if (!pool.length) {
      pool = drawEligibleFor(key, null, null);
    }
    if (!pool.length) {
      for (const altKey of DIFFICULTIES) {
        const altPool = drawEligibleFor(altKey, null, null);
        if (altPool.length) {
          key = altKey;
          pool = altPool;
          break;
        }
      }
    }
    if (!pool.length) {
      return null;
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
    } else if (profile.mode === 'comeback') {
      badge = 'COMEBACK ASSIST';
      mode = 'comeback';
    } else if (isHighRiskCard) {
      badge = 'HIGH-POWER CHALLENGE';
      mode = 'high-power';
    } else if (topicState === 'weak') {
      badge = 'WEAK TOPIC FOCUS';
      mode = 'weak-focus';
    } else if (topicState === 'unexplored' || topicState === 'diagnostic') {
      badge = 'DIAGNOSTIC PROBE';
      mode = 'diagnostic';
    } else if (profile.mode === 'mastery') {
      badge = 'MASTERY SURGE';
      mode = 'mastery';
    } else if (topicState === 'mastered') {
      badge = 'MASTERY CHALLENGE';
      mode = 'mastery';
    }

    const scale = getQuestionDifficultyScale(key);
    this.lastSelection = {
      mode,
      badge,
      category: q.category,
      topic: q.topic,
      difficulty: key,
      difficultyScale: scale,
    };
    return { ...q, difficulty: key };
  }

  // Smooth adaptive progression: avoids harsh single-miss yo-yo drops while rewarding steady accuracy.
  record(correct, question = typeof battle !== 'undefined' ? battle?.question : null) {
    const category = question?.category;
    this.recentResults = Array.isArray(this.recentResults) ? this.recentResults : [];
    this.recentResults.push(Boolean(correct));
    while (this.recentResults.length > 8) this.recentResults.shift();
    this.consecutiveMisses = correct ? 0 : (this.consecutiveMisses || 0) + 1;
    const recentAcc = this.getRecentAccuracy();

    if (category && this.categoryState?.[category]) {
      const catState = this.categoryState[category];
      if (!correct) {
        catState.mediumStreak = 0;
        catState.correctStreak = 0;
        catState.missStreak = (catState.missStreak || 0) + 1;
        if (catState.level === 2) {
          catState.level = 1;
        } else if (catState.level === 1 && (catState.missStreak >= 2 || this.consecutiveMisses >= 2)) {
          catState.level = 0;
        }
      } else {
        catState.missStreak = 0;
        catState.correctStreak = (catState.correctStreak || 0) + 1;
        if (catState.level === 0) {
          if (catState.correctStreak >= 2 || (this.recentResults.length >= 3 && recentAcc !== null && recentAcc >= 0.7)) {
            catState.level = 1;
            catState.correctStreak = 0;
          }
        } else if (catState.level === 1 && ++catState.mediumStreak >= 2) {
          catState.level = 2;
          catState.mediumStreak = 0;
        }
      }
      this.level = catState.level;
    } else if (!correct) {
      this.mediumStreak = 0;
      this.correctStreak = 0;
      this.missStreak = (this.missStreak || 0) + 1;
      if (this.level === 2) {
        this.level = 1;
      } else if (this.level === 1 && (this.missStreak >= 2 || this.consecutiveMisses >= 2)) {
        this.level = 0;
      }
    } else {
      this.missStreak = 0;
      this.correctStreak = (this.correctStreak || 0) + 1;
      if (this.level === 0) {
        if (this.correctStreak >= 2 || (this.recentResults.length >= 3 && recentAcc !== null && recentAcc >= 0.7)) {
          this.level = 1;
          this.correctStreak = 0;
        }
      } else if (this.level === 1 && ++this.mediumStreak >= 2) {
        this.level = 2;
        this.mediumStreak = 0;
      }
    }
  }
}

const SKILL_POINT_INTERVAL = 5;
const MAX_SHIELD_CHARGES = 5;
function getSpFromCorrectCount(correctCount) {
  const c = Math.max(0, Math.floor(Number(correctCount) || 0));
  if (c <= 25) return Math.floor(c / 5);
  if (c <= 65) return 5 + Math.floor((c - 25) / 8);
  return 10 + Math.floor((c - 65) / 10);
}
function getNextSpThresholdInfo(correctCount) {
  const c = Math.max(0, Math.floor(Number(correctCount) || 0));
  const earned = getSpFromCorrectCount(c);
  if (c < 25) {
    const progressInStep = c % 5;
    return { earned, nextInterval: 5, progressInStep, remaining: 5 - progressInStep };
  }
  if (c < 65) {
    const progressInStep = (c - 25) % 8;
    return { earned, nextInterval: 8, progressInStep, remaining: 8 - progressInStep };
  }
  const progressInStep = (c - 65) % 10;
  return { earned, nextInterval: 10, progressInStep, remaining: 10 - progressInStep };
}
function getSkillUpgradeCost(currentRank) {
  return Math.max(1, (Number(currentRank) || 0) + 1);
}
function getSkillRankSpentSp(rank) {
  const r = Math.max(0, Math.floor(Number(rank) || 0));
  return (r * (r + 1)) / 2;
}
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
      { id: 'kernelAegis', name: 'Kernel Aegis', description: 'Passive: Start each battle with 1/2/3 Hit-Shield charges (any attack drops shield by 1 regardless of damage). Active (10 MP, 3–5 streak): Refills Aegis Shield to 3/4/5 hits, full heal, 40–60 MP & ATK/DEF surge.', effect: 'Passive: 1–3 Battle Shield · Active: 3–5 Shield + Heal + Surge', bonus: {}, isExclusiveActive: true, activeCardId: 'kernel_aegis', maxRank: 3, requires: ['operatingSystem'] },
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
      { id: 'packetLockdown', name: 'Packet Lockdown', description: 'Costs 10 MP & charges via 3–5 consecutive correct answers (up to 1.5x); stuns foes for 8–12+ turns, deals breach damage, makes them take 50% more hit damage, and restores MP.', effect: 'Active Skill: Stun + Breach DMG + 1.5x Vulnerable (3–5 Streak Charge)', bonus: {}, isExclusiveActive: true, activeCardId: 'packet_lockdown', maxRank: 3, requires: ['threatAnalysis'] },
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
      { id: 'overburnExecution', name: 'Overburn Execution', description: 'Costs 15 MP & charges via 3–5 consecutive correct answers (up to 1.5x); deals massive damage (1.5× Execute below 40% HP), doubles buffs, and inflicts Inferno Burn for 5 turns.', effect: 'Active Skill: Massive DMG (Execute) & Burn/t (3–5 Streak Charge)', bonus: {}, isExclusiveActive: true, activeCardId: 'plasma_compile', maxRank: 3, requires: ['errorHandling'] },
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
  discreteMath: {
    name: 'Discrete Mathematics',
    color: 'indigo',
    exclusiveId: 'proofContradiction',
    skills: [
      { id: 'foundation', name: 'Boolean Axiom', description: 'Sharpen formal reasoning to strike with calculated precision.', effect: '+1 ATK per rank', bonus: { attack: 1 } },
      { id: 'truthForesight', name: 'Truth Table Foresight', description: 'Anticipate incoming outcomes to bolster defense and mana capacity.', effect: '+1 DEF and +4 max MP per rank', bonus: { defense: 1, maxMana: 4 }, requires: ['foundation'] },
      { id: 'proofContradiction', name: 'Proof by Contradiction', description: 'Costs 10 MP & charges via 3–5 consecutive correct answers (up to 1.5x); reflects the next enemy hit back at 1.5–2.25x damage, eliminates 2 wrong options on upcoming questions, and arms a 2x Logical Crit.', effect: 'Active Skill: Hit Reflect + 50/50 Proof Hints + 2x Crit (3–5 Streak Charge)', bonus: {}, isExclusiveActive: true, activeCardId: 'proof_contradiction', maxRank: 3, requires: ['truthForesight'] },
      { id: 'combinatorialEdge', name: 'Combinatorial Edge', description: 'Multiply valid combinations to recover mana on every correct answer.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['proofContradiction'] },
      { id: 'graphTraversal', name: 'Graph Traversal', description: 'Navigate shortest paths cleanly to restore more HP per answer.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['proofContradiction'] },
      { id: 'inductiveMomentum', name: 'Inductive Momentum', description: 'Build step-by-step certainty into balanced combat stats.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['combinatorialEdge'] },
      { id: 'qedMastery', name: 'Q.E.D. Mastery', description: 'Conclude every proof with overwhelming offensive force.', effect: '+2 ATK per rank', bonus: { attack: 2 }, requires: ['graphTraversal'] },
    ],
  },
  softwareEng: {
    name: 'Software Engineering',
    color: 'teal',
    exclusiveId: 'systemRefactor',
    skills: [
      { id: 'foundation', name: 'Clean Architecture', description: 'Structure modules cleanly to hold the line against viruses.', effect: '+1 DEF per rank', bonus: { defense: 1 } },
      { id: 'unitTesting', name: 'Unit Testing', description: 'Validate edge cases early to reinforce your maximum health reserve.', effect: '+5 max HP per rank', bonus: { maxHp: 5 }, requires: ['foundation'] },
      { id: 'systemRefactor', name: 'System Refactor', description: 'Costs 12 MP & charges via 3–5 consecutive correct answers (up to 1.5x); deals architecture damage, halves card MP costs for 2–4 turns, resets Defend cooldown, and grants Rollback Guard to catch mistakes without breaking streaks.', effect: 'Active Skill: 50% MP Cost + Defend Reset + Rollback Guard (3–5 Streak Charge)', bonus: {}, isExclusiveActive: true, activeCardId: 'system_refactor', maxRank: 3, requires: ['unitTesting'] },
      { id: 'agileSprint', name: 'Agile Sprint', description: 'Deliver iterative cadence to recover more mana per correct answer.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['systemRefactor'] },
      { id: 'usabilityPolish', name: 'Usability Polish', description: 'Apply HCI ergonomics and clarity to heal more on correct answers.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['systemRefactor'] },
      { id: 'designPatterns', name: 'Design Patterns', description: 'Reuse proven architectural templates for stronger combat output.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['agileSprint'] },
      { id: 'lifecycleMastery', name: 'Full-Lifecycle Mastery', description: 'Unify design, testing, and deployment into enduring vitality and power.', effect: '+1 ATK and +8 max HP per rank', bonus: { attack: 1, maxHp: 8 }, requires: ['usabilityPolish'] },
    ],
  },
  webMobile: {
    name: 'Web & Mobile Development',
    color: 'magenta',
    exclusiveId: 'asyncCascade',
    skills: [
      { id: 'foundation', name: 'Responsive Layout', description: 'Adapt smoothly across viewports to bolster maximum health.', effect: '+5 max HP per rank', bonus: { maxHp: 5 } },
      { id: 'restEndpoint', name: 'REST Endpoint', description: 'Route fast API payloads directly into stronger combat strikes.', effect: '+1 ATK per rank', bonus: { attack: 1 }, requires: ['foundation'] },
      { id: 'asyncCascade', name: 'Async Cascade', description: 'Costs 12 MP & charges via 3–5 consecutive correct answers (up to 1.5x); unleashes a 3-hit Async Burst, echoes your next correct card at +75% power, and Rate-Limits enemy damage by 40%.', effect: 'Active Skill: 3-Hit Burst + Next Card Echo (+75%) + Rate-Limit (3–5 Streak Charge)', bonus: {}, isExclusiveActive: true, activeCardId: 'async_cascade', maxRank: 3, requires: ['restEndpoint'] },
      { id: 'eventLoopFlow', name: 'Event Loop Flow', description: 'Handle non-blocking tasks smoothly to recover more mana per answer.', effect: '+2 MP per correct answer per rank', bonus: { bonusMana: 2 }, requires: ['asyncCascade'] },
      { id: 'progressiveCache', name: 'Progressive Cache', description: 'Serve resilient offline-first bursts to restore extra HP per answer.', effect: '+2 HP per correct answer per rank', bonus: { bonusHeal: 2 }, requires: ['asyncCascade'] },
      { id: 'crossPlatformSync', name: 'Cross-Platform Sync', description: 'Unify web and mobile runtimes for balanced offense and guard.', effect: '+1 ATK and +1 DEF per rank', bonus: { attack: 1, defense: 1 }, requires: ['eventLoopFlow'] },
      { id: 'hypertextOverdrive', name: 'Hypertext Overdrive', description: 'Push modern client pipelines for a major attack boost.', effect: '+2 ATK per rank', bonus: { attack: 2 }, requires: ['progressiveCache'] },
    ],
  },
};
const SKILL_TREE_KEYS = Object.keys(SKILL_TREES);
const SKILL_MAX_RANK = 3;
const SKILLS_TO_SPECIALIZE = (treeKey) => Math.ceil(SKILL_TREES[treeKey].skills.length / 2);
let wildcardSkillPoints = 0;

const OVERCLOCK_UPGRADES = [
  {
    id: 'overclockAtk',
    name: 'Overclock ATK',
    description: 'Overvolt strike pipelines to raise Attack and penetrate enemy Loop Armor.',
    effect: '+2 ATK & +2 Armor Pierce / rank',
    bonus: { attack: 2, armorPierce: 2 },
    maxRank: null,
    tone: 'atk',
  },
  {
    id: 'kernelVitality',
    name: 'Kernel Vitality',
    description: 'Reinforce chassis plating to endure escalated Loop II+ encounters.',
    effect: '+10 Max HP & +1 DEF / rank',
    bonus: { maxHp: 10, defense: 1 },
    maxRank: null,
    tone: 'vit',
  },
  {
    id: 'manaConduit',
    name: 'Mana Conduit',
    description: 'Expand arcane bandwidth to fuel heavy cards and Exclusive Actives.',
    effect: '+10 Max Mana & +2 Mana/ans / rank',
    bonus: { maxMana: 10, bonusMana: 2 },
    maxRank: null,
    tone: 'mana',
  },
  {
    id: 'bloodEfficiency',
    name: 'Blood Efficiency',
    description: 'Refine the Blood Hint sacrifice ratio from 50% down to a 35% cap.',
    effect: '-5% Blood Hint HP cost (min 35%)',
    bonus: { bloodHintDiscountPct: 5 },
    maxRank: 3,
    tone: 'blood',
  },
];

function createOverclockProgress() {
  return Object.fromEntries(OVERCLOCK_UPGRADES.map((up) => [up.id, 0]));
}
const overclockProgress = createOverclockProgress();

function createSkillProgress() {
  return Object.fromEntries(SKILL_TREE_KEYS.map((key) => [
    key,
    {
      correct: 0,
      bonusSp: 0,
      transferredIn: 0,
      transferredOut: 0,
      overclockSpSpent: 0,
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
  const nextOverclock = createOverclockProgress();
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      activeSkillSpecialization = null;
      exclusiveSkillTree = null;
      wildcardSkillPoints = 0;
      Object.assign(overclockProgress, nextOverclock);
      return progress;
    }
    const stored = JSON.parse(saved);
    wildcardSkillPoints = Number.isSafeInteger(stored?.wildcardSp) && stored.wildcardSp >= 0 ? stored.wildcardSp : 0;
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
      if (Number.isSafeInteger(source.bonusSp) && source.bonusSp >= 0) {
        progress[key].bonusSp = source.bonusSp;
      }
      if (Number.isSafeInteger(source.transferredIn) && source.transferredIn >= 0) {
        progress[key].transferredIn = source.transferredIn;
      }
      if (Number.isSafeInteger(source.transferredOut) && source.transferredOut >= 0) {
        progress[key].transferredOut = source.transferredOut;
      }
      if (Number.isSafeInteger(source.overclockSpSpent) && source.overclockSpSpent >= 0) {
        progress[key].overclockSpSpent = source.overclockSpSpent;
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
    if (stored?.overclock && typeof stored.overclock === 'object') {
      for (const up of OVERCLOCK_UPGRADES) {
        const r = stored.overclock[up.id];
        if (Number.isSafeInteger(r) && r >= 0) {
          nextOverclock[up.id] = up.maxRank ? Math.min(up.maxRank, r) : r;
        }
      }
    }
  } catch (error) {
    console.error('Unable to load saved skill tree progress.', error);
    activeSkillSpecialization = null;
    exclusiveSkillTree = null;
    wildcardSkillPoints = 0;
  }
  Object.assign(overclockProgress, nextOverclock);
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
      wildcardSp: getWildcardSkillPoints(),
      overclock: { ...overclockProgress },
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
  Object.assign(overclockProgress, createOverclockProgress());
  activeSkillSpecialization = null;
  exclusiveSkillTree = null;
  wildcardSkillPoints = 0;
  saveSkillProgress({ skipSlotSave: true });
}

function applyRunSkillSnapshot(savedSkillProgress, activeSpec = null, exclusiveSpec = null, { skipSlotSave = false } = {}) {
  const base = createSkillProgress();
  const nextOverclock = createOverclockProgress();
  if (savedSkillProgress && typeof savedSkillProgress === 'object') {
    if (Number.isSafeInteger(savedSkillProgress.wildcardSp) && savedSkillProgress.wildcardSp >= 0) {
      wildcardSkillPoints = savedSkillProgress.wildcardSp;
    }
    for (const key of SKILL_TREE_KEYS) {
      const src = savedSkillProgress[key];
      if (!src || typeof src !== 'object') continue;
      if (Number.isSafeInteger(src.correct) && src.correct >= 0) base[key].correct = src.correct;
      if (Number.isSafeInteger(src.bonusSp) && src.bonusSp >= 0) base[key].bonusSp = src.bonusSp;
      if (Number.isSafeInteger(src.transferredIn) && src.transferredIn >= 0) base[key].transferredIn = src.transferredIn;
      if (Number.isSafeInteger(src.transferredOut) && src.transferredOut >= 0) base[key].transferredOut = src.transferredOut;
      if (Number.isSafeInteger(src.overclockSpSpent) && src.overclockSpSpent >= 0) base[key].overclockSpSpent = src.overclockSpSpent;
      for (const skill of SKILL_TREES[key].skills) {
        const r = src.ranks?.[skill.id];
        const maxR = skill.maxRank || SKILL_MAX_RANK;
        if (Number.isSafeInteger(r) && r >= 0 && r <= maxR) base[key].ranks[skill.id] = r;
      }
    }
    if (savedSkillProgress.overclock && typeof savedSkillProgress.overclock === 'object') {
      for (const up of OVERCLOCK_UPGRADES) {
        const r = savedSkillProgress.overclock[up.id];
        if (Number.isSafeInteger(r) && r >= 0) {
          nextOverclock[up.id] = up.maxRank ? Math.min(up.maxRank, r) : r;
        }
      }
    }
  }
  for (const key of Object.keys(skillProgress)) delete skillProgress[key];
  Object.assign(skillProgress, base);
  Object.assign(overclockProgress, nextOverclock);
  activeSkillSpecialization = SKILL_TREE_KEYS.includes(activeSpec) ? activeSpec : null;
  exclusiveSkillTree = SKILL_TREE_KEYS.includes(exclusiveSpec) ? exclusiveSpec : null;
  reconcileExclusiveSkillPoints();
  saveSkillProgress({ skipSlotSave });
}

function getWildcardSkillPoints() {
  return Math.max(0, Number(wildcardSkillPoints) || 0);
}

function skillPointsAvailable(key) {
  const progress = skillProgress[key];
  if (!progress) return 0;
  const spentRanks = Object.values(progress.ranks).reduce((total, rank) => total + getSkillRankSpentSp(rank), 0);
  const spentOverclock = Math.max(0, Number(progress.overclockSpSpent) || 0);
  const earned = getSpFromCorrectCount(progress.correct || 0);
  const bonusSp = Number(progress.bonusSp) || 0;
  const netTransferred = (progress.transferredIn || 0) - (progress.transferredOut || 0);
  return Math.max(0, earned + bonusSp + netTransferred - spentRanks - spentOverclock);
}

function getTotalUnspentSkillPoints() {
  return SKILL_TREE_KEYS.reduce((total, key) => total + skillPointsAvailable(key), 0) + getWildcardSkillPoints();
}

function getTreeRankSummary(key) {
  const skills = SKILL_TREES[key]?.skills || [];
  const progress = skillProgress[key];
  let current = 0;
  let max = 0;
  for (const skill of skills) {
    const m = skill.maxRank || SKILL_MAX_RANK;
    max += m;
    current += Math.min(m, progress?.ranks?.[skill.id] || 0);
  }
  return { current, max, isMaxed: max > 0 && current >= max };
}

function getMaxedSkillTreeKey() {
  for (const key of SKILL_TREE_KEYS) {
    if (getTreeRankSummary(key).isMaxed) return key;
  }
  return null;
}

function isOverclockUnlocked() {
  return Boolean(getMaxedSkillTreeKey());
}

function getOverclockUpgradeCost(upgradeId) {
  return 2 + Math.max(0, Number(overclockProgress[upgradeId]) || 0);
}

function getOverclockAvailableSp() {
  const maxedKey = getMaxedSkillTreeKey();
  if (!maxedKey) return 0;
  return skillPointsAvailable(maxedKey) + getWildcardSkillPoints();
}

function canPurchaseOverclockUpgrade(upgradeId) {
  if (!isOverclockUnlocked()) return false;
  const up = OVERCLOCK_UPGRADES.find((entry) => entry.id === upgradeId);
  if (!up) return false;
  const rank = overclockProgress[up.id] || 0;
  if (up.maxRank != null && rank >= up.maxRank) return false;
  return getOverclockAvailableSp() >= getOverclockUpgradeCost(upgradeId);
}

function purchaseOverclockUpgrade(upgradeId) {
  const up = OVERCLOCK_UPGRADES.find((entry) => entry.id === upgradeId);
  const maxedKey = getMaxedSkillTreeKey();
  if (!up || !maxedKey || !canPurchaseOverclockUpgrade(upgradeId)) return false;
  const cost = getOverclockUpgradeCost(upgradeId);
  const treeAvail = skillPointsAvailable(maxedKey);
  const fromTree = Math.min(treeAvail, cost);
  const fromWildcard = Math.max(0, cost - fromTree);
  if (fromWildcard > getWildcardSkillPoints()) return false;
  if (fromTree > 0) {
    skillProgress[maxedKey].overclockSpSpent = (skillProgress[maxedKey].overclockSpSpent || 0) + fromTree;
  }
  if (fromWildcard > 0) {
    wildcardSkillPoints = Math.max(0, getWildcardSkillPoints() - fromWildcard);
  }
  overclockProgress[up.id] = (overclockProgress[up.id] || 0) + 1;
  applySkillBonus(up.bonus);
  if (up.bonus.maxHp) hero.hp = Math.min(hero.maxHp, (hero.hp || 0) + up.bonus.maxHp);
  if (up.bonus.maxMana) hero.mana = Math.min(hero.maxMana, (hero.mana || 0) + up.bonus.maxMana);
  saveSkillProgress();
  if (typeof window.syncSkillPointButtons === 'function') window.syncSkillPointButtons();
  if (typeof renderHud === 'function') renderHud();
  if (typeof refreshAchievements === 'function') refreshAchievements();
  return true;
}

function grantBonusSkillPoint(categoryOrWildcard = 'wildcard', amount = 1, reason = 'Quest Reward') {
  const amt = Math.max(1, Math.round(Number(amount) || 1));
  let bannerCategory = 'Wildcard SP';
  if (categoryOrWildcard === 'all') {
    for (const treeKey of SKILL_TREE_KEYS) {
      if (exclusiveSkillTree && treeKey !== exclusiveSkillTree) {
        wildcardSkillPoints = getWildcardSkillPoints() + amt;
      } else if (skillProgress[treeKey]) {
        skillProgress[treeKey].bonusSp = (skillProgress[treeKey].bonusSp || 0) + amt;
      }
    }
    bannerCategory = 'All Disciplines';
  } else {
    const matchedKey = SKILL_TREE_KEYS.find(
      (k) => k === categoryOrWildcard || SKILL_TREES[k].name === categoryOrWildcard
    );
    if (!matchedKey) {
      wildcardSkillPoints = getWildcardSkillPoints() + amt;
      bannerCategory = 'Wildcard SP';
    } else if (isSkillTreeLockedOut(matchedKey)) {
      if (exclusiveSkillTree && skillProgress[exclusiveSkillTree]) {
        skillProgress[exclusiveSkillTree].bonusSp = (skillProgress[exclusiveSkillTree].bonusSp || 0) + amt;
        bannerCategory = `${SKILL_TREES[exclusiveSkillTree].name} (Quest Bonus)`;
      } else {
        wildcardSkillPoints = getWildcardSkillPoints() + amt;
        bannerCategory = 'Wildcard SP';
      }
    } else if (skillProgress[matchedKey]) {
      skillProgress[matchedKey].bonusSp = (skillProgress[matchedKey].bonusSp || 0) + amt;
      bannerCategory = `${SKILL_TREES[matchedKey].name} (Quest Bonus)`;
    }
  }
  saveSkillProgress();
  if (typeof window.syncSkillPointButtons === 'function') window.syncSkillPointButtons();
  if (typeof renderHud === 'function') renderHud();
  if (typeof skillTreeOpen !== 'undefined' && skillTreeOpen && typeof renderSkillTree === 'function') renderSkillTree();
  if (typeof Sound !== 'undefined' && Sound && typeof Sound.play === 'function') {
    try { Sound.play('unlock'); } catch {}
  }
  if (typeof showSkillPointEarnedBanner === 'function') {
    showSkillPointEarnedBanner(`${reason}: ${bannerCategory}`);
  }
  return true;
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

function isSkillTreeYearLocked(key) {
  const yr = typeof getActiveAcademicYear === 'function' ? getActiveAcademicYear() : 4;
  return key === 'softwareEng' && yr < 2;
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

  const previousPoints = getSpFromCorrectCount(skillProgress[key].correct);
  skillProgress[key].correct++;
  saveSkillProgress();
  const newPoints = getSpFromCorrectCount(skillProgress[key].correct);
  const earned = newPoints > previousPoints;
  if (earned) {
    if (typeof window.syncSkillPointButtons === 'function') window.syncSkillPointButtons();
    if (typeof window.ByteboundTutorial?.onSkillPointEarned === 'function') {
      window.ByteboundTutorial.onSkillPointEarned(category, key, `${key}:${newPoints}`);
    }
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
  if (isSkillTreeYearLocked(key)) return false;
  if (isSkillTreeLockedOut(key)) return false;
  const progress = skillProgress[key];
  const maxRank = skill.maxRank || SKILL_MAX_RANK;
  const currentRank = progress.ranks[skill.id] || 0;
  const cost = getSkillUpgradeCost(currentRank);
  return (
    (skillPointsAvailable(key) + getWildcardSkillPoints()) >= cost &&
    currentRank < maxRank &&
    skillRequirements(skill).every((id) => progress.ranks[id] > 0)
  );
}

function upgradeSkill(key, skillId) {
  const skill = SKILL_TREES[key]?.skills.find((entry) => entry.id === skillId);
  if (!skill || !canUpgradeSkill(key, skill)) return false;

  const cost = getSkillUpgradeCost(skillProgress[key].ranks[skill.id]);
  const treeAvail = skillPointsAvailable(key);
  if (treeAvail < cost) {
    const wildNeeded = cost - treeAvail;
    if (getWildcardSkillPoints() < wildNeeded) return false;
    wildcardSkillPoints = Math.max(0, getWildcardSkillPoints() - wildNeeded);
    skillProgress[key].bonusSp = (skillProgress[key].bonusSp || 0) + wildNeeded;
  }
  skillProgress[key].ranks[skill.id]++;
  activeSkillSpecialization = key;
  if (skill.isExclusiveActive) {
    exclusiveSkillTree = key;
    reconcileExclusiveSkillPoints();
  }
  applySkillBonus(skill.bonus);
  if (skill.id === 'kernelAegis') {
    const passiveShield = Math.min(MAX_SHIELD_CHARGES, skillProgress[key].ranks[skill.id] || 0);
    hero.maxShield = Math.max(hero.maxShield || 0, passiveShield);
    hero.shield = Math.max(hero.shield || 0, passiveShield);
  }
  saveSkillProgress();
  if (typeof window.syncSkillPointButtons === 'function') window.syncSkillPointButtons();
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
const EXCLUSIVE_MIN_STREAK = 3;
const EXCLUSIVE_MAX_STREAK = 5;
const SOLO_DECK_BASE = typeof SOLO_STARTING_DECK !== 'undefined' ? SOLO_STARTING_DECK : STARTING_DECK;
const runDeck = [...SOLO_DECK_BASE];        // card ids in this run's deck; rewards add to it
const hero = {};
const stats = {};
const battle = {
  enemy: null, enemyFollower: null, phase: 'choose', card: null, question: null, remedial: null, block: 0, tempDefense: 0,
  remedialDefenseBuff: false, cardAnim: null, exclusiveCastCharge: 0,
  defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
  exclusiveCooldownTurns: 0, exclusiveUsedThisTurn: false, exclusiveAppearTick: 0,
  enemyStunTurns: 0, enemyBurnTurns: 0, enemyBurnDamage: 0,
  logicReflectCharges: 0, logicReflectMult: 1.5, logicEliminateCharges: 0, logicCritArmed: false, eliminatedChoices: [],
  hintUsedThisQuestion: false, bloodHintClue: '', bloodSplatterT: 0, bloodDrops: [],
  refactorDiscountTurns: 0, rollbackGuardStacks: 0,
  asyncEchoCharges: 0, enemyRateLimitTurns: 0,
  aegisAnimT: 0, heroShieldBreakT: 0, enemyShieldBreakT: 0, stunAnimT: 0, burnAnimT: 0, logicAnimT: 0, refactorAnimT: 0, asyncAnimT: 0,
  allyAttackT: 0, allyLungeT: 0, allyAttackTs: [0, 0, 0], allyLungeTs: [0, 0, 0], allyTurnIndex: 0,
  allyTurnMessage: '', enemyFollowerMessage: '', necroCandidate: null,
  enemyDefendEffectT: 0, enemyHealTintT: 0, enemyChargeT: 0,
  enemyProjectileT: -1, enemyProjectileCharged: false, enemyImpactRingT: 0, enemyPreviewCard: null,
  heroHealFlashT: 0, heroHealTintT: 0,
  log: '', popups: [], hand: [], drawPile: [], discard: [], rewards: [], upgrades: [],
  fromReview: false, newUnlocks: [], pendingAttack: false,
  feedbackCorrect: true, feedbackNotes: [],
  outcomeFlags: { killRecorded: false, rewardClaimed: false, upgradeClaimed: false, necroResolved: false },
  lungeT: 0, heroAttackT: 0, bossAttackT: 0, driusAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
  chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
  projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
  hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
  heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
  deathTimer: 0, enemyAttackedThisTurn: false, lastAnswerCorrect: true, missedInBattle: 0,
  flash: { hero: 0, enemy: 0 },
};

function resetRuntimeBattleState() {
  Object.assign(battle, {
    enemy: null, enemyFollower: null, phase: 'choose', card: null, question: null, remedial: null,
    block: 0, tempDefense: 0, remedialDefenseBuff: false, cardAnim: null, exclusiveCastCharge: 0,
    defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
    exclusiveCooldownTurns: 0, exclusiveUsedThisTurn: false, exclusiveAppearTick: 0,
    enemyStunTurns: 0, enemyBurnTurns: 0, enemyBurnDamage: 0,
    logicReflectCharges: 0, logicReflectMult: 1.5, logicEliminateCharges: 0, logicCritArmed: false, eliminatedChoices: [],
    hintUsedThisQuestion: false, bloodHintClue: '', bloodSplatterT: 0, bloodDrops: [],
    refactorDiscountTurns: 0, rollbackGuardStacks: 0,
    asyncEchoCharges: 0, enemyRateLimitTurns: 0,
    aegisAnimT: 0, heroShieldBreakT: 0, enemyShieldBreakT: 0, stunAnimT: 0, burnAnimT: 0, logicAnimT: 0, refactorAnimT: 0, asyncAnimT: 0,
    allyAttackT: 0, allyLungeT: 0, allyAttackTs: [0, 0, 0], allyLungeTs: [0, 0, 0], allyTurnIndex: 0,
    allyTurnMessage: '', enemyFollowerMessage: '', necroCandidate: null,
    enemyDefendEffectT: 0, enemyHealTintT: 0, enemyChargeT: 0,
    enemyProjectileT: -1, enemyProjectileCharged: false, enemyImpactRingT: 0, enemyPreviewCard: null,
    heroHealFlashT: 0, heroHealTintT: 0,
    log: '', popups: [], hand: [], drawPile: [], discard: [], rewards: [], upgrades: [],
    fromReview: false, newUnlocks: [], pendingAttack: false,
    feedbackCorrect: true, feedbackNotes: [],
    outcomeFlags: { killRecorded: false, rewardClaimed: false, upgradeClaimed: false, necroResolved: false },
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, driusAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
    deathTimer: 0, enemyAttackedThisTurn: false, lastAnswerCorrect: true, missedInBattle: 0,
    flash: { hero: 0, enemy: 0 },
  });
  if (typeof battleKingDeath !== 'undefined' && battleKingDeath) {
    battleKingDeath.autoplay = false;
    battleKingDeath.currentFrame = 0;
    battleKingDeath.elapsedFrames = 0;
  }
  hideGameOverOverlay();
}
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
  resetRuntimeBattleState();
  Object.assign(hero, {
    hp: 100,
    maxHp: 100,
    mana: 100,
    maxMana: 100,
    attack: 12,
    defense: 2,
    empowerCost: 20,
    bonusHeal: 0,
    bonusMana: 0,
    armorPierce: 0,
    bloodHintDiscountPct: 0,
    shield: 0,
    maxShield: 0,
    runInvincible: false,
    necroAlly: null,
    necroAllies: [],
    tempAttack: 0,
    ultCharge: 0,
    focusRelicCharges: 0,
  });
  for (const key of SKILL_TREE_KEYS) {
    for (const skill of SKILL_TREES[key].skills) {
      applySkillBonus(skill.bonus, skillProgress[key].ranks[skill.id]);
    }
  }
  for (const up of OVERCLOCK_UPGRADES) {
    applySkillBonus(up.bonus, overclockProgress[up.id] || 0);
  }
  hero.hp = hero.maxHp;
  hero.mana = hero.maxMana;
  const passiveShield = Math.min(MAX_SHIELD_CHARGES, Math.max(0, Number(skillProgress.computerSystems?.ranks?.kernelAegis) || 0));
  hero.maxShield = passiveShield;
  hero.shield = passiveShield;
  Object.assign(stats, { kills: 0, correct: 0, total: 0, streak: 0, roomKills: 0, upgrades: [], cardsTaken: 0 });
  runDeck.splice(0, runDeck.length, ...SOLO_DECK_BASE);
  adaptive.reset();
  if (typeof window !== 'undefined') window.ByteboundQuests?.onRunReset?.();
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

function isCardCurrentlyPlayable(id) {
  const card = id && CARD_LIBRARY[id];
  if (!card) return false;
  if (card.id === 'defend' && (battle.defendCooldownTurns || 0) > 0) return false;
  if (card.exclusiveActive && (hero.ultCharge || 0) < EXCLUSIVE_MIN_STREAK) return false;
  const cost = typeof effectiveCardCost === 'function' ? effectiveCardCost(card, hero) : cardCost(card, hero);
  return (hero.mana || 0) >= cost;
}

function hasPlayableStandardCard(hand = battle.hand) {
  return Array.isArray(hand) && hand.some((id) => !CARD_LIBRARY[id]?.exclusiveActive && isCardCurrentlyPlayable(id));
}

function hasPlayableCardInHand(hand = battle.hand) {
  return Array.isArray(hand) && hand.some((id) => isCardCurrentlyPlayable(id));
}

function canUseRemedialSurge() {
  return !multiplayerMatchActive && ((hero.mana || 0) <= 0 || !hasPlayableCardInHand(battle.hand));
}

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
  // Never strand the player with a hand of only unaffordable/cooldown cards if a playable card exists in deck/discard.
  if (!multiplayerMatchActive && battle.hand.length > 0 && !hasPlayableStandardCard(battle.hand)) {
    const preferIds = ['charge', 'siphon', 'quick', 'strike', 'mend', 'fortify'];
    const pickPlayableIndex = (pile) => {
      for (const pid of preferIds) {
        const idx = pile.findIndex((cid) => cid === pid && isCardCurrentlyPlayable(cid));
        if (idx >= 0) return idx;
      }
      return pile.findIndex((cid) => !CARD_LIBRARY[cid]?.exclusiveActive && isCardCurrentlyPlayable(cid));
    };
    let sourcePile = battle.drawPile;
    let pickedIdx = pickPlayableIndex(sourcePile);
    if (pickedIdx < 0) {
      sourcePile = battle.discard;
      pickedIdx = pickPlayableIndex(sourcePile);
    }
    if (pickedIdx >= 0) {
      const [rescueCard] = sourcePile.splice(pickedIdx, 1);
      const replacedCard = battle.hand.pop();
      if (replacedCard) battle.drawPile.push(replacedCard);
      battle.hand.push(rescueCard);
      shuffle(battle.drawPile);
    }
  }
  if (!multiplayerMatchActive) {
    const exId = getUnlockedExclusiveCardId();
    if (exId && !battle.hand.includes(exId)) {
      battle.hand.push(exId);
    }
  }
}

// ===== Panel and HUD rendering =====
function setExploreBanner() {
  const banner = document.getElementById('playExploreBanner');
  if (!banner) return;
  banner.textContent = '';
  banner.hidden = true;
}

function hideGameOverOverlay() {
  const go = document.getElementById('gameOverOverlay');
  if (go) {
    go.hidden = true;
    go.classList.remove('is-victory', 'is-draw', 'is-necromancy');
    go.innerHTML = '';
  }
}

function clearPortraitQuestionClasses() {
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.classList.remove('is-battle-question', 'is-compact-battle-q', 'is-ultra-battle-q');
  }
  if (panel) {
    panel.classList.remove('is-question-panel', 'is-compact-q', 'is-ultra-compact-q', 'is-tight-choices');
  }
}

function fitPortraitQuestionPanel() {
  if (!panel || !panel.classList.contains('is-question-panel')) return;
  const appEl = document.getElementById('app');
  const choicesEl = panel.querySelector('.choices');
  panel.classList.remove('is-compact-q', 'is-ultra-compact-q', 'is-tight-choices');
  if (appEl) appEl.classList.remove('is-compact-battle-q', 'is-ultra-battle-q');
  if (choicesEl) choicesEl.classList.remove('is-force-2col');

  const isPortraitMobile = window.innerHeight > window.innerWidth && window.innerWidth <= 640;
  if (!isPortraitMobile) return;

  const overflows = () => panel.scrollHeight > panel.clientHeight + 1;
  if (!overflows()) return;

  panel.classList.add('is-compact-q');
  if (appEl) appEl.classList.add('is-compact-battle-q');
  if (!overflows()) return;

  panel.classList.add('is-ultra-compact-q');
  if (appEl) appEl.classList.add('is-ultra-battle-q');
  if (!overflows()) return;

  if (choicesEl && !choicesEl.classList.contains('is-choices-2col')) {
    const beforeH = panel.scrollHeight;
    choicesEl.classList.add('is-force-2col');
    if (panel.scrollHeight >= beforeH) {
      choicesEl.classList.remove('is-force-2col');
    }
  }
  if (!overflows()) return;

  panel.classList.add('is-tight-choices');
}

function applyPortraitQuestionLayout(choiceTexts) {
  const appEl = document.getElementById('app');
  if (appEl) appEl.classList.add('is-battle-question');
  if (panel) panel.classList.add('is-question-panel');
  const choicesEl = panel ? panel.querySelector('.choices') : null;
  if (choicesEl && Array.isArray(choiceTexts)) {
    const lengths = choiceTexts.map((t) => String(t || '').trim().length);
    const maxLen = lengths.reduce((a, b) => Math.max(a, b), 0);
    const totalLen = lengths.reduce((a, b) => a + b, 0);
    const useTwoCol = choiceTexts.length === 4 && maxLen <= 34 && totalLen <= 115;
    choicesEl.classList.toggle('is-choices-2col', useTwoCol);
    choicesEl.classList.toggle('is-choices-1col', !useTwoCol);
  }
  fitPortraitQuestionPanel();
  window.requestAnimationFrame(() => fitPortraitQuestionPanel());
}

window.addEventListener('resize', () => {
  if (panel && panel.classList.contains('is-question-panel')) fitPortraitQuestionPanel();
});
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => {
    if (panel && panel.classList.contains('is-question-panel')) fitPortraitQuestionPanel();
  }, 120);
});

function setPanel(html) {
  clearPortraitQuestionClasses();
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

function renderExplore() {
  setPanel('');
}

function getExclusiveChargeMult(charge = hero.ultCharge) {
  const c = Math.max(0, Math.min(EXCLUSIVE_MAX_STREAK, Math.round(Number(charge) || 0)));
  if (c >= 5) return { charge: 5, tier: 3, mult: 1.5, tag: '5/5 MAX OVERDRIVE (1.5×)', readyLabel: '1.5× MAX (5/5)' };
  if (c === 4) return { charge: 4, tier: 2, mult: 1.25, tag: '4/5 OVERCHARGED (1.25×)', readyLabel: '1.25× (4/5)' };
  if (c === 3) return { charge: 3, tier: 1, mult: 1.0, tag: '3/5 READY', readyLabel: 'READY (3/5)' };
  return { charge: c, tier: 0, mult: 1.0, tag: '', readyLabel: `STREAK ${c}/${EXCLUSIVE_MIN_STREAK}` };
}

function updateExclusiveChargeOnAnswer(correct, wasExclusiveCast = false) {
  const prev = Math.max(0, Math.min(EXCLUSIVE_MAX_STREAK, Math.round(Number(hero.ultCharge) || 0)));
  if (wasExclusiveCast) {
    return '';
  }
  const exId = getUnlockedExclusiveCardId();
  const hasExclusiveActive = Boolean(exId);
  if (correct) {
    const next = Math.min(EXCLUSIVE_MAX_STREAK, prev + 1);
    hero.ultCharge = next;
    if (!hasExclusiveActive) return '';
    const exCard = CARD_LIBRARY[exId];
    const exName = exCard ? exCard.name : 'Exclusive Skill';
    if (next === 3 && prev < 3) {
      popup('hero', 'SKILL READY (3/5)!', '#ffe07a', { offsetX: 0, y: HERO_SPOT.y - 108 });
      Sound.play('unlock');
      return `★ ${exName} CHARGED (3/5)! Use now or keep answering correctly up to 5/5 (1.5×)!`;
    }
    if (next === 4 && prev < 4) {
      popup('hero', 'OVERCHARGE 4/5!', '#6fe3e8', { offsetX: 0, y: HERO_SPOT.y - 108 });
      window.ByteboundQuests?.onExclusiveChargeReached?.(next);
      return `⚡ ${exName} OVERCHARGED (4/5) — 1.25× power!`;
    }
    if (next === 5 && prev < 5) {
      popup('hero', 'MAX OVERDRIVE 5/5!', '#ff9659', { offsetX: 0, y: HERO_SPOT.y - 108 });
      Sound.play('unlock');
      window.ByteboundQuests?.onExclusiveChargeReached?.(next);
      return `⚡ ${exName} MAX OVERDRIVE (5/5) — 1.5× power!`;
    }
    if (next < EXCLUSIVE_MIN_STREAK) {
      return `${exName} charge: ${next}/${EXCLUSIVE_MIN_STREAK} consecutive correct.`;
    }
    return '';
  }
  hero.ultCharge = 0;
  if (hasExclusiveActive && prev > 0) {
    return `Streak broken — Exclusive Skill charge reset (${prev} → 0).`;
  }
  return '';
}

function renderBattle() {
  const cards = battle.hand.map((id, i) => {
    const card = CARD_LIBRARY[id];
    const role = typeof getCardRoleMeta === 'function'
      ? getCardRoleMeta(card)
      : { tone: card.kind === 'hit' ? 'offense' : 'defense', category: card.kind === 'hit' ? 'attack' : 'defense', label: card.kind === 'hit' ? 'ATTACK' : 'DEFENSE', iconSvg: '' };
    const defendCooling = card.id === 'defend' && battle.defendCooldownTurns > 0;
    const coolingTurns = defendCooling ? battle.defendCooldownTurns : 0;
    const isCooling = defendCooling;
    const costVal = typeof effectiveCardCost === 'function' ? effectiveCardCost(card, hero) : cardCost(card, hero);
    const manaBlocked = hero.mana < costVal;

    if (card.exclusiveActive) {
      const chargeInfo = getExclusiveChargeMult(hero.ultCharge);
      const streakLocked = chargeInfo.charge < EXCLUSIVE_MIN_STREAK;
      const blocked = streakLocked || manaBlocked;
      const needed = Math.max(0, EXCLUSIVE_MIN_STREAK - chargeInfo.charge);
      const pipsHtml = [1, 2, 3, 4, 5].map((idx) => {
        const lit = chargeInfo.charge >= idx;
        const isOver = idx > EXCLUSIVE_MIN_STREAK;
        return `<span class="active-skill-pip${lit ? ' is-lit' : ''}${isOver ? ' is-overcharge' : ''}" aria-hidden="true"></span>`;
      }).join('');
      const statusText = streakLocked
        ? `STREAK ${chargeInfo.charge}/${EXCLUSIVE_MIN_STREAK}`
        : manaBlocked
          ? `NEED ${costVal} MP`
          : `${chargeInfo.readyLabel} · ${costVal} MP`;
      const statusCls = streakLocked ? 'is-cd' : (manaBlocked ? 'is-low-mp' : 'is-ready');
      const activeDesc = streakLocked
        ? `Answer ${needed} more consecutive correct to charge · ${describeCard(card, hero)}`
        : `${chargeInfo.charge >= 4 ? `Overcharged ${chargeInfo.mult}× (${chargeInfo.charge}/5 streak) · ` : 'Charged (hold up to 5/5 for 1.5×) · '}${describeCard(card, hero)}`;
      const cls = [
        'is-exclusive-card',
        `card-${card.id}`,
        streakLocked ? 'is-cooling-down' : '',
        chargeInfo.charge === 4 && !manaBlocked ? 'is-overcharged-4' : '',
        chargeInfo.charge >= 5 && !manaBlocked ? 'is-overcharged-5' : '',
        manaBlocked ? 'is-unaffordable' : '',
      ].filter(Boolean).join(' ');
      return `<button class="${cls}" data-act="card" data-val="${i}" ${blocked ? 'disabled' : ''}>
        <span class="active-skill-sigil" aria-hidden="true">${role.sigilSvg || ''}</span>
        <span class="active-skill-content">
          <span class="active-skill-ribbon">
            <span class="active-skill-tag">★ ACTIVE SKILL · ${esc(role.discipline || 'RELIC')}</span>
            <span class="active-skill-pips" aria-label="Skill streak charge ${chargeInfo.charge} of 5">${pipsHtml}</span>
            <span class="active-skill-status ${statusCls}">${esc(statusText)}</span>
          </span>
          <span class="active-skill-name"><span class="active-skill-key">${i + 1}.</span> ${esc(card.name)}</span>
          <small class="active-skill-desc">${esc(activeDesc)}</small>
        </span>
      </button>`;
    }

    const costChip = isCooling
      ? `CD ${coolingTurns}t`
      : (costVal > 0 ? `${costVal} MP` : 'FREE');
    const costChipCls = isCooling ? 'is-cd' : (manaBlocked ? 'is-low-mp' : (costVal > 0 ? 'is-mp' : 'is-free'));
    const detail = isCooling
      ? `Cooldown: ${coolingTurns} turn${coolingTurns === 1 ? '' : 's'} remaining`
      : describeCard(card, hero);
    const cls = [
      'battle-card',
      `card-tone-${role.tone}`,
      `card-role-${role.category}`,
      isCooling ? 'is-cooling-down' : '',
      manaBlocked ? 'is-unaffordable' : '',
    ].filter(Boolean).join(' ');
    const blocked = manaBlocked || isCooling;
    return `<button class="${cls}" data-act="card" data-val="${i}" ${blocked ? 'disabled' : ''}>
      <span class="battle-card-top">
        <span class="battle-card-role">
          <span class="card-role-ico" aria-hidden="true">${role.iconSvg || ''}</span>
          <span class="card-role-txt">${esc(role.label)}</span>
        </span>
        <span class="battle-card-cost ${costChipCls}">${esc(costChip)}</span>
      </span>
      <span class="battle-card-title"><span class="battle-card-key">${i + 1}.</span> ${esc(card.name)}</span>
      <small class="battle-card-desc">${esc(detail)}</small>
    </button>`;
  }).join('');
  if (multiplayerMatchActive) {
    const oppTitleBadge = (typeof window !== 'undefined' && window.ByteboundQuests?.renderTitleBadgeHtml && mpState.opponentTitleId)
      ? `${window.ByteboundQuests.renderTitleBadgeHtml(mpState.opponentTitleId, { compact: true })} `
      : '';
    setPanel(`<div class="battle-bar-head">
        <span class="mp-turn-pill is-yours">YOUR TURN</span>
        <span class="log">${esc(battle.log)}</span>
        <span class="intent">VS ${oppTitleBadge}${esc(mpState.opponentName)} · Turn ${mpState.round + 1}</span>
        <span class="dim">Room: ${esc(mpState.roomCode)} · Equal Stats</span>
        <button type="button" class="mp-inline-forfeit" data-act="mp-forfeit">Forfeit</button>
      </div>
      <div class="actions">${cards}</div>`);
    window.ByteboundTutorial?.onBattlePhaseRendered?.('choose');
    return;
  }
  const remedialOpen = canUseRemedialSurge();
  const remedialSubtitle = hero.mana <= 0
    ? '0 MP Recovery · Answer 2–5 remedial questions for buff + HP/MP restore'
    : `No Playable Cards (${hero.mana} MP) · Answer 2–5 remedial questions to restore MP & buff`;
  const noManaRemedial = remedialOpen
    ? `<button class="is-remedial-action" data-act="remedial">R. Remedial Surge ✦<small>${esc(remedialSubtitle)}</small></button>`
    : '';
  const buffParts = [];
  if ((hero.tempAttack || 0) > 0) buffParts.push(`+${hero.tempAttack} ATK`);
  if ((battle.tempDefense || 0) > 0) buffParts.push(`+${battle.tempDefense} DEF`);
  if ((battle.logicReflectCharges || 0) > 0) buffParts.push(`REFLECT ×${battle.logicReflectCharges}`);
  if ((battle.logicEliminateCharges || 0) > 0) buffParts.push(`50/50 ×${battle.logicEliminateCharges}`);
  if (battle.logicCritArmed) buffParts.push('2× CRIT');
  if ((battle.refactorDiscountTurns || 0) > 0) buffParts.push(`50% MP (${battle.refactorDiscountTurns}t)`);
  if ((battle.rollbackGuardStacks || 0) > 0) buffParts.push(`ROLLBACK ×${battle.rollbackGuardStacks}`);
  if ((battle.asyncEchoCharges || 0) > 0) buffParts.push(`ECHO ×${battle.asyncEchoCharges}`);
  if ((battle.enemyRateLimitTurns || 0) > 0) buffParts.push(`RATE-LIMIT (${battle.enemyRateLimitTurns}t)`);
  const buffBadge = buffParts.length ? `<span class="battle-buff-pill">${buffParts.join(' · ')}</span>` : '';
  const adaptiveProfile = !multiplayerMatchActive && typeof adaptive?.getAdaptiveCombatProfile === 'function'
    ? adaptive.getAdaptiveCombatProfile()
    : null;
  const adaptiveBadge = adaptiveProfile && adaptiveProfile.mode !== 'balanced'
    ? `<span class="battle-adaptive-pill is-${esc(adaptiveProfile.mode)}">${esc(adaptiveProfile.label)}</span>`
    : '';
  const hasExclusiveInHand = !multiplayerMatchActive && battle.hand.some((id) => Boolean(CARD_LIBRARY[id]?.exclusiveActive));
  const actionsCls = ['actions', hasExclusiveInHand ? 'has-exclusive' : '', remedialOpen ? 'has-remedial' : ''].filter(Boolean).join(' ');
  setPanel(`<div class="battle-bar-head">
      <span class="log">${esc(battle.log)}</span>
      <span class="intent">${isHeavy() ? 'Next: HEAVY attack!' : 'Next: Normal attack'}</span>
      ${adaptiveBadge}${buffBadge}
      <span class="dim">Deck: ${runDeck.length} (${battle.drawPile.length} left)</span>
    </div>
    <div class="${actionsCls}">${cards}${noManaRemedial}</div>`);
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

const PIXEL_BLOOD_DROP_SVG = `<svg class="pixel-blood-svg" viewBox="0 0 12 12" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="2" fill="#ff6b7a"/><rect x="4" y="3" width="4" height="2" fill="#e6293d"/><rect x="3" y="5" width="6" height="3" fill="#c9182b"/><rect x="4" y="8" width="4" height="2" fill="#990d1c"/><rect x="5" y="10" width="2" height="1" fill="#730814"/><rect x="4" y="5" width="1" height="2" fill="#ff9ca6"/></svg>`;
let bloodRattleTimer = 0;

function applyLoopEnemyMitigation(rawDmg, foe = battle.enemy) {
  const base = Math.max(0, Math.round(Number(rawDmg) || 0));
  if (!foe || foe.isMultiplayerPlayer || !(foe.loopTier > 0) || base <= 0) {
    return { dmg: base, mitigated: 0, pierced: 0 };
  }
  const dr = Math.min(0.6, Math.max(0, Number(foe.loopDmgReduction) || 0));
  const armor = Math.max(0, Number(foe.loopArmor) || 0);
  const pierce = Math.max(0, Number(hero.armorPierce) || 0);
  const effectiveArmor = Math.max(0, armor - pierce);
  const excessPierce = Math.max(0, pierce - armor);
  const effectiveDr = Math.max(0, dr - Math.min(dr, excessPierce * 0.02));
  const afterPct = Math.round(base * (1 - effectiveDr));
  const finalDmg = Math.max(1, afterPct - effectiveArmor);
  return { dmg: finalDmg, mitigated: Math.max(0, base - finalDmg), pierced: Math.min(armor, pierce) };
}

function getHeroPassiveShieldCount() {
  return Math.min(MAX_SHIELD_CHARGES, Math.max(0, Number(skillProgress.computerSystems?.ranks?.kernelAegis) || 0));
}

function computeEnemyStartingShield(enemy, cycle = 0) {
  if (!enemy || enemy.isMultiplayerPlayer) return 0;
  const c = Math.max(0, Math.round(Number(cycle) || 0));
  if (enemy.isFinal) return Math.min(MAX_SHIELD_CHARGES, 3 + c);
  if (enemy.isBoss) return Math.min(MAX_SHIELD_CHARGES, 2 + c);
  if (c > 0) {
    const isElite = Boolean(enemy.brute || enemy.grenu || enemy.nyrmed);
    return Math.min(MAX_SHIELD_CHARGES, isElite ? c + 1 : c);
  }
  return 0;
}

function applyEnemyHitDamage(rawDmg, foe = battle.enemy, { bypassShield = false, popupTag = '', popupColor = '#ffd27a', popupOpts = null, isCrit = false } = {}) {
  if (!foe || foe.isMultiplayerPlayer || foe.hp <= 0) {
    return { shielded: false, broken: false, remaining: 0, dmg: 0, mitigated: 0, pierced: 0 };
  }
  if (!bypassShield && (foe.shield || 0) > 0) {
    foe.shield = Math.max(0, foe.shield - 1);
    battle.enemyShieldBreakT = 28;
    battle.flash.enemy = Math.max(battle.flash.enemy, 9);
    battle.hitT = Math.max(battle.hitT, 0.6);
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 78, '#72f5ff', foe.shield === 0 ? 24 : 14, foe.shield === 0 ? 4.4 : 3.2);
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 78, '#eefcff', 10, 2.8);
    Sound.play(foe.shield === 0 ? 'heavy' : 'block');
    popup('enemy', foe.shield === 0 ? 'SHIELD BROKEN!' : `-1 SHIELD (${foe.shield})`, '#72f5ff', popupOpts || undefined);
    return { shielded: true, broken: foe.shield === 0, remaining: foe.shield, dmg: 0, mitigated: 0, pierced: 0 };
  }
  const hitMit = applyLoopEnemyMitigation(rawDmg, foe);
  foe.hp = Math.max(0, foe.hp - hitMit.dmg);
  if (foe.hp <= 0) battle.enemyDefeatT = 0;
  const dmgText = popupTag ? `-${hitMit.dmg} ${popupTag}` : (isCrit ? `-${hitMit.dmg} CRIT!` : `-${hitMit.dmg}`);
  popup('enemy', dmgText, popupColor, popupOpts || undefined);
  return { shielded: false, broken: false, remaining: 0, dmg: hitMit.dmg, mitigated: hitMit.mitigated, pierced: hitMit.pierced };
}

function consumeHeroShield(attackerName, { fromWrongAnswer = false } = {}) {
  if ((hero.shield || 0) <= 0) return null;
  hero.shield = Math.max(0, hero.shield - 1);
  battle.heroShieldBreakT = 28;
  battle.aegisAnimT = Math.max(battle.aegisAnimT, 24);
  emitFx(HERO_SPOT.x, HERO_SPOT.y - 76, '#72f5ff', hero.shield === 0 ? 24 : 14, 3.8);
  emitFx(HERO_SPOT.x, HERO_SPOT.y - 76, '#eefcff', 10, 2.6);
  popup('hero', hero.shield === 0 ? 'SHIELD BROKEN!' : `-1 SHIELD (${hero.shield})`, '#72f5ff');
  Sound.play('block');
  return {
    broken: hero.shield === 0,
    remaining: hero.shield,
    msg: hero.shield === 0
      ? `${attackerName}'s ${fromWrongAnswer ? 'counter ' : ''}attack shattered your final Aegis Shield (0 HP lost)!`
      : `${attackerName}'s ${fromWrongAnswer ? 'counter ' : ''}attack cracked 1 Aegis Shield (${hero.shield} left, 0 HP lost)!`,
  };
}

function getBloodHintCostPct() {
  return Math.max(0.35, 0.5 - Math.min(0.15, (Number(hero.bloodHintDiscountPct) || 0) / 100));
}

function getBloodHintHpCost(maxHp = hero.maxHp) {
  return Math.max(1, Math.round((Number(maxHp) || 100) * getBloodHintCostPct()));
}

function canAffordBloodHint() {
  return (Number(hero.hp) || 0) > getBloodHintHpCost();
}

function buildBloodHintClue(question) {
  const explain = String(question?.explain || '').trim();
  const answerText = String(question?.choices?.[question?.answer] || '').trim();
  if (!explain) {
    return `Focus on ${question?.topic || question?.category || 'this concept'} fundamentals — misleading options were purged.`;
  }
  let clue = explain;
  if (answerText.length >= 4) {
    const escaped = answerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clue = clue.replace(new RegExp(escaped, 'gi'), '[???]');
  }
  const sentenceBreak = clue.search(/[.!?](?:\s|$)/);
  if (sentenceBreak > 24 && sentenceBreak < 165) {
    clue = clue.slice(0, sentenceBreak + 1);
  } else if (clue.length > 165) {
    clue = clue.slice(0, 162).replace(/\s+\S*$/, '') + '…';
  }
  return clue;
}

function triggerBloodSacrificeEffects(costHp) {
  const reduced = Boolean(
    document.body.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
  battle.bloodSplatterT = 46;
  const hx = typeof HERO_SPOT !== 'undefined' ? HERO_SPOT.x : 230;
  const hy = typeof HERO_SPOT !== 'undefined' ? HERO_SPOT.y - 72 : 340;
  const palette = ['#7a0814', '#b81122', '#e02438', '#52040c', '#ff4757'];
  const drops = [];
  for (let i = 0; i < 30; i++) {
    const angle = -Math.PI + Math.random() * Math.PI * 2;
    const speed = reduced ? (0.4 + Math.random() * 0.8) : (2.2 + Math.random() * 5.2);
    drops.push({
      x: hx + (Math.random() - 0.5) * 26,
      y: hy + (Math.random() - 0.5) * 34,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (reduced ? 0.2 : 2.1),
      size: 4 + (i % 3) * 2,
      color: palette[i % palette.length],
      life: 28 + Math.floor(Math.random() * 18),
      maxLife: 46,
    });
  }
  battle.bloodDrops = drops;
  battle.flash.hero = 14;
  battle.heroHitTintT = 20;
  if (!reduced) {
    battle.cameraShakeT = Math.max(battle.cameraShakeT || 0, 1.0);
  }
  if (typeof popup === 'function') {
    popup('hero', `-${costHp} BLOOD`, '#e6293d', { y: hy - 34 });
  }
  Sound.play('hit');

  const frameEl = document.querySelector('.preview-frame');
  if (panel) panel.classList.remove('is-blood-rattle');
  if (frameEl) frameEl.classList.remove('is-blood-splatter');
  if (panel) void panel.offsetWidth;
  if (panel) panel.classList.add('is-blood-rattle');
  if (frameEl) frameEl.classList.add('is-blood-splatter');
  if (bloodRattleTimer) window.clearTimeout(bloodRattleTimer);
  bloodRattleTimer = window.setTimeout(() => {
    panel?.classList.remove('is-blood-rattle');
    frameEl?.classList.remove('is-blood-splatter');
    bloodRattleTimer = 0;
  }, 620);
}

function useBloodHint() {
  if (battle.phase !== 'question' || multiplayerMatchActive || !battle.question) return false;
  if (battle.hintUsedThisQuestion || !canAffordBloodHint()) return false;

  const costHp = getBloodHintHpCost();
  hero.hp = Math.max(1, hero.hp - costHp);
  battle.hintUsedThisQuestion = true;
  battle.bloodHintClue = buildBloodHintClue(battle.question);

  const alreadyElim = new Set(Array.isArray(battle.eliminatedChoices) ? battle.eliminatedChoices : []);
  const totalChoices = Array.isArray(battle.question.choices) ? battle.question.choices.length : 0;
  const remainingWrong = [];
  for (let i = 0; i < totalChoices; i++) {
    if (i !== battle.question.answer && !alreadyElim.has(i)) remainingWrong.push(i);
  }
  if (remainingWrong.length >= 2) {
    const removeCount = remainingWrong.length >= 3 ? 2 : 1;
    const picked = shuffle(remainingWrong).slice(0, removeCount);
    battle.eliminatedChoices = [...alreadyElim, ...picked];
  } else {
    battle.eliminatedChoices = [...alreadyElim];
  }

  battle.log = `Blood Sacrifice! Paid ${costHp} HP to expose wrong options and reveal a Blood Clue.`;
  renderQuestion();
  triggerBloodSacrificeEffects(costHp);
  if (typeof renderHud === 'function') renderHud();
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  return true;
}

function renderQuestion() {
  const q = battle.question;
  if (!q) {
    setPanel(`<div class="battle-feedback-row">
        <div class="battle-feedback-copy">
          <p><strong>No eligible questions found for ${esc(getAcademicYearLabel())}.</strong></p>
          <p class="log">Adjust your Academic Year filter in Settings to unlock additional curriculum topics.</p>
        </div>
        <button data-act="continue">Back to hand</button>
      </div>`);
    battle.phase = 'choose';
    return;
  }
  const eliminated = new Set(!multiplayerMatchActive && Array.isArray(battle.eliminatedChoices) ? battle.eliminatedChoices : []);
  const choices = q.choices.map((text, i) => {
    const isElim = eliminated.has(i);
    return `<button data-act="answer" data-val="${i}"${isElim ? ' disabled class="is-eliminated"' : ''}>${i + 1}. ${esc(text)}${isElim ? ' (Eliminated)' : ''}</button>`;
  }).join('');
  const qDiffKey = String(q.difficulty || (multiplayerMatchActive ? 'medium' : (adaptive.lastSelection?.difficulty || adaptive.name))).toLowerCase();
  const diffLabel = qDiffKey.toUpperCase();
  const qScale = !multiplayerMatchActive ? getQuestionDifficultyScale(qDiffKey) : null;
  const bonusChip = qScale && qScale.mult > 1
    ? ` · <span class="adaptive-bonus-chip">+${Math.round((qScale.mult - 1) * 100)}% POWER · +${qScale.bonusMp} MP</span>`
    : '';
  const proofChip = eliminated.size > 0
    ? ` · <span class="adaptive-bonus-chip is-proof-chip">${battle.hintUsedThisQuestion ? 'BLOOD PURGE' : 'PROOF 50/50'}</span>`
    : '';
  const reasonBadge = multiplayerMatchActive
    ? `1V1 SYNCED · ROUND ${mpState.round + 1}`
    : (battle.fromReview
      ? (adaptive.lastSelection?.badge || 'SPACED REVIEW')
      : (adaptive.lastSelection?.badge || 'ADAPTIVE'));
  const showBloodHint = !multiplayerMatchActive && Array.isArray(q.choices) && q.choices.length >= 2;
  const hintPctLabel = Math.round(getBloodHintCostPct() * 100);
  const hintCost = getBloodHintHpCost();
  const canAffordHint = hero.hp > hintCost;
  const hintDisabled = battle.hintUsedThisQuestion || !canAffordHint;
  const bloodHintBtn = showBloodHint
    ? `<button type="button" class="blood-hint-btn${battle.hintUsedThisQuestion ? ' is-used' : ''}" data-act="blood-hint"${hintDisabled ? ' disabled' : ''} title="Sacrifice ${hintPctLabel}% of your Max HP (${hintCost} HP) to eliminate wrong choices and reveal a Blood Clue [H]">${PIXEL_BLOOD_DROP_SVG} <span>${battle.hintUsedThisQuestion ? 'BLOOD SACRIFICED' : (canAffordHint ? `BLOOD HINT · −${hintCost} HP` : `NEED >${hintCost} HP`)}</span><span class="keyhint"> [H]</span></button>`
    : '';
  const bloodClueBanner = !multiplayerMatchActive && battle.bloodHintClue
    ? `<div class="blood-hint-clue" role="status"><span class="blood-hint-clue-tag">${PIXEL_BLOOD_DROP_SVG} BLOOD CLUE</span> <span>${esc(battle.bloodHintClue)}</span></div>`
    : '';
  setPanel(`<div class="battle-bar-head">
      <div class="question-head-row">
        <span class="tag">${esc(q.category)} · ${esc(q.topic)} · ${esc(diffLabel)}${bonusChip}${proofChip} · <span class="adaptive-reason-tag">${esc(reasonBadge)}</span></span>
        ${bloodHintBtn}
      </div>
      <p class="question">${esc(q.q)}</p>
      ${bloodClueBanner}
    </div>
    <div class="choices">${choices}</div>`);
  applyPortraitQuestionLayout(q.choices);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('question');
}

function renderFeedback(correct, notes) {
  const q = battle.question;
  const safeNotes = Array.isArray(notes) ? [...notes] : [];
  battle.feedbackCorrect = Boolean(correct);
  battle.feedbackNotes = safeNotes;
  const attackPending = battle.pendingAttack;
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><strong class="${correct ? 'ok' : 'bad'}">${correct ? 'Correct!' : 'Not quite.'}</strong> <b>Answer: ${esc(q.choices[q.answer])}.</b> ${esc(q.explain)}</p>
        ${safeNotes.length ? `<p class="log">${safeNotes.map((n) => esc(n)).join(' ')}</p>` : ''}
      </div>
      <button data-act="continue"${attackPending ? ' disabled' : ''}>${attackPending ? 'Resolving...' : 'Continue<span class="keyhint"> (Enter)</span>'}</button>
    </div>`);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('feedback', { correct, notes: safeNotes });
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

function renderUpgrades(presetUpgrades = null) {
  if (Array.isArray(presetUpgrades) && presetUpgrades.length) {
    battle.upgrades = presetUpgrades;
  } else {
    battle.upgrades = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  }
  battle.phase = 'upgrade';
  setPanel(`<div class="battle-bar-head"><span class="ok">Level up! Choose one upgrade (1–3):</span></div>
    <div class="choices card-pick">${battle.upgrades.map((u, i) => `<button data-act="upgrade" data-val="${i}">${i + 1}. ${u.name}<small>${u.text}</small></button>`).join('')}</div>`);
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  window.ByteboundTutorial?.onBattlePhaseRendered?.('upgrade');
}

function renderCardReward(presetRewards = null) {
  battle.phase = 'reward';
  if (Array.isArray(presetRewards) && presetRewards.length) {
    battle.rewards = [...presetRewards];
  } else {
    battle.rewards = rewardChoices(3, getAchievementMetrics());
  }
  const choices = battle.rewards.map((id, i) => {
    const card = CARD_LIBRARY[id];
    const role = typeof getCardRoleMeta === 'function'
      ? getCardRoleMeta(card)
      : { tone: card.kind === 'hit' ? 'offense' : 'defense', category: card.kind === 'hit' ? 'attack' : 'defense', label: card.kind === 'hit' ? 'ATTACK' : 'DEFENSE', iconSvg: '' };
    const costVal = cardCost(card, hero);
    const costChip = costVal > 0 ? `${costVal} MP` : 'FREE';
    const costChipCls = costVal > 0 ? 'is-mp' : 'is-free';
    return `<button class="battle-card card-tone-${role.tone} card-role-${role.category}" data-act="pickcard" data-val="${i}">
      <span class="battle-card-top">
        <span class="battle-card-role">
          <span class="card-role-ico" aria-hidden="true">${role.iconSvg || ''}</span>
          <span class="card-role-txt">${esc(role.label)}</span>
        </span>
        <span class="battle-card-cost ${costChipCls}">${esc(costChip)}</span>
      </span>
      <span class="battle-card-title"><span class="battle-card-key">${i + 1}.</span> ${esc(card.name)}</span>
      <small class="battle-card-desc">${esc(describeCard(card, hero))}</small>
    </button>`;
  }).join('');
  setPanel(`<div class="battle-bar-head"><span class="ok">Choose a card for your deck (1–${battle.rewards.length}):</span><span class="dim">Deck: ${runDeck.length} cards</span></div>
    <div class="choices card-pick">${choices}</div>`);
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
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
  const adaptiveProfile = !multiplayerMatchActive && typeof adaptive?.getAdaptiveCombatProfile === 'function'
    ? adaptive.getAdaptiveCombatProfile()
    : null;
  if (adaptiveProfile && adaptiveProfile.mode === 'mastery' && enemy && !enemy._adaptiveScaled) {
    enemy.maxHp = Math.round((enemy.maxHp || 40) * adaptiveProfile.enemyHpMult);
    enemy.hp = Math.round((enemy.hp || enemy.maxHp) * adaptiveProfile.enemyHpMult);
    enemy.attack = Math.max(1, Math.round((enemy.attack || 8) * adaptiveProfile.enemyAtkMult));
    enemy._adaptiveScaled = true;
  }
  const masteryNote = adaptiveProfile && adaptiveProfile.mode === 'mastery'
    ? ' · Adaptive Mastery active (+15% foe resilience).'
    : '';
  let focusRelicNote = '';
  if (!multiplayerMatchActive && (hero.focusRelicCharges || 0) > 0) {
    hero.focusRelicCharges = Math.max(0, (hero.focusRelicCharges || 0) - 1);
    hero.ultCharge = Math.min(5, Math.max(1, (hero.ultCharge || 0) + 1));
    focusRelicNote = ` · Focus Relic ignited (${hero.ultCharge}/5 Exclusive Charge)!`;
  }
  let shieldIntroNote = '';
  if (!multiplayerMatchActive) {
    const passiveShield = getHeroPassiveShieldCount();
    hero.maxShield = passiveShield;
    hero.shield = passiveShield;
    if (enemy && !Number.isInteger(enemy.maxShield)) {
      const startShield = computeEnemyStartingShield(enemy, enemy.loopTier || 0);
      enemy.maxShield = startShield;
      enemy.shield = startShield;
    }
    if (passiveShield > 0) shieldIntroNote += ` · Aegis Shield ×${passiveShield} active.`;
    if (enemy && (enemy.shield || 0) > 0) shieldIntroNote += ` · Foe Shield ×${enemy.shield}!`;
  }
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
    remedialDefenseBuff: false, cardAnim: null, exclusiveCastCharge: 0,
    defendCooldownTurns: 0, defendUsedThisTurn: false, defendEffectT: 0,
    exclusiveCooldownTurns: 0, exclusiveUsedThisTurn: false,
    enemyStunTurns: 0, enemyBurnTurns: 0, enemyBurnDamage: 0,
    logicReflectCharges: 0, logicReflectMult: 1.5, logicEliminateCharges: 0, logicCritArmed: false, eliminatedChoices: [],
    hintUsedThisQuestion: false, bloodHintClue: '', bloodSplatterT: 0, bloodDrops: [],
    refactorDiscountTurns: 0, rollbackGuardStacks: 0,
    asyncEchoCharges: 0, enemyRateLimitTurns: 0,
    aegisAnimT: 0, heroShieldBreakT: 0, enemyShieldBreakT: 0, stunAnimT: 0, burnAnimT: 0, logicAnimT: 0, refactorAnimT: 0, asyncAnimT: 0, allyAttackT: 0, allyLungeT: 0, allyAttackTs: [0, 0, 0], allyLungeTs: [0, 0, 0], allyTurnIndex: 0, necroCandidate: null,
    enemyDefendEffectT: 0, enemyHealTintT: 0, enemyChargeT: 0,
    enemyProjectileT: -1, enemyProjectileCharged: false, enemyImpactRingT: 0, enemyPreviewCard: null,
    heroHealFlashT: 0, heroHealTintT: 0,
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, driusAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    pendingAttack: false,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
    deathTimer: 0, enemyAttackedThisTurn: false, lastAnswerCorrect: true, missedInBattle: 0,
    feedbackCorrect: true, feedbackNotes: [], allyTurnMessage: '', enemyFollowerMessage: '',
    rewards: [], upgrades: [],
    outcomeFlags: { killRecorded: false, rewardClaimed: false, upgradeClaimed: false, necroResolved: false },
    flash: { hero: 0, enemy: 0 }, fromReview: false, newUnlocks: [],
    log: (enemy.nyrmed ? `${enemy.name} & follower Grenu block the way!` : enemy.isBoss ? `${enemy.name} blocks the way!` : `A wild ${enemy.name} appeared!`) + masteryNote + focusRelicNote + shieldIntroNote,
  });
  Sound.play(enemy.isBoss ? 'bossIntro' : 'encounter');
  Sound.music(enemy.isBoss ? 'boss' : 'battle');
  beginIntro();
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  window.ByteboundTutorial?.onBattleStarted?.(enemy);
}

function chooseCard(index) {
  if (battle.phase !== 'choose') return;
  if (multiplayerMatchActive && !mpIsMyTurn()) return;
  const id = battle.hand[index];
  const card = id && CARD_LIBRARY[id];
  if (!card) return;
  if (id === 'defend' && battle.defendCooldownTurns > 0) return;
  if (card.exclusiveActive && (hero.ultCharge || 0) < EXCLUSIVE_MIN_STREAK) return;
  const cost = typeof effectiveCardCost === 'function' ? effectiveCardCost(card, hero) : cardCost(card, hero);
  if (hero.mana < cost) return;
  if (id === 'defend') {
    battle.defendCooldownTurns = DEFEND_COOLDOWN_TURNS;
    battle.defendUsedThisTurn = true;
  }
  if (card.exclusiveActive) {
    battle.exclusiveCastCharge = Math.max(EXCLUSIVE_MIN_STREAK, Math.min(EXCLUSIVE_MAX_STREAK, Math.round(Number(hero.ultCharge) || 0)));
    hero.ultCharge = 0;
    battle.exclusiveUsedThisTurn = true;
  } else {
    battle.exclusiveCastCharge = 0;
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
    const roomDepth = typeof level !== 'undefined' ? Number(level) || 1 : 1;
    battle.question = withShuffledChoices(adaptive.nextQuestion(getActiveAcademicYear(), {
      cardId: id,
      enemy: battle.enemy,
      roomNumber: roomDepth,
    }));
    battle.fromReview = adaptive.fromReview;
  }
  battle.eliminatedChoices = [];
  battle.hintUsedThisQuestion = false;
  battle.bloodHintClue = '';
  if (!multiplayerMatchActive && (battle.logicEliminateCharges || 0) > 0 && battle.question?.choices?.length === 4) {
    battle.logicEliminateCharges--;
    const wrongIdxs = [0, 1, 2, 3].filter((idx) => idx !== battle.question.answer);
    battle.eliminatedChoices = shuffle(wrongIdxs).slice(0, 2);
  }
  battle.phase = 'question';
  renderQuestion();
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
}

function answerQuestion(index) {
  if (battle.phase !== 'question') return;
  if (!multiplayerMatchActive && Array.isArray(battle.eliminatedChoices) && battle.eliminatedChoices.includes(index)) return;
  battle.eliminatedChoices = [];
  battle.hintUsedThisQuestion = false;
  battle.bloodHintClue = '';
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
  const rollbackSaved = !correct && (battle.rollbackGuardStacks || 0) > 0;
  let chargeNote = '';
  if (rollbackSaved) {
    battle.rollbackGuardStacks--;
    adaptive.record(false);
    battle.missedInBattle = (battle.missedInBattle || 0) + 1;
  } else {
    stats.streak = correct ? stats.streak + 1 : 0;
    recordAchievementProgress('bestStreak', stats.streak);
    chargeNote = updateExclusiveChargeOnAnswer(correct, Boolean(CARD_LIBRARY[battle.card]?.exclusiveActive));
    adaptive.record(correct);
    if (!correct) {
      battle.missedInBattle = (battle.missedInBattle || 0) + 1;
    }
  }
  if (typeof window !== 'undefined') {
    window.ByteboundQuests?.onQuestionAnswered?.({
      question: q,
      correct,
      fromReview: Boolean(battle.fromReview),
      difficulty: q?.difficulty || QUESTION_DIFFICULTY?.get?.(q?.q) || '',
      source: battle.fromReview ? 'review' : 'combat',
    });
  }
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
    // Performance & difficulty scaling: harder questions and streaks restore more HP and MP.
    const qScale = getQuestionDifficultyScale(q?.difficulty);
    const profile = adaptive.getAdaptiveCombatProfile();
    const baseHeal = 4 + 2 * Math.min(stats.streak, 5) + hero.bonusHeal + (qScale.bonusHp || 0);
    const heal = Math.round(baseHeal * (profile.recoveryMult || 1));
    const mpFocusGain = (qScale.bonusMp || 5) + hero.bonusMana;
    const previousHp = hero.hp;
    const previousMana = hero.mana;
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    hero.mana = Math.min(hero.maxMana, hero.mana + mpFocusGain);
    const actualHeal = hero.hp - previousHp;
    const actualManaGain = hero.mana - previousMana;
    showHealFeedback(actualHeal, { offsetX: 58, y: HERO_SPOT.y - 78 });
    if (actualManaGain > 0) {
      popup('hero', `+${actualManaGain} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 54, style: 'heal' });
    }
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 14, 2.5);
    const tierNote = qScale.bonusMp > 5 ? ` · ${String(q?.difficulty || 'medium').toUpperCase()} bonus` : '';
    notes.push(`Focus restores ${heal} HP and ${mpFocusGain} mana (streak ${stats.streak}${tierNote}).`);
    if (chargeNote) notes.push(chargeNote);
  } else if (rollbackSaved) {
    notes.push('Saved for review.');
    const prevHp = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + 6);
    if (hero.hp > prevHp) showHealFeedback(hero.hp - prevHp, { offsetX: 58, y: HERO_SPOT.y - 78 });
    battle.refactorAnimT = Math.max(battle.refactorAnimT || 0, 26);
    popup('hero', 'ROLLBACK GUARD!', '#45c9a8', { offsetX: 0, y: HERO_SPOT.y - 104 });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 72, '#45c9a8', 18, 3.2);
    battle.enemyAttackedThisTurn = true;
    notes.push(`Rollback Guard caught the exception! Streak (${stats.streak}) & Exclusive charge preserved, counter blocked (+6 HP).`);
  } else {
    notes.push('Saved for review.');
    if (chargeNote) notes.push(chargeNote);
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
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  if (typeof scheduleLeaderboardRunSync === 'function') {
    scheduleLeaderboardRunSync(15000);
  }
}

function buildRemedialQuestions(count, maxYear = getActiveAcademicYear()) {
  const cap = normalizeAcademicYear(maxYear, 4);
  const picked = [];
  const usedTexts = new Set();

  // 1. Prioritize missed questions from the spaced-review queue that are eligible for the player's year.
  for (const entry of reviewQueue) {
    if (picked.length >= count) break;
    const match = typeof findQuestionByText === 'function' ? findQuestionByText(entry.text) : questionByText(entry.text);
    if (match && isQuestionEligibleForYear(match, cap) && !usedTexts.has(match.q)) {
      usedTexts.add(match.q);
      picked.push({ ...match, difficulty: QUESTION_DIFFICULTY.get(match.q) || 'medium', remedialSource: 'REVIEW DRILL' });
    }
  }

  // 2. Fill remaining slots with year-eligible foundational (easy/medium, then hard if needed) questions, preferring weaker topics.
  const weakTopics = new Set(
    Object.values(topicProgress)
      .flatMap((cat) => Object.entries(cat))
      .filter(([, entry]) => entry.attempted > 0 && entry.correct / entry.attempted < 0.75)
      .map(([name]) => name)
  );
  const easyAndMedium = [
    ...getEligibleQuestionsForDifficulty('easy', cap).map((q) => ({ ...q, difficulty: 'easy' })),
    ...getEligibleQuestionsForDifficulty('medium', cap).map((q) => ({ ...q, difficulty: 'medium' })),
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

  if (picked.length < count) {
    const hardEligible = shuffle(
      getEligibleQuestionsForDifficulty('hard', cap)
        .filter((q) => !usedTexts.has(q.q))
        .map((q) => ({ ...q, difficulty: 'hard' }))
    );
    for (const q of hardEligible) {
      if (picked.length >= count) break;
      usedTexts.add(q.q);
      picked.push({ ...q, remedialSource: 'REMEDIAL DRILL' });
    }
  }
  return picked.map((entry) => withShuffledChoices(entry));
}

function startRemedialChallenge() {
  if (battle.phase !== 'choose' || !canUseRemedialSurge()) return;
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
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
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
  applyPortraitQuestionLayout(q.choices);
  window.ByteboundTutorial?.onBattlePhaseRendered?.('remedial');
}

function answerRemedialQuestion(index) {
  if (battle.phase !== 'remedial' || !battle.remedial) return;
  const rem = battle.remedial;
  const q = rem.questions[rem.index];
  if (!q) return;
  window.ByteboundTutorial?.onRemedialAnswer?.();
  const correct = index === q.answer;
  stats.total++;
  if (correct) stats.correct++;
  recordTopicAnswer(q, correct);
  recordReview(q, correct);
  stats.streak = correct ? stats.streak + 1 : 0;
  recordAchievementProgress('bestStreak', stats.streak);
  updateExclusiveChargeOnAnswer(correct, false);
  adaptive.record(correct);
  if (!correct) {
    battle.missedInBattle = (battle.missedInBattle || 0) + 1;
  }
  if (typeof window !== 'undefined') {
    window.ByteboundQuests?.onQuestionAnswered?.({
      question: q,
      correct,
      fromReview: Boolean(battle.fromReview),
      difficulty: q?.difficulty || QUESTION_DIFFICULTY?.get?.(q?.q) || '',
      source: battle.fromReview ? 'review' : 'combat',
    });
  }
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
    if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
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
    battle.remedialDefenseBuff = true;
    battle.cardAnim = { type: 'remedial_surge', cardId: 'remedial', t: 34, duration: 34, correct: true };
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
    if (typeof window !== 'undefined') window.ByteboundQuests?.onPerfectRemedialSurge?.();
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
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  if (typeof scheduleLeaderboardRunSync === 'function') {
    scheduleLeaderboardRunSync(15000);
  }
}

function triggerCardActionAnim(cardId, correct) {
  const durations = {
    strike: 24,
    power: 36,
    quick: 22,
    heavy: 38,
    overclock: 32,
    defend: 30,
    charge: 30,
    siphon: 30,
    mend: 32,
    fortify: 30,
    kernel_aegis: 44,
    packet_lockdown: 40,
    plasma_compile: 40,
    proof_contradiction: 42,
    system_refactor: 42,
    async_cascade: 44,
  };
  const dur = durations[cardId] || 28;
  battle.cardAnim = {
    type: cardId,
    cardId,
    t: dur,
    duration: dur,
    correct: Boolean(correct),
  };
}

// Resolves the card played this turn and returns a short description of what happened.
function resolveCard(id, correct) {
  const card = CARD_LIBRARY[id];
  const qScale = (!multiplayerMatchActive && typeof getQuestionDifficultyScale === 'function')
    ? getQuestionDifficultyScale(battle.question?.difficulty)
    : { mult: 1, bonusMp: 5, bonusHp: 0, label: 'STANDARD', counterMult: 1 };
  const multTag = (!multiplayerMatchActive && qScale.mult > 1 && battle.question?.difficulty)
    ? ` [${String(battle.question.difficulty).toUpperCase()} +${Math.round((qScale.mult - 1) * 100)}%]`
    : '';
  if (card.kind === 'hit') {
    if (!correct) {
      battle.chargeCard = false;
      battle.chargeMaxT = 0;
      battle.projectileQueued = false;
      return 'Wrong answer! Your attack missed.';
    }
    const stunMult = battle.enemyStunTurns > 0 ? 1.5 : 1;
    const critMult = battle.logicCritArmed ? 2 : 1;
    const hadCrit = Boolean(battle.logicCritArmed);
    if (battle.logicCritArmed) battle.logicCritArmed = false;
    const rawDmg = Math.round((hero.attack + (hero.tempAttack || 0)) * card.power * (card.correctMult || 1) * stunMult * critMult * qScale.mult);
    const note = card.id === 'strike' ? '' : `${card.name}! `;
    if (card.manaOnCorrect) {
      const prevMp = hero.mana;
      hero.mana = Math.min(hero.maxMana, hero.mana + card.manaOnCorrect);
      if (hero.mana > prevMp) {
        popup('hero', `+${hero.mana - prevMp} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 82, style: 'heal' });
      }
    }
    const hitRes = applyEnemyHitDamage(rawDmg, battle.enemy, { isCrit: hadCrit });
    const dmg = hitRes.dmg;
    const armorNote = hitRes.mitigated > 0 ? ` (mitigated -${hitRes.mitigated} Loop Armor)` : '';
    const pierceNote = hitRes.pierced > 0 && hitRes.mitigated <= 0 ? ` (pierced ${hitRes.pierced} Armor)` : '';
    const hitSummary = hitRes.shielded
      ? (hitRes.broken ? `${note}Attack shattered Enemy Shield!` : `${note}Attack cracked 1 Shield (${hitRes.remaining} left)!`)
      : `${note}You hit for ${dmg}${hadCrit ? ' [2× LOGICAL CRIT]' : ''}${armorNote}${pierceNote}.`;
    let echoNote = '';
    if (!multiplayerMatchActive && (battle.asyncEchoCharges || 0) > 0 && battle.enemy && !battle.enemy.isMultiplayerPlayer && battle.enemy.hp > 0) {
      battle.asyncEchoCharges--;
      const echoRes = applyEnemyHitDamage(Math.max(1, Math.round(rawDmg * 0.75)), battle.enemy, {
        popupTag: 'ECHO',
        popupColor: '#f075b4',
        popupOpts: { offsetX: 34, y: FOE_SPOT.y - 98 },
      });
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 68, '#f075b4', 12, 2.8);
      echoNote = echoRes.shielded
        ? (echoRes.broken ? ' + Async Echo (Shield Broken)!' : ` + Async Echo (-1 Shield, ${echoRes.remaining} left)!`)
        : ` + Async Echo (${echoRes.dmg} DMG)!`;
    }
    battle.pendingAttack = false;
    const chargedAttack = battle.chargeCard;
    battle.lungeT = chargedAttack ? 0 : 1;
    battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
    battle.projectileCharged = chargedAttack;
    battle.projectileQueued = chargedAttack;
    battle.projectileT = chargedAttack ? -1 : 0;
    battle.projectileDamage = 0;
    triggerCardActionAnim(card.id, true);
    if (card.id === 'power' && !document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.85);
    }
    return `${hitSummary}${echoNote}${multTag}`;
  }
  if (card.kind === 'defend') {
    battle.block = correct ? 0.75 : 0.25;
    let echoDefNote = '';
    if (correct && !multiplayerMatchActive && (battle.asyncEchoCharges || 0) > 0) {
      battle.asyncEchoCharges--;
      battle.tempDefense = (battle.tempDefense || 0) + 3;
      popup('hero', '+3 DEF ECHO', '#f075b4', { offsetX: 46, y: HERO_SPOT.y - 68 });
      echoDefNote = ' + Async Echo (+3 DEF)!';
    }
    triggerCardActionAnim(card.id, correct);
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
    return correct ? `Guard up: you block 75% of the next hit.${echoDefNote}` : 'Shaky guard: you block 25% of the next hit.';
  }
  if (card.kind === 'charge') {
    let gain = correct ? Math.round(25 * qScale.mult) : 10;
    let echoNote = '';
    if (correct && !multiplayerMatchActive && (battle.asyncEchoCharges || 0) > 0) {
      battle.asyncEchoCharges--;
      const bonus = Math.max(1, Math.round(gain * 0.75));
      gain += bonus;
      echoNote = ` (+${bonus} Echo!)`;
    }
    const prevMp = hero.mana;
    hero.mana = Math.min(hero.maxMana, hero.mana + gain);
    triggerCardActionAnim(card.id, correct);
    popup('hero', `+${hero.mana - prevMp || gain} MP`, echoNote ? '#f075b4' : '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 70, style: 'heal' });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#7ef0a2', 14, 2);
    Sound.play('charge');
    return `You charge ${gain} mana.${echoNote}${correct ? multTag : ''}`;
  }
  if (card.kind === 'heal') {
    let heal = correct ? Math.round((card.heal + hero.bonusHeal) * qScale.mult) : 2;
    let echoNote = '';
    if (correct && !multiplayerMatchActive && (battle.asyncEchoCharges || 0) > 0) {
      battle.asyncEchoCharges--;
      const bonus = Math.max(1, Math.round(heal * 0.75));
      heal += bonus;
      echoNote = ` (+${bonus} Echo!)`;
    }
    const previousHp = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    const healed = hero.hp - previousHp;
    triggerCardActionAnim(card.id, correct);
    showHealFeedback(healed, { offsetX: -60, y: HERO_SPOT.y - 62 });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#7fd49a', 12, 2);
    Sound.play('heal');
    return `${card.name} restores ${healed} HP.${echoNote}${correct ? multTag : ''}`;
  }
  if (card.kind === 'mana') {
    let gain = correct ? Math.round(card.gain * qScale.mult) : 2;
    let echoNote = '';
    if (correct && !multiplayerMatchActive && (battle.asyncEchoCharges || 0) > 0) {
      battle.asyncEchoCharges--;
      const bonus = Math.max(1, Math.round(gain * 0.75));
      gain += bonus;
      echoNote = ` (+${bonus} Echo!)`;
    }
    const prevMp = hero.mana;
    hero.mana = Math.min(hero.maxMana, hero.mana + gain);
    triggerCardActionAnim(card.id, correct);
    popup('hero', `+${hero.mana - prevMp || gain} MP`, echoNote ? '#f075b4' : '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 70, style: 'heal' });
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#7ef0a2', 12, 2);
    let chipNote = '';
    if (correct && card.chipPower && battle.enemy && !battle.enemy.isMultiplayerPlayer) {
      const chipRes = applyEnemyHitDamage(Math.max(1, Math.round((hero.attack + (hero.tempAttack || 0)) * card.chipPower * qScale.mult)), battle.enemy);
      battle.lungeT = 1;
      battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
      chipNote = chipRes.shielded
        ? ` & cracks 1 Shield (${chipRes.remaining} left)`
        : ` & deals ${chipRes.dmg} DMG`;
    }
    Sound.play('charge');
    return `${card.name} restores ${gain} mana${chipNote}.${echoNote}${correct ? multTag : ''}`;
  }
  if (card.kind === 'buff') {
    let bonus = correct ? card.defense : 1;
    let echoNote = '';
    if (correct && !multiplayerMatchActive && (battle.asyncEchoCharges || 0) > 0) {
      battle.asyncEchoCharges--;
      const extraDef = Math.max(1, Math.round(bonus * 0.75));
      bonus += extraDef;
      echoNote = ` (+${extraDef} Echo DEF!)`;
    }
    battle.tempDefense += bonus;
    let mpNote = '';
    if (correct && card.manaOnCorrect) {
      const prevMp = hero.mana;
      hero.mana = Math.min(hero.maxMana, hero.mana + card.manaOnCorrect);
      if (hero.mana > prevMp) {
        popup('hero', `+${hero.mana - prevMp} MP`, '#7ef0a2', { offsetX: -56, y: HERO_SPOT.y - 70, style: 'heal' });
      }
      mpNote = ` and +${card.manaOnCorrect} MP`;
    }
    triggerCardActionAnim(card.id, correct);
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 70, '#c9b6ff', 12, 2);
    Sound.play('block');
    return `${card.name}: +${bonus} defense for this battle${mpNote}.${echoNote}`;
  }
  if (card.kind === 'aegis') {
    const chargeInfo = getExclusiveChargeMult(battle.exclusiveCastCharge);
    battle.exclusiveCastCharge = 0;
    if (!correct) {
      return `Wrong answer! ${card.name} failed to activate.`;
    }
    const rank = Math.max(1, skillProgress.computerSystems?.ranks?.kernelAegis || 1);
    const m = chargeInfo.mult * qScale.mult;
    const shieldCap = Math.min(MAX_SHIELD_CHARGES, rank + 2);
    const atkSurge = Math.round(4 * rank * chargeInfo.mult);
    const defSurge = Math.round(3 * rank * chargeInfo.mult);
    hero.maxShield = Math.max(hero.maxShield || 0, shieldCap);
    hero.shield = shieldCap;
    const prevHp = hero.hp;
    hero.hp = hero.maxHp;
    const mpGain = Math.min(hero.maxMana - hero.mana, Math.round(40 * m));
    hero.mana += mpGain;
    hero.tempAttack = (hero.tempAttack || 0) + atkSurge;
    battle.tempDefense += defSurge;
    battle.aegisAnimT = 56;
    triggerCardActionAnim(card.id, true);
    let aegisHitNote = '';
    if (battle.enemy && battle.enemy.hp > 0) {
      const shockRes = applyEnemyHitDamage(Math.round(35 * rank * m), battle.enemy, {
        popupTag: 'AEGIS',
        popupColor: '#ffe07a',
      });
      battle.flash.enemy = Math.max(battle.flash.enemy, 10);
      battle.hitT = Math.max(battle.hitT, 0.9);
      emitFx(FOE_SPOT.x, FOE_SPOT.y - 76, '#ffe07a', 22, 4);
      aegisHitNote = shockRes.shielded ? 'Cracked Enemy Shield' : `${shockRes.dmg} Aegis DMG`;
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.7);
    }
    popup('hero', `AEGIS SHIELD ×${shieldCap}!`, '#72f5ff');
    if (hero.hp > prevHp) showHealFeedback(hero.hp - prevHp, { offsetX: 58, y: HERO_SPOT.y - 78 });
    popup('hero', `+${atkSurge} ATK / +${defSurge} DEF`, '#ffe07a');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#72f5ff', 26, 4.2);
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#ffe07a', 18, 3.2);
    Sound.play('block');
    const tierNote = chargeInfo.tier >= 2 ? ` [${chargeInfo.tag}]` : '';
    return `${card.name} (R${rank})${tierNote}! Aegis Shield ×${shieldCap} + Full HP + ${mpGain} MP${aegisHitNote ? ` + ${aegisHitNote}` : ''} + ${atkSurge} ATK/${defSurge} DEF!`;
  }
  if (card.kind === 'stun') {
    const chargeInfo = getExclusiveChargeMult(battle.exclusiveCastCharge);
    battle.exclusiveCastCharge = 0;
    if (!correct) {
      return `Wrong answer! ${card.name} missed.`;
    }
    const rank = Math.max(1, skillProgress.networkingSecurity?.ranks?.packetLockdown || 1);
    const m = chargeInfo.mult * qScale.mult;
    const stunTurns = Math.round((8 + (rank - 1) * 2) * chargeInfo.mult);
    battle.enemyStunTurns = stunTurns;
    const mpGain = Math.min(hero.maxMana - hero.mana, Math.round(20 * m));
    hero.mana += mpGain;
    battle.stunAnimT = 50;
    triggerCardActionAnim(card.id, true);
    battle.flash.enemy = 10;
    let breachNote = '';
    if (battle.enemy && battle.enemy.hp > 0) {
      const breachRes = applyEnemyHitDamage(Math.round(40 * rank * m), battle.enemy, {
        popupTag: 'BREACH',
        popupColor: '#6fe3e8',
      });
      battle.hitT = Math.max(battle.hitT, 0.9);
      breachNote = breachRes.shielded ? `Cracked 1 Shield (${breachRes.remaining} left)` : `${breachRes.dmg} DMG`;
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.75);
    }
    popup('enemy', `STUNNED ${battle.enemyStunTurns}t!`, '#6fe3e8');
    if (mpGain > 0) popup('hero', `+${mpGain} MP`, '#6fe3e8');
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#6fe3e8', 28, 4.5);
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#e8fbff', 16, 3.2);
    Sound.play('heavy');
    const tierNote = chargeInfo.tier >= 2 ? ` [${chargeInfo.tag}]` : '';
    return `${card.name} (R${rank})${tierNote}: ${breachNote}, ${battle.enemy.name} STUNNED ${battle.enemyStunTurns}t (1.5x Vulnerable) + ${mpGain} MP!`;
  }
  if (card.kind === 'burn_hit') {
    const chargeInfo = getExclusiveChargeMult(battle.exclusiveCastCharge);
    battle.exclusiveCastCharge = 0;
    if (!correct) {
      battle.chargeCard = false;
      battle.chargeMaxT = 0;
      battle.projectileQueued = false;
      return `Wrong answer! ${card.name} fizzled out.`;
    }
    const rank = Math.max(1, skillProgress.programming?.ranks?.overburnExecution || 1);
    const m = chargeInfo.mult * qScale.mult;
    const baseDmg = 100 + (rank - 1) * 50;
    const passiveAndBuffBonus = (Math.max(0, (hero.attack || 12) - 12) + (hero.tempAttack || 0)) * 2;
    const isExecute = battle.enemy && battle.enemy.hp <= battle.enemy.maxHp * 0.4;
    battle.enemyBurnTurns = 5;
    battle.enemyBurnDamage = Math.round(20 * rank * m);
    battle.burnAnimT = 52;
    triggerCardActionAnim(card.id, true);
    const burnRes = applyEnemyHitDamage(Math.round((baseDmg + passiveAndBuffBonus) * m * (isExecute ? 1.5 : 1)), battle.enemy, {
      popupColor: '#ff9659',
    });
    battle.pendingAttack = false;
    battle.lungeT = 0;
    battle.heroAttackT = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER;
    battle.projectileCharged = true;
    battle.projectileQueued = false;
    battle.projectileT = 0;
    battle.projectileDamage = 0;
    emitFx(HERO_SPOT.x + 60, HERO_SPOT.y - 90, '#ff7b47', 16, 3.4);
    Sound.play('heavy');
    const tierNote = chargeInfo.tier >= 2 ? ` [${chargeInfo.tag}]` : '';
    const burnHitText = burnRes.shielded ? `Cracked Shield (${burnRes.remaining} left)` : `${burnRes.dmg} DMG`;
    return `${card.name} (R${rank})${tierNote}${isExecute ? ' [EXECUTE!]' : ''}! ${burnHitText} + ${battle.enemyBurnDamage}/turn Burning (${battle.enemyBurnTurns}t).`;
  }
  if (card.kind === 'logic_proof') {
    const chargeInfo = getExclusiveChargeMult(battle.exclusiveCastCharge);
    battle.exclusiveCastCharge = 0;
    if (!correct) {
      return `Wrong answer! ${card.name} premise rejected.`;
    }
    const rank = Math.max(1, skillProgress.discreteMath?.ranks?.proofContradiction || 1);
    const m = chargeInfo.mult * qScale.mult;
    const reflectAdd = rank >= 2 ? 2 : 1;
    const elimAdd = rank + (chargeInfo.tier >= 3 ? 1 : 0);
    battle.logicReflectCharges = (battle.logicReflectCharges || 0) + reflectAdd;
    battle.logicReflectMult = Number((1.5 * chargeInfo.mult).toFixed(2));
    battle.logicEliminateCharges = (battle.logicEliminateCharges || 0) + elimAdd;
    battle.logicCritArmed = true;
    battle.logicAnimT = 50;
    triggerCardActionAnim(card.id, true);
    let logicHitNote = '0 DMG';
    if (battle.enemy && battle.enemy.hp > 0 && !battle.enemy.isMultiplayerPlayer) {
      const deductRes = applyEnemyHitDamage(Math.round(35 * rank * m), battle.enemy, {
        popupTag: 'LOGIC',
        popupColor: '#9d8cff',
      });
      battle.flash.enemy = Math.max(battle.flash.enemy, 10);
      battle.hitT = Math.max(battle.hitT, 0.85);
      logicHitNote = deductRes.shielded ? `Cracked Shield (${deductRes.remaining} left)` : `${deductRes.dmg} DMG`;
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.7);
    }
    popup('hero', `REFLECT ×${battle.logicReflectCharges} · 2× CRIT`, '#9d8cff');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 80, '#9d8cff', 24, 4);
    Sound.play('unlock');
    const tierNote = chargeInfo.tier >= 2 ? ` [${chargeInfo.tag}]` : '';
    return `${card.name} (R${rank})${tierNote}! ${logicHitNote} + Reflect ${reflectAdd} hit(s) (${battle.logicReflectMult}×) + ${elimAdd} 50/50 hints + 2× Crit armed!`;
  }
  if (card.kind === 'refactor') {
    const chargeInfo = getExclusiveChargeMult(battle.exclusiveCastCharge);
    battle.exclusiveCastCharge = 0;
    if (!correct) {
      return `Wrong answer! ${card.name} merge conflicted.`;
    }
    const rank = Math.max(1, skillProgress.softwareEng?.ranks?.systemRefactor || 1);
    const m = chargeInfo.mult * qScale.mult;
    const deckLen = Array.isArray(runDeck) ? runDeck.length : 5;
    const discTurns = 2 + (rank >= 2 ? 1 : 0) + (chargeInfo.tier >= 3 ? 1 : 0);
    const guardAdd = (rank >= 3 ? 2 : 1) + (chargeInfo.tier >= 3 ? 1 : 0);
    battle.refactorDiscountTurns = Math.max(battle.refactorDiscountTurns || 0, discTurns);
    battle.defendCooldownTurns = 0;
    battle.rollbackGuardStacks = (battle.rollbackGuardStacks || 0) + guardAdd;
    battle.refactorAnimT = 50;
    triggerCardActionAnim(card.id, true);
    let refactorHitNote = '0 DMG';
    if (battle.enemy && battle.enemy.hp > 0 && !battle.enemy.isMultiplayerPlayer) {
      const archRes = applyEnemyHitDamage(Math.round((45 * rank + deckLen * 4) * m), battle.enemy, {
        popupTag: 'REFACTOR',
        popupColor: '#45c9a8',
      });
      battle.flash.enemy = Math.max(battle.flash.enemy, 10);
      battle.hitT = Math.max(battle.hitT, 0.85);
      refactorHitNote = archRes.shielded ? `Cracked Shield (${archRes.remaining} left)` : `${archRes.dmg} DMG`;
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.7);
    }
    popup('hero', `50% MP (${battle.refactorDiscountTurns}t) · ROLLBACK ×${battle.rollbackGuardStacks}`, '#45c9a8');
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 78, '#45c9a8', 24, 4);
    Sound.play('charge');
    const tierNote = chargeInfo.tier >= 2 ? ` [${chargeInfo.tag}]` : '';
    return `${card.name} (R${rank})${tierNote}! ${refactorHitNote} + 50% MP costs (${battle.refactorDiscountTurns}t) + Defend CD reset + Rollback Guard ×${guardAdd}!`;
  }
  if (card.kind === 'async_burst') {
    const chargeInfo = getExclusiveChargeMult(battle.exclusiveCastCharge);
    battle.exclusiveCastCharge = 0;
    if (!correct) {
      return `Wrong answer! ${card.name} Promise rejected.`;
    }
    const rank = Math.max(1, skillProgress.webMobile?.ranks?.asyncCascade || 1);
    const m = chargeInfo.mult * qScale.mult;
    const rawPerHit = Math.round((22 * rank + Math.round((hero.attack + (hero.tempAttack || 0)) * 0.55)) * m);
    const echoAdd = rank >= 3 ? 2 : 1;
    const rlTurns = 2 + rank + (chargeInfo.tier >= 2 ? 1 : 0);
    battle.asyncEchoCharges = (battle.asyncEchoCharges || 0) + echoAdd;
    battle.enemyRateLimitTurns = Math.max(battle.enemyRateLimitTurns || 0, rlTurns);
    battle.asyncAnimT = 52;
    triggerCardActionAnim(card.id, true);
    let totalHpDmg = 0;
    let shieldsCracked = 0;
    let hpHits = 0;
    if (battle.enemy && battle.enemy.hp > 0 && !battle.enemy.isMultiplayerPlayer) {
      const popOffsets = [
        { offsetX: -28, y: FOE_SPOT.y - 68 },
        { offsetX: 8, y: FOE_SPOT.y - 96 },
        { offsetX: 38, y: FOE_SPOT.y - 122 },
      ];
      for (let h = 0; h < 3; h++) {
        if (battle.enemy.hp <= 0) break;
        const r = applyEnemyHitDamage(rawPerHit, battle.enemy, {
          popupTag: `ASYNC #${h + 1}`,
          popupColor: h % 2 === 0 ? '#f075b4' : '#6fe3e8',
          popupOpts: popOffsets[h],
        });
        if (r.shielded) shieldsCracked++;
        else {
          hpHits++;
          totalHpDmg += r.dmg;
        }
      }
      battle.flash.enemy = Math.max(battle.flash.enemy, 12);
      battle.hitT = Math.max(battle.hitT, 0.95);
    }
    if (!document.body.classList.contains('reduce-motion')) {
      battle.cameraShakeT = Math.max(battle.cameraShakeT, 0.8);
    }
    popup('hero', `ECHO ×${battle.asyncEchoCharges}`, '#f075b4');
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 80, '#f075b4', 28, 4.4);
    Sound.play('heavy');
    const tierNote = chargeInfo.tier >= 2 ? ` [${chargeInfo.tag}]` : '';
    const asyncHitParts = [];
    if (shieldsCracked > 0) asyncHitParts.push(`cracked ${shieldsCracked} Shield${shieldsCracked === 1 ? '' : 's'}`);
    if (hpHits > 0) asyncHitParts.push(`${hpHits}× (${totalHpDmg}) DMG`);
    return `${card.name} (R${rank})${tierNote}! ${asyncHitParts.join(' + ') || '3-Hit Burst'} + Async Echo ×${echoAdd} (+75%) + Rate-Limit (${rlTurns}t)!`;
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
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  if (typeof submitLeaderboardRun === 'function') submitLeaderboardRun();
}

function performSingleAllyAttack(allyIndex = 0) {
  const allies = getNecroAllies();
  const ally = allies[allyIndex];
  const foe = battle.enemy;
  if (!ally || !foe || foe.hp <= 0) return { killed: false, msg: '' };
  const hitRes = applyEnemyHitDamage(Math.max(6, Math.round(ally.attack || 10)), foe, {
    popupTag: ally.name.toUpperCase(),
    popupColor: '#c77dff',
  });
  const dmg = hitRes.dmg;
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
  const msg = hitRes.shielded
    ? `${ally.name} (Undead Ally ${allyIndex + 1}/${allies.length}) ${hitRes.broken ? `shattered ${foe.name}'s Shield!` : `cracked ${foe.name}'s Shield (${hitRes.remaining} left)!`}`
    : `${ally.name} (Undead Ally ${allyIndex + 1}/${allies.length}) strikes ${foe.name} for ${dmg} DMG!`;
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
  battle.allyTurnIndex = allyIndex;
  battle.allyTurnMessage = msg || '';
  battle.phase = 'ally_turn';
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><span class="ally-turn-pill">ALLY ${allyIndex + 1} / ${allies.length} TURN</span> <strong>${esc(battle.allyTurnMessage)}</strong></p>
      </div>
      <button data-act="ally-continue">${allyIndex + 1 < allies.length ? 'Next Ally' : 'Enemy Turn'}<span class="keyhint"> (Enter)</span></button>
    </div>`);
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
}

function performEnemyFollowerAttack() {
  const follower = battle.enemyFollower;
  const foe = battle.enemy;
  if (!follower || follower.hp <= 0 || !foe || foe.hp <= 0) return '';
  follower.lungeT = 1;
  if ((hero.shield || 0) > 0) {
    const shieldRes = consumeHeroShield(follower.name);
    battle.log = shieldRes.msg;
    return shieldRes.msg;
  }
  let dmg = Math.max(1, Math.round((follower.attack || 11) - hero.defense - battle.tempDefense));
  if (hero.runInvincible || battle.heroHitT > 0) dmg = 0;
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
  battle.enemyFollowerMessage = msg || '';
  battle.phase = 'enemy_follower_turn';
  setPanel(`<div class="battle-feedback-row">
      <div class="battle-feedback-copy">
        <p><span class="enemy-follower-pill">EXTRA ENEMY TURN // GRENU</span> <strong>${esc(battle.enemyFollowerMessage)}</strong></p>
      </div>
      <button data-act="enemy-follower-continue">Your Turn<span class="keyhint"> (Enter)</span></button>
    </div>`);
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
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
  if (!battle.exclusiveUsedThisTurn && (battle.refactorDiscountTurns || 0) > 0) {
    battle.refactorDiscountTurns--;
  }
  battle.exclusiveUsedThisTurn = false;
  battle.phase = 'choose';
  fillHand();
  renderBattle();
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
}

function finishTurnAfterAllies() {
  if (!battle.enemyAttackedThisTurn) {
    performEnemyAttack({ fromWrongAnswer: false });
    if (hero.hp <= 0 || battle.phase === 'dying') return;
    if (battle.enemy && battle.enemy.hp <= 0) return winBattle();
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

function triggerEnemyAttackAnim(foe, heavy) {
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
    battle.enemyLungeT = 0;
    battle.enemyLungeDistance = 0;
    battle.driusAttackT = (typeof DRIUS_ATTACK_FRAMES_COUNT !== 'undefined' ? DRIUS_ATTACK_FRAMES_COUNT : 10) * (typeof DRIUS_ATTACK_BUFFER !== 'undefined' ? DRIUS_ATTACK_BUFFER : 3);
  } else {
    battle.enemyLungeT = 1;
    battle.enemyLungeDistance = heavy ? 235 : 185;
  }
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
  // Counter damage scales smoothly with enemy attack, question difficulty, and Comeback Assist.
  const heavy = isHeavy();
  const qScale = (!multiplayerMatchActive && typeof getQuestionDifficultyScale === 'function')
    ? getQuestionDifficultyScale(battle.question?.difficulty)
    : { counterMult: 1 };
  const adaptiveProfile = (!multiplayerMatchActive && typeof adaptive?.getAdaptiveCombatProfile === 'function')
    ? adaptive.getAdaptiveCombatProfile()
    : { enemyDmgMult: 1 };
  let dmg = fromWrongAnswer
    ? Math.max(Math.round(foe.attack * 1.15), Math.round(foe.attack * (heavy ? 1.85 : 1.45) - hero.defense - battle.tempDefense))
    : Math.max(1, Math.round(foe.attack * (heavy ? 1.7 : 1) - hero.defense - battle.tempDefense));
  if ((battle.enemyRateLimitTurns || 0) > 0) {
    dmg = Math.max(1, Math.round(dmg * 0.6));
    battle.enemyRateLimitTurns--;
    popup('enemy', 'RATE-LIMITED', '#f075b4');
  }
  dmg = Math.max(1, Math.round(dmg * (fromWrongAnswer ? (qScale.counterMult || 1) : 1) * (adaptiveProfile.enemyDmgMult || 1) * (1 - battle.block)));
  if (!fromWrongAnswer && (battle.logicReflectCharges || 0) > 0) {
    battle.logicReflectCharges--;
    const reflectRes = applyEnemyHitDamage(Math.max(10, Math.round(Math.max(1, dmg) * (battle.logicReflectMult || 1.5))), foe, {
      popupTag: 'CONTRADICTION',
      popupColor: '#9d8cff',
    });
    battle.logicAnimT = Math.max(battle.logicAnimT || 0, 36);
    battle.flash.enemy = Math.max(battle.flash.enemy, 10);
    battle.hitT = Math.max(battle.hitT, 0.85);
    popup('hero', 'REFLECT!', '#9d8cff');
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 76, '#9d8cff', 20, 3.8);
    Sound.play('block');
    battle.block = 0;
    foe.turns++;
    battle.log = reflectRes.shielded
      ? `Proof by Contradiction! Negated ${foe.name}'s attack and ${reflectRes.broken ? 'shattered their Shield!' : `cracked 1 Shield (${reflectRes.remaining} left)!`}`
      : `Proof by Contradiction! Negated ${foe.name}'s attack and reflected ${reflectRes.dmg} DMG!`;
    return;
  }
  if ((hero.shield || 0) > 0) {
    triggerEnemyAttackAnim(foe, heavy);
    const shieldRes = consumeHeroShield(foe.name, { fromWrongAnswer });
    battle.block = 0;
    foe.turns++;
    battle.log = shieldRes.msg;
    return;
  }
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
  triggerEnemyAttackAnim(foe, heavy);
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
    const burnDmg = applyLoopEnemyMitigation(battle.enemyBurnDamage || 10, battle.enemy).dmg;
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
  if (!battle.outcomeFlags) {
    battle.outcomeFlags = { killRecorded: false, rewardClaimed: false, upgradeClaimed: false, necroResolved: false };
  }
  if (battle.enemy) battle.enemy.alive = false;
  if (!battle.outcomeFlags.killRecorded) {
    battle.outcomeFlags.killRecorded = true;
    const before = unlockedCardIds(getAchievementMetrics());
    stats.kills++;
    stats.roomKills++;
    if (typeof enemies !== 'undefined' && Array.isArray(enemies) && enemies.length && enemies.every((e) => !e.alive) && typeof clearedRooms !== 'undefined' && typeof level !== 'undefined') {
      clearedRooms.add(level);
    }
    recordAchievementProgress('kills', 1);
    if (battle.enemy?.isBoss) recordAchievementProgress('bosses', 1);
    if (typeof window !== 'undefined') {
      window.ByteboundQuests?.onBattleWon?.({
        enemy: battle.enemy,
        roomLevel: typeof level !== 'undefined' ? level : 1,
        clearedRooms: typeof clearedRooms !== 'undefined' ? clearedRooms : null,
        flawless: (battle.missedInBattle || 0) === 0,
      });
    }
    battle.newUnlocks = unlockedCardIds(getAchievementMetrics())
      .filter((id) => !before.includes(id) && !CARD_LIBRARY[id].start);
    Sound.play(battle.enemy?.isBoss ? 'bossWin' : 'win');
    if (typeof submitLeaderboardRun === 'function') submitLeaderboardRun();
  }
  if (!multiplayerMatchActive && !battle.outcomeFlags.necroResolved && hasNecromancyUnlocked() && battle.enemy) {
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
      if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
      return;
    }
    battle.outcomeFlags.necroResolved = true;
    battle.log = `Necromancy capacity full (${allies.length}/${maxAllies}) — upgrade Necromancy in Skill Tree to raise more allies.`;
  }
  renderWin();
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
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
  if (battle.outcomeFlags?.rewardClaimed) {
    afterReward();
    return;
  }
  renderCardReward();
}

function pickReward(index) {
  const id = battle.rewards[index];
  if (battle.phase !== 'reward' || !id) return;
  if (battle.outcomeFlags?.rewardClaimed) {
    afterReward();
    return;
  }
  if (!battle.outcomeFlags) {
    battle.outcomeFlags = { killRecorded: true, rewardClaimed: false, upgradeClaimed: false, necroResolved: true };
  }
  battle.outcomeFlags.rewardClaimed = true;
  window.ByteboundTutorial?.onRewardCardPicked?.(index, id);
  runDeck.push(id);
  stats.cardsTaken++;
  battle.rewards = [];
  Sound.play('pick');
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  afterReward();
}

function afterReward() {
  if (stats.kills > 0 && stats.kills % 2 === 0 && !battle.outcomeFlags?.upgradeClaimed) return renderUpgrades();
  exitBattle();
}

function applyUpgrade(i) {
  const up = battle.upgrades[i];
  if (battle.phase !== 'upgrade' || !up) return;
  if (battle.outcomeFlags?.upgradeClaimed) {
    exitBattle();
    return;
  }
  if (!battle.outcomeFlags) {
    battle.outcomeFlags = { killRecorded: true, rewardClaimed: true, upgradeClaimed: false, necroResolved: true };
  }
  battle.outcomeFlags.upgradeClaimed = true;
  window.ByteboundTutorial?.onUpgradePicked?.(i, up);
  up.apply();
  stats.upgrades.push(up.name);
  battle.upgrades = [];
  recordAchievementProgress('upgrades', 1);
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  exitBattle(`Upgrade gained: ${up.name}. ${up.text}.`);
}

function exitBattle(msg) {
  mode = 'explore';
  grace = 90;
  resetRuntimeBattleState();
  renderExplore(msg);
  Sound.music('explore');
  if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
  gsap.killTweensOf(overlay);
  gsap.fromTo(overlay, { opacity: 0.8 }, { opacity: 0, duration: 0.5 });
}

function retryRoom() {
  hideGameOverOverlay();
  resetRuntimeBattleState();
  hero.hp = Math.max(1, Math.round(hero.maxHp / 2));
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
  const eligible = getAllEligibleQuestions(mpState.yearLevel || 4);
  const fallback = eligible[0] || {
    q: 'What does CPU stand for?',
    choices: ['Central Processing Unit', 'Computer Power Unit', 'Core Program Utility', 'Control Processing Unit'],
    answer: 0,
    explain: 'CPU stands for Central Processing Unit.',
    category: 'Computer Systems',
    topic: 'Computer Fundamentals',
    year: 1,
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
    yearLevel: normalizeAcademicYear(matchConfig.yearLevel, 4),
    role: selfRole,
    selfClientId: selfClientId || selfSlot.clientId || null,
    selfName: selfSlot.username || (typeof activePlayerName !== 'undefined' ? activePlayerName : 'Knight'),
    selfAvatar: selfSlot.avatar || 'gold',
    selfTitleId: selfSlot.titleId || (typeof window !== 'undefined' ? window.ByteboundQuests?.getEquippedTitleId?.() || '' : ''),
    opponentClientId: oppSlot.clientId || null,
    opponentName: oppSlot.username || 'Challenger',
    opponentAvatar: oppSlot.avatar || 'cyan',
    opponentTitleId: oppSlot.titleId || (typeof window !== 'undefined' ? window.ByteboundQuests?.getPlayerTitle?.(oppSlot.username) || '' : ''),
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
    roomCleanedUp: false,
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
    remedialDefenseBuff: false, cardAnim: null,
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
    deathTimer: 0, enemyAttackedThisTurn: false, lastAnswerCorrect: true, missedInBattle: 0,
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

  if (!mpState.roomCleanedUp) {
    mpState.roomCleanedUp = true;
    window.mpUI?.matchmaking?.onMatchCompleted?.();
  }

  if (!mpState.pvpSubmitted && mpState.matchId) {
    mpState.pvpSubmitted = true;
    if (typeof window !== 'undefined') {
      window.ByteboundQuests?.onPvpMatchFinished?.({
        outcome: mpState.outcome || (won ? 'won' : draw ? 'draw' : 'lost'),
        correct: mpState.selfCorrect || 0,
        total: mpState.selfTotal || 0,
      });
    }
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

  const oppTitleHtml = (typeof window !== 'undefined' && window.ByteboundQuests?.renderTitleBadgeHtml && mpState.opponentTitleId)
    ? ` ${window.ByteboundQuests.renderTitleBadgeHtml(mpState.opponentTitleId, { compact: true })}`
    : '';
  go.classList.toggle('is-victory', won);
  go.classList.toggle('is-draw', draw);
  go.innerHTML = `<div class="game-over-box${boxClass}">
    <div class="game-over-corruption">${banner}</div>
    <div class="game-over-skull" aria-hidden="true">${won ? '♛' : (draw ? '⚔' : '☠')}</div>
    <h2 class="game-over-title" id="gameOverTitle" data-text="${title}">${title}</h2>
    <p class="game-over-killer">${esc(mpState.endReason || `Match vs ${mpState.opponentName} completed.`)}${oppTitleHtml}</p>
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
    'blood-hint': () => useBloodHint(),
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
      if (!battle.outcomeFlags) {
        battle.outcomeFlags = { killRecorded: true, rewardClaimed: false, upgradeClaimed: false, necroResolved: false };
      }
      battle.outcomeFlags.necroResolved = true;
      hideGameOverOverlay();
      battle.phase = 'won';
      renderWin();
      if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
    } else if (act === 'necro-no') {
      battle.necroCandidate = null;
      if (!battle.outcomeFlags) {
        battle.outcomeFlags = { killRecorded: true, rewardClaimed: false, upgradeClaimed: false, necroResolved: false };
      }
      battle.outcomeFlags.necroResolved = true;
      hideGameOverOverlay();
      battle.phase = 'won';
      renderWin();
      if (typeof saveCurrentRunSlot === 'function') saveCurrentRunSlot();
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
