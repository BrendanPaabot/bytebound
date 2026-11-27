// ===== Practice mode: study by topic without combat =====
// Answers count toward the topic tracker, skill points, and the review queue, but never cost HP.
const PRACTICE_DIFFICULTIES = ['adaptive', 'mixed', 'easy', 'medium', 'hard'];
const PRACTICE_CAT_TONES = {
  'Computer Systems': 'gold',
  'Networking & Security': 'blue',
  Programming: 'green',
  Database: 'red',
  'Discrete Mathematics': 'indigo',
  'Software Engineering': 'teal',
  'Web & Mobile Development': 'magenta',
};
const DRILL_DONE_STORAGE_KEY = 'bytebound-drill-done-v1';
const practice = {
  mode: 'menu',          // 'menu' | 'quiz' | 'done'
  source: 'all',         // 'all' | 'review' | { category, topic }
  difficulty: 'adaptive',
  categoryFilter: 'all',
  current: null,
  picked: null,
  queue: [],             // fixed snapshot of questions for the active session (never mutates mid-drill)
  queueIndex: 0,
  seen: new Set(),       // question texts answered in the current drill run
  deckTotal: 0,
  session: { correct: 0, total: 0 },
  startTiers: {},        // adaptive tier per category at session start (to highlight tier upgrades)
  sessionDifficulty: 'adaptive',
  skillNote: '',
};

function getDrillDoneStorageKey() {
  const name = typeof activePlayerName === 'string' && activePlayerName.trim()
    ? activePlayerName.trim().toLowerCase()
    : 'default';
  return `${DRILL_DONE_STORAGE_KEY}:${encodeURIComponent(name)}`;
}

function loadDrillDoneSet() {
  try {
    const raw = localStorage.getItem(getDrillDoneStorageKey());
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((t) => typeof t === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDrillDoneSet(doneSet) {
  try {
    localStorage.setItem(getDrillDoneStorageKey(), JSON.stringify([...doneSet]));
  } catch {}
}

function clearDrillDoneForPool(pool) {
  const doneSet = loadDrillDoneSet();
  for (const q of pool) doneSet.delete(q.q);
  saveDrillDoneSet(doneSet);
}

function getCategoryAdaptiveTier(category) {
  if (typeof adaptive !== 'undefined' && typeof adaptive.categoryDifficultyName === 'function') {
    return adaptive.categoryDifficultyName(category);
  }
  return 'easy';
}

function snapshotAdaptiveTiers() {
  const tiers = {};
  if (typeof topicProgress !== 'undefined') {
    for (const cat of Object.keys(topicProgress)) {
      tiers[cat] = getCategoryAdaptiveTier(cat);
    }
  }
  return tiers;
}

function questionsFor(source, difficulty, maxYear = (typeof getActiveAcademicYear === 'function' ? getActiveAcademicYear() : 4)) {
  const isEligible = (q) => (typeof isQuestionEligibleForYear === 'function' ? isQuestionEligibleForYear(q, maxYear) : true);
  const isAdaptive = difficulty === 'adaptive';
  const levels = (difficulty === 'mixed' || isAdaptive) ? DIFFICULTIES : [difficulty];
  if (source === 'review') {
    const queued = new Set(reviewQueue.map((entry) => entry.text));
    // Missed review strictly enforces the player's academic year filter so later-year items are never reintroduced.
    return DIFFICULTIES
      .flatMap((level) => QUESTION_BANK[level] || [])
      .filter((q) => queued.has(q.q) && isEligible(q));
  }
  let pool = levels
    .flatMap((level) => QUESTION_BANK[level] || [])
    .filter((q) => isEligible(q));
  if (source && typeof source === 'object') {
    pool = pool.filter((q) => q.category === source.category && q.topic === source.topic);
  }
  if (isAdaptive && typeof adaptive !== 'undefined' && typeof adaptive.categoryDifficultyName === 'function' && typeof QUESTION_DIFFICULTY !== 'undefined') {
    const adapted = pool.filter((q) => QUESTION_DIFFICULTY.get(q.q) === adaptive.categoryDifficultyName(q.category));
    if (adapted.length) return adapted;
  }
  return pool;
}

function buildOrderedQueue(items) {
  const remaining = [...items];
  const ordered = [];
  while (remaining.length) {
    const chosen = typeof pickWeighted === 'function'
      ? pickWeighted(remaining)
      : remaining[Math.floor(Math.random() * remaining.length)];
    const idx = remaining.indexOf(chosen);
    if (idx >= 0) remaining.splice(idx, 1);
    ordered.push(chosen);
  }
  return ordered;
}

function startPractice(source, { forceRedo = false } = {}) {
  practice.source = source;
  practice.seen = new Set();
  practice.session = { correct: 0, total: 0 };
  practice.current = null;
  practice.picked = null;
  practice.skillNote = '';
  practice.queue = [];
  practice.queueIndex = 0;
  practice.startTiers = snapshotAdaptiveTiers();
  practice.sessionDifficulty = source === 'review' ? 'review' : practice.difficulty;

  const pool = questionsFor(source, practice.difficulty);
  if (source === 'review') {
    // Missed review drills every year-eligible queued missed question directly.
    practice.queue = buildOrderedQueue(pool);
    practice.deckTotal = practice.queue.length;
    if (practice.deckTotal === 0) {
      practice.mode = 'empty';
      return;
    }
    practice.mode = 'quiz';
    nextPracticeQuestion();
    return;
  }

  if (pool.length === 0) {
    practice.deckTotal = 0;
    practice.mode = 'empty';
    return;
  }

  if (forceRedo && pool.length) {
    clearDrillDoneForPool(pool);
  }
  const doneSet = loadDrillDoneSet();
  const remaining = pool.filter((q) => !doneSet.has(q.q));
  if (pool.length > 0 && remaining.length === 0) {
    practice.deckTotal = pool.length;
    practice.mode = 'done';
    return;
  }
  practice.queue = buildOrderedQueue(remaining);
  practice.deckTotal = practice.queue.length;
  practice.mode = 'quiz';
  nextPracticeQuestion();
}

function nextPracticeQuestion() {
  if (practice.queueIndex >= practice.queue.length) {
    practice.current = null;
    practice.picked = null;
    practice.skillNote = '';
    if (practice.deckTotal > 0 && practice.mode !== 'done') {
      practice.mode = 'done';
      if (typeof recordAchievementProgress === 'function') {
        recordAchievementProgress('drillCompletions', 1);
      }
    }
    return;
  }
  const next = practice.queue[practice.queueIndex];
  practice.queueIndex++;
  practice.current = typeof withShuffledChoices === 'function' ? withShuffledChoices(next) : next;
  practice.picked = null;
  practice.skillNote = '';
}

function answerPractice(index) {
  const q = practice.current;
  if (!q || practice.picked !== null) return;
  const correct = index === q.answer;
  practice.picked = index;
  practice.seen.add(q.q);
  if (practice.source !== 'review') {
    const doneSet = loadDrillDoneSet();
    doneSet.add(q.q);
    saveDrillDoneSet(doneSet);
  }
  practice.session.total++;
  if (correct) practice.session.correct++;
  recordTopicAnswer(q, correct);
  recordReview(q, correct);
  if (typeof adaptive !== 'undefined' && typeof adaptive.calibrateFromProgress === 'function') {
    adaptive.calibrateFromProgress();
  }
  if (typeof recordAchievementProgress === 'function') {
    recordAchievementProgress('drillAnswers', 1);
  }
  if (correct && recordCorrectAnswer(q.category)) {
    practice.skillNote = `${q.category} skill point earned. Press U to spend it.`;
    if (typeof showSkillPointEarnedBanner === 'function') showSkillPointEarnedBanner(q.category);
    if (typeof window.syncSkillPointButtons === 'function') window.syncSkillPointButtons();
  }
  if (typeof window !== 'undefined' && window.ByteboundQuests && typeof window.ByteboundQuests.onQuestionAnswered === 'function') {
    window.ByteboundQuests.onQuestionAnswered({
      question: q,
      correct,
      fromReview: practice.mode === 'review',
      difficulty: q.difficulty || QUESTION_DIFFICULTY?.get?.(q.q) || '',
      source: practice.mode === 'review' ? 'review' : 'practice',
    });
  }
  Sound.play(correct ? 'correct' : 'wrong');
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function describeDifficultyFilter(difficulty) {
  switch (difficulty) {
    case 'adaptive':
      return 'Shows your current adaptive tier per subject (4 questions per topic). Advancing a tier unlocks 4 harder questions.';
    case 'mixed':
      return 'Shows all 12 questions per topic across Easy, Medium, and Hard.';
    case 'easy':
      return 'Shows the 4 Easy questions per topic.';
    case 'medium':
      return 'Shows the 4 Medium questions per topic.';
    case 'hard':
      return 'Shows the 4 Hard questions per topic.';
    default:
      return '';
  }
}

function renderPracticeEmpty() {
  const activeYear = typeof getActiveAcademicYear === 'function' ? getActiveAcademicYear() : 4;
  const yearLabel = typeof getAcademicYearLabel === 'function' ? getAcademicYearLabel(activeYear) : `Year ${activeYear}`;
  const isTopic = practice.source && typeof practice.source === 'object';
  const minYear = isTopic && typeof getTopicMinYear === 'function'
    ? getTopicMinYear(practice.source.category, practice.source.topic)
    : null;
  const sourceLabel = practice.source === 'all'
    ? 'All Topics'
    : practice.source === 'review'
      ? 'Missed Questions Review'
      : `${practice.source?.topic || 'Selected Topic'} (${practice.source?.category || ''})`;
  const reason = practice.source === 'review'
    ? `You have no missed questions eligible under your ${yearLabel} filter right now.`
    : (minYear !== null && minYear > activeYear)
      ? `${sourceLabel} introduces concepts starting in ${getAcademicYearLabel(minYear)}, which is excluded by your current ${yearLabel} filter.`
      : `No classified questions in ${sourceLabel} are available for your current ${yearLabel} and ${capitalize(practice.difficulty)} filter.`;
  return `<div class="practice-bar">
      <button class="practice-back" data-practice="back">Back to topics</button>
      <span class="practice-status-pill is-idle">${esc(yearLabel)} Filter</span>
    </div>
    <div class="practice-done-card practice-empty-card">
      <span class="eyebrow">No Eligible Questions</span>
      <h3>${esc(sourceLabel)}</h3>
      <p>${esc(reason)}</p>
      <div class="practice-done-actions">
        <button class="leaderboard-action" data-practice="back">Back to Available Topics</button>
        <button class="practice-back" type="button" data-open-settings="year">Request Year Change</button>
      </div>
    </div>`;
}

function renderPracticeView() {
  if (practice.mode === 'empty') return renderPracticeEmpty();
  if (practice.mode === 'done') return renderPracticeDone();
  return practice.mode === 'quiz' ? renderPracticeQuiz() : renderPracticeMenu();
}

function renderPracticeMenu() {
  const doneSet = loadDrillDoneSet();
  const activeYear = typeof getActiveAcademicYear === 'function' ? getActiveAcademicYear() : 4;
  const yearMeta = typeof getAcademicYearMeta === 'function'
    ? getAcademicYearMeta(activeYear)
    : { label: '4th Year', rangeLabel: 'All Years (1–4)', summary: '' };
  const totalEligibleAll = typeof getAllEligibleQuestions === 'function' ? getAllEligibleQuestions(activeYear).length : 0;
  const chipLabels = {
    adaptive: 'Adaptive',
    mixed: 'All 12 (Mixed)',
    easy: 'Easy (4)',
    medium: 'Medium (4)',
    hard: 'Hard (4)',
  };
  const chips = PRACTICE_DIFFICULTIES.map((difficulty) => `
    <button class="practice-chip" data-practice="difficulty" data-diff="${difficulty}" aria-pressed="${practice.difficulty === difficulty}">${chipLabels[difficulty] || capitalize(difficulty)}</button>`).join('');

  const weakList = Object.entries(topicProgress).flatMap(([category, topics]) =>
    Object.entries(topics)
      .filter(([topic, s]) => (s?.attempted || 0) >= 1 && (s.correct / s.attempted) < 0.75 && questionsFor({ category, topic }, practice.difficulty, activeYear).length > 0)
      .map(([topic, s]) => ({ category, topic, pct: Math.round((100 * s.correct) / s.attempted), s }))
  ).sort((a, b) => a.pct - b.pct);

  const weakCallout = weakList.length
    ? `<div class="practice-weak-banner">
        <div>
          <strong>Needs Practice · Weakest Topic</strong>
          <small>${esc(weakList[0].topic)} (${esc(weakList[0].category)}) · ${weakList[0].pct}% accuracy</small>
        </div>
        <button class="practice-go" data-practice="start" data-src="topic" data-category="${esc(weakList[0].category)}" data-topic="${esc(weakList[0].topic)}">Practice Now</button>
      </div>`
    : '';

  const allPool = questionsFor('all', practice.difficulty, activeYear);
  const allDoneCount = allPool.filter((q) => doneSet.has(q.q)).length;
  const allRemaining = Math.max(0, allPool.length - allDoneCount);
  const allFinished = allPool.length > 0 && allRemaining === 0;
  const eligibleReviewCount = questionsFor('review', practice.difficulty, activeYear).length;
  const isAdaptive = practice.difficulty === 'adaptive';

  const allCatKeys = Object.keys(topicProgress);
  if (practice.categoryFilter !== 'all' && !allCatKeys.includes(practice.categoryFilter)) {
    practice.categoryFilter = 'all';
  }
  const catShortNames = {
    'Computer Systems': 'Systems',
    'Networking & Security': 'Network & Sec',
    Programming: 'Programming',
    Database: 'Database',
    'Discrete Mathematics': 'Discrete Math',
    'Software Engineering': 'Software Eng',
    'Web & Mobile Development': 'Web & Mobile',
  };
  const catFilterChips = [
    `<button class="practice-chip practice-cat-chip" data-practice="catfilter" data-cat="all" aria-pressed="${practice.categoryFilter === 'all'}">All (${allCatKeys.length})</button>`,
    ...allCatKeys.map((cat) => {
      const tone = PRACTICE_CAT_TONES[cat] || 'gold';
      const hasEligibleForYear = Object.keys(topicProgress[cat] || {}).some((topicName) =>
        (typeof getEligibleTopicCount === 'function' ? getEligibleTopicCount(cat, topicName, activeYear) : 1) > 0
      );
      const minCatYear = !hasEligibleForYear
        ? Math.min(4, ...Object.keys(topicProgress[cat] || {}).map((t) =>
            typeof getTopicMinYear === 'function' ? (getTopicMinYear(cat, t) || 4) : 4
          ))
        : null;
      const lockBadge = !hasEligibleForYear && minCatYear
        ? ` <span class="cat-year-lock">${esc(getAcademicYearMeta(minCatYear).shortLabel)}+</span>`
        : '';
      return `<button class="practice-chip practice-cat-chip tone-${esc(tone)}${!hasEligibleForYear ? ' is-year-locked' : ''}" data-practice="catfilter" data-cat="${esc(cat)}" aria-pressed="${practice.categoryFilter === cat}">${esc(catShortNames[cat] || cat)}${lockBadge}</button>`;
    }),
  ].join('');

  const filteredEntries = practice.categoryFilter === 'all'
    ? Object.entries(topicProgress)
    : Object.entries(topicProgress).filter(([cat]) => cat === practice.categoryFilter);

  const categories = filteredEntries.map(([category, topics]) => {
    const topicEntries = Object.entries(topics);
    const activeTier = isAdaptive ? getCategoryAdaptiveTier(category) : practice.difficulty;
    const tierUpper = activeTier.toUpperCase();
    let completedTopicsInCat = 0;
    let availableTopicsInCat = 0;

    const rows = topicEntries.map(([topic, s]) => {
      const topicPool = questionsFor({ category, topic }, practice.difficulty, activeYear);
      const count = topicPool.length;
      const minYear = typeof getTopicMinYear === 'function' ? getTopicMinYear(category, topic) : null;
      const totalForYearTopic = typeof getEligibleTopicCount === 'function' ? getEligibleTopicCount(category, topic, activeYear) : count;

      if (count === 0) {
        const lockedLater = minYear !== null && minYear > activeYear;
        const lockedBadge = lockedLater
          ? `<span class="practice-status-pill is-locked-year">${esc(getAcademicYearLabel(minYear))}+</span>`
          : '<span class="practice-status-pill is-idle">None in filter</span>';
        const lockedText = lockedLater
          ? `Covered in ${getAcademicYearLabel(minYear)} — excluded by your ${yearMeta.label} filter.`
          : totalForYearTopic > 0
            ? `No ${capitalize(practice.difficulty)} questions at ${yearMeta.label} — try Adaptive or All 12 (Mixed).`
            : `No eligible questions available under your ${yearMeta.label} filter.`;
        return `<div class="practice-topic is-year-locked">
          <div class="practice-topic-info">
            <div class="practice-topic-head">
              <span class="practice-topic-name">${esc(topic)}</span>
              ${lockedBadge}
            </div>
            <small class="practice-topic-meta">${esc(lockedText)}</small>
          </div>
          <button class="practice-go" type="button" disabled>${lockedLater ? esc(getAcademicYearLabel(minYear)) + '+' : 'Unavailable'}</button>
        </div>`;
      }

      availableTopicsInCat++;
      const doneCount = topicPool.filter((q) => doneSet.has(q.q)).length;
      const leftCount = Math.max(0, count - doneCount);
      const isDone = count > 0 && doneCount >= count;
      if (isDone) completedTopicsInCat++;

      const hasAccuracy = Boolean(s?.attempted);
      const pct = hasAccuracy ? Math.round((100 * s.correct) / s.attempted) : null;

      let statusPill = '';
      let subtext = '';
      let btnLabel = 'Start';
      let redoAttr = '';

      if (isDone) {
        statusPill = '<span class="practice-status-pill is-done">✓ Completed</span>';
        subtext = hasAccuracy
          ? `All ${count} answered · Accuracy ${pct}% (${s.correct}/${s.attempted} correct)`
          : `All ${count} questions answered`;
        btnLabel = 'Retry';
        redoAttr = 'data-redo="1"';
      } else if (doneCount > 0) {
        statusPill = `<span class="practice-status-pill is-progress">${doneCount} of ${count} answered</span>`;
        subtext = hasAccuracy
          ? `${leftCount} question${leftCount === 1 ? '' : 's'} left · Accuracy ${pct}%`
          : `${leftCount} question${leftCount === 1 ? '' : 's'} left`;
        btnLabel = 'Continue';
      } else {
        statusPill = '<span class="practice-status-pill is-idle">Not started</span>';
        if (isAdaptive && hasAccuracy) {
          subtext = `${count} ${capitalize(activeTier)} question${count === 1 ? '' : 's'} ready · Overall accuracy ${pct}%`;
        } else if (hasAccuracy) {
          subtext = `${count} question${count === 1 ? '' : 's'} ready · Overall accuracy ${pct}%`;
        } else {
          subtext = `${count} question${count === 1 ? '' : 's'} ready`;
        }
        btnLabel = 'Start';
      }

      return `<div class="practice-topic${isDone ? ' is-done' : ''}">
        <div class="practice-topic-info">
          <div class="practice-topic-head">
            <span class="practice-topic-name">${esc(topic)}</span>
            ${statusPill}
          </div>
          <small class="practice-topic-meta">${esc(subtext)}</small>
        </div>
        <button class="practice-go" data-practice="start" data-src="topic" data-category="${esc(category)}" data-topic="${esc(topic)}" ${redoAttr} ${count ? '' : 'disabled'}>${btnLabel}</button>
      </div>`;
    }).join('');

    const tierChip = isAdaptive && availableTopicsInCat > 0
      ? `<span class="cap-tier-pill tier-${esc(activeTier)}">TIER: ${esc(tierUpper)}</span>`
      : '';
    const catProgress = availableTopicsInCat === 0
      ? `Unlocked in later years`
      : completedTopicsInCat > 0
        ? `${completedTopicsInCat} of ${availableTopicsInCat} available completed`
        : `${availableTopicsInCat} of ${topicEntries.length} topics available`;

    const catTone = PRACTICE_CAT_TONES[category] || 'gold';
    return `<details class="practice-category tone-${esc(catTone)}" ${availableTopicsInCat > 0 ? 'open' : ''}>
      <summary>
        <span class="practice-cat-title">${esc(category)} ${tierChip}</span>
        <span class="practice-cat-count">${esc(catProgress)}</span>
      </summary>
      ${rows}
    </details>`;
  }).join('');

  return `<span class="eyebrow">Topic Drill · Non-Combat Study</span>
    <h2>Practice by Topic</h2>
    <p class="practice-lead">Study any computing topic without losing HP. Answers count toward your Skill Points and Learning Tracker.</p>
    <div class="practice-year-strip">
      <div>
        <strong>Academic Year Filter · ${esc(yearMeta.label)} (${esc(yearMeta.rangeLabel)}) · Locked</strong>
        <small>${totalEligibleAll} eligible questions included. Your year level is locked after Sign Up to keep rankings fair.</small>
      </div>
      <button type="button" class="practice-back" data-open-settings="year">Year Details</button>
    </div>
    <div class="practice-controls">
      <div class="practice-controls-row">
        <span>Question Set</span>
        <div class="practice-chips">${chips}</div>
      </div>
      <div class="practice-controls-row">
        <span>Discipline</span>
        <div class="practice-chips practice-cat-chips">${catFilterChips}</div>
      </div>
      <small class="practice-filter-note">${esc(describeDifficultyFilter(practice.difficulty))}</small>
    </div>
    <div class="practice-start">
      <button class="leaderboard-action" data-practice="start" data-src="all" ${allFinished ? 'data-redo="1"' : ''} ${allPool.length ? '' : 'disabled'}>${allPool.length === 0 ? 'No eligible questions in this filter' : (allFinished ? `Retry all topics (${allPool.length} questions)` : `Start all-topics drill (${allRemaining} left)`)}</button>
      <button class="leaderboard-action" data-practice="start" data-src="review" ${eligibleReviewCount ? '' : 'disabled'}>${eligibleReviewCount ? `Review missed (${eligibleReviewCount})` : 'No missed questions'}</button>
    </div>
    ${weakCallout}
    <div class="practice-categories">${categories}</div>`;
}

function renderPracticeDone() {
  const isReview = practice.source === 'review';
  const sourceLabel = practice.source === 'all'
    ? 'All Topics'
    : isReview
      ? 'Missed Questions Review'
      : `${practice.source?.topic || 'Topic'} (${practice.source?.category || ''})`;
  const total = practice.session.total;
  const correct = practice.session.correct;
  const pct = total ? Math.round((100 * correct) / total) : 100;

  // Detect if Adaptive tier upgraded during this session so the user clearly sees why new questions unlocked!
  const tierRank = { easy: 0, medium: 1, hard: 2 };
  const promoted = [];
  if (practice.sessionDifficulty === 'adaptive') {
    const checkCats = practice.source && typeof practice.source === 'object' && practice.source.category
      ? [practice.source.category]
      : Object.keys(practice.startTiers || {});
    for (const cat of checkCats) {
      const before = practice.startTiers?.[cat];
      const after = getCategoryAdaptiveTier(cat);
      if (before && after && (tierRank[after] ?? 0) > (tierRank[before] ?? 0)) {
        promoted.push({ cat, before, after });
      }
    }
  }
  const promotionNotice = promoted.length
    ? `<div class="practice-tier-upgrade">
        <strong>★ Tier Unlocked!</strong>
        <span>${promoted.map((p) => `${esc(p.cat)} moved from ${esc(p.before.toUpperCase())} to ${esc(p.after.toUpperCase())} — 4 new ${esc(capitalize(p.after))} questions are now ready per topic.`).join(' ')}</span>
      </div>`
    : '';

  const setLabel = isReview
    ? 'Missed Review'
    : practice.sessionDifficulty === 'adaptive'
      ? `Adaptive · ${capitalize(practice.source?.category ? (practice.startTiers[practice.source.category] || 'easy') : 'tier')}`
      : practice.sessionDifficulty === 'mixed'
        ? 'All 12 (Mixed)'
        : capitalize(practice.sessionDifficulty);

  const summaryBlock = total > 0
    ? `<div class="practice-done-stats">
        <div class="practice-done-stat">
          <span>Session Score</span>
          <strong>${correct} / ${total} (${pct}%)</strong>
        </div>
        <div class="practice-done-stat">
          <span>Set Progress</span>
          <strong>${isReview ? `${total} reviewed` : `${practice.deckTotal} of ${practice.deckTotal} answered`}</strong>
        </div>
      </div>`
    : `<p class="practice-done-score">Every question in this set is already completed. Click Retry to practice them again.</p>`;

  return `<div class="practice-bar">
      <button class="practice-back" data-practice="back">Back to topics</button>
      <span class="practice-status-pill is-done">✓ Completed</span>
    </div>
    <div class="practice-done-card">
      <span class="eyebrow">Drill Complete · ${esc(setLabel)}</span>
      <h3>${esc(sourceLabel)}</h3>
      ${summaryBlock}
      ${promotionNotice}
      <div class="practice-done-actions">
        ${isReview && !questionsFor('review', practice.difficulty).length ? '' : '<button class="leaderboard-action" data-practice="redo">Retry This Set</button>'}
        <button class="practice-back" data-practice="back">Back to topics</button>
      </div>
    </div>`;
}

function renderPracticeQuiz() {
  const q = practice.current;
  const totalQ = Math.max(1, practice.deckTotal || 1);
  const stepNum = Math.min(totalQ, practice.session.total + (practice.picked === null ? 1 : 0));
  const progressPct = Math.round((100 * practice.session.total) / totalQ);
  const scoreTxt = practice.session.total > 0
    ? ` · ${practice.session.correct} of ${practice.session.total} correct`
    : '';

  const header = `<div class="practice-bar">
    <button class="practice-back" data-practice="back">Back to topics</button>
    <span class="practice-quiz-progress">Question ${stepNum} of ${totalQ}${scoreTxt}</span>
  </div>
  <div class="practice-progress-track" role="progressbar" aria-label="Drill progress" aria-valuenow="${practice.session.total}" aria-valuemin="0" aria-valuemax="${totalQ}">
    <i style="width:${progressPct}%"></i>
  </div>`;
  if (!q) return `${header}<p>No questions available in this set. Try another question set or topic.</p>`;

  const answered = practice.picked !== null;
  const choices = q.choices.map((text, i) => {
    let state = '';
    if (answered) state = i === q.answer ? 'is-correct' : i === practice.picked ? 'is-wrong' : '';
    return `<button data-practice="answer" data-val="${i}" class="${state}" ${answered ? 'disabled' : ''}>${i + 1}. ${esc(text)}</button>`;
  }).join('');
  const right = practice.picked === q.answer;
  const hasMore = practice.queueIndex < practice.queue.length;
  const nextLabel = hasMore ? 'Next question' : 'View Results';
  const feedback = answered
    ? `<div class="practice-feedback ${right ? 'ok' : 'bad'}">
        <p><strong>${right ? 'Correct!' : 'Not quite.'}</strong> Answer: ${esc(q.choices[q.answer])}.</p>
        <p>${esc(q.explain)}</p>
        ${practice.skillNote ? `<p class="log">${esc(practice.skillNote)}</p>` : ''}
        <button class="leaderboard-action" data-practice="next">${nextLabel} <span class="keyhint">(Enter)</span></button>
      </div>`
    : '';
  const level = QUESTION_DIFFICULTY.get(q.q) || '';
  return `${header}
    <p class="tag">${esc(q.category)} · ${esc(q.topic)} · ${esc(level.toUpperCase())}</p>
    <p class="question">${esc(q.q)}</p>
    <div class="practice-choices">${choices}</div>
    ${feedback}
    <p class="dim">${answered ? '' : 'Choose an answer or press keys 1–4.'}</p>`;
}

// Delegated clicks for every [data-practice] control in the dashboard.
function handlePracticeClick(event) {
  const el = event.target.closest('[data-practice]');
  if (!el) return false;
  const action = el.dataset.practice;
  if (typeof window.ByteboundTutorial?.interceptPracticeClick === 'function') {
    if (window.ByteboundTutorial.interceptPracticeClick(action, el, event)) return true;
  }
  if (action === 'difficulty') {
    practice.difficulty = el.dataset.diff;
  } else if (action === 'catfilter') {
    practice.categoryFilter = el.dataset.cat || 'all';
  } else if (action === 'start') {
    const src = el.dataset.src;
    startPractice(
      src === 'topic' ? { category: el.dataset.category, topic: el.dataset.topic } : src,
      { forceRedo: el.dataset.redo === '1' }
    );
    dashboardView = 'practice';
    updateNavigation();
  } else if (action === 'redo') {
    startPractice(practice.source, { forceRedo: true });
  } else if (action === 'answer') {
    answerPractice(Number(el.dataset.val));
  } else if (action === 'next') {
    if (practice.picked !== null) nextPracticeQuestion();
  } else if (action === 'back') {
    practice.mode = 'menu';
  }
  renderDashboard();
  window.ByteboundTutorial?.onPracticeAction?.(action, el);
  return true;
}

// Number keys answer and Enter moves on while the practice quiz is showing.
function handlePracticeKey(key) {
  if (practice.mode !== 'quiz') return false;
  if (/^[1-4]$/.test(key)) {
    if (practice.current && practice.picked === null) {
      answerPractice(Number(key) - 1);
      renderDashboard();
      window.ByteboundTutorial?.onPracticeAction?.('answer', null);
    }
    return true;
  }
  if (key === 'enter') {
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.closest('button, input, select, textarea, a')) return false;
    if (practice.picked !== null) {
      nextPracticeQuestion();
      renderDashboard();
      window.ByteboundTutorial?.onPracticeAction?.('next', null);
    }
    return true;
  }
  return false;
}
