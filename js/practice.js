// ===== Practice mode: study by topic without combat =====
// Answers count toward the topic tracker, skill points, and the review queue, but never cost HP.
const PRACTICE_DIFFICULTIES = ['adaptive', 'mixed', 'easy', 'medium', 'hard'];
const DRILL_DONE_STORAGE_KEY = 'bytebound-drill-done-v1';
const practice = {
  mode: 'menu',          // 'menu' | 'quiz' | 'done'
  source: 'all',         // 'all' | 'review' | { category, topic }
  difficulty: 'adaptive',
  current: null,
  picked: null,
  seen: new Set(),       // question texts answered in the current drill run (never repeats)
  deckTotal: 0,
  session: { correct: 0, total: 0 },
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

function questionsFor(source, difficulty) {
  const isAdaptive = difficulty === 'adaptive';
  const levels = (difficulty === 'mixed' || isAdaptive) ? DIFFICULTIES : [difficulty];
  let pool = levels.flatMap((level) => QUESTION_BANK[level]);
  if (source === 'review') {
    const queued = new Set(reviewQueue.map((entry) => entry.text));
    pool = pool.filter((q) => queued.has(q.q));
  } else if (source && typeof source === 'object') {
    pool = pool.filter((q) => q.category === source.category && q.topic === source.topic);
  }
  if (isAdaptive && typeof adaptive !== 'undefined' && typeof adaptive.categoryDifficultyName === 'function' && typeof QUESTION_DIFFICULTY !== 'undefined') {
    const adapted = pool.filter((q) => QUESTION_DIFFICULTY.get(q.q) === adaptive.categoryDifficultyName(q.category));
    if (adapted.length) return adapted;
  }
  return pool;
}

function startPractice(source, { forceRedo = false } = {}) {
  practice.source = source;
  practice.seen = new Set();
  practice.session = { correct: 0, total: 0 };
  practice.current = null;
  practice.picked = null;
  practice.skillNote = '';

  const pool = questionsFor(source, practice.difficulty);
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
  practice.deckTotal = remaining.length;
  practice.mode = 'quiz';
  nextPracticeQuestion();
}

function nextPracticeQuestion() {
  const pool = questionsFor(practice.source, practice.difficulty);
  const doneSet = loadDrillDoneSet();
  const remaining = pool.filter((q) => !practice.seen.has(q.q) && !doneSet.has(q.q));
  if (!remaining.length) {
    practice.current = null;
    practice.picked = null;
    practice.skillNote = '';
    if (pool.length > 0 && practice.mode !== 'done') {
      practice.mode = 'done';
      if (typeof recordAchievementProgress === 'function') {
        recordAchievementProgress('drillCompletions', 1);
      }
    }
    return;
  }
  const next = pickWeighted(remaining);
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
  const doneSet = loadDrillDoneSet();
  doneSet.add(q.q);
  saveDrillDoneSet(doneSet);
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
  }
  Sound.play(correct ? 'correct' : 'wrong');
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function renderPracticeView() {
  if (practice.mode === 'done') return renderPracticeDone();
  return practice.mode === 'quiz' ? renderPracticeQuiz() : renderPracticeMenu();
}

function renderPracticeMenu() {
  const doneSet = loadDrillDoneSet();
  const chips = PRACTICE_DIFFICULTIES.map((difficulty) => `
    <button class="practice-chip" data-practice="difficulty" data-diff="${difficulty}" aria-pressed="${practice.difficulty === difficulty}">${difficulty === 'adaptive' ? 'Adaptive' : difficulty === 'mixed' ? 'Mixed' : capitalize(difficulty)}</button>`).join('');
  const weakList = Object.entries(topicProgress).flatMap(([category, topics]) =>
    Object.entries(topics)
      .filter(([, s]) => (s?.attempted || 0) >= 1 && (s.correct / s.attempted) < 0.75)
      .map(([topic, s]) => ({ category, topic, pct: Math.round((100 * s.correct) / s.attempted), s }))
  ).sort((a, b) => a.pct - b.pct);
  const weakCallout = weakList.length
    ? `<div class="practice-weak-banner">
        <div>
          <strong>Weak Topic Spotlight</strong>
          <small>${esc(weakList[0].category)} · ${esc(weakList[0].topic)} (${weakList[0].pct}% accuracy)</small>
        </div>
        <button class="practice-go" data-practice="start" data-src="topic" data-category="${esc(weakList[0].category)}" data-topic="${esc(weakList[0].topic)}">Drill Weakest</button>
      </div>`
    : '';
  const allPool = questionsFor('all', practice.difficulty);
  const allDoneCount = allPool.filter((q) => doneSet.has(q.q)).length;
  const allFinished = allPool.length > 0 && allDoneCount >= allPool.length;
  const categories = Object.entries(topicProgress).map(([category, topics]) => {
    const rows = Object.entries(topics).map(([topic, s]) => {
      const topicPool = questionsFor({ category, topic }, practice.difficulty);
      const count = topicPool.length;
      const doneCount = topicPool.filter((q) => doneSet.has(q.q)).length;
      const isDone = count > 0 && doneCount >= count;
      const pctTxt = s?.attempted ? ` · ${Math.round((100 * s.correct) / s.attempted)}%` : '';
      const progressTxt = count ? `${doneCount}/${count} done${pctTxt}` : `0 questions${pctTxt}`;
      const doneBadge = isDone ? `<span class="practice-done-badge">✓ DONE</span>` : '';
      const btnLabel = isDone ? 'Redo' : 'Practice';
      const redoAttr = isDone ? 'data-redo="1"' : '';
      return `<div class="practice-topic${isDone ? ' is-done' : ''}">
        <span>${esc(topic)} ${doneBadge}</span>
        <small>${progressTxt}</small>
        <button class="practice-go" data-practice="start" data-src="topic" data-category="${esc(category)}" data-topic="${esc(topic)}" ${redoAttr} ${count ? '' : 'disabled'}>${btnLabel}</button>
      </div>`;
    }).join('');
    return `<details class="practice-category" open>
      <summary>${esc(category)}</summary>
      ${rows}
    </details>`;
  }).join('');
  return `<span class="eyebrow">Topic Drill · Non-Combat Study</span>
    <h2>Study without a fight</h2>
    <p>Practice by topic or review missed questions without losing HP.</p>
    <div class="practice-controls"><span>Difficulty</span><div class="practice-chips">${chips}</div></div>
    <div class="practice-start">
      <button class="leaderboard-action" data-practice="start" data-src="all" ${allFinished ? 'data-redo="1"' : ''}>${allFinished ? `Redo all topics (${allPool.length}/${allPool.length} done)` : `Mixed quiz (${allPool.length - allDoneCount} left)`}</button>
      <button class="leaderboard-action" data-practice="start" data-src="review" ${reviewQueue.length ? '' : 'disabled'}>Review missed (${reviewQueue.length})</button>
    </div>
    ${weakCallout}
    <div class="practice-categories">${categories}</div>`;
}

function renderPracticeDone() {
  const sourceLabel = practice.source === 'all'
    ? 'All Topics'
    : practice.source === 'review'
      ? 'Missed Review Queue'
      : `${practice.source?.category || ''} · ${practice.source?.topic || ''}`;
  const total = practice.session.total;
  const correct = practice.session.correct;
  const pct = total ? Math.round((100 * correct) / total) : 100;
  return `<div class="practice-bar">
      <button class="practice-back" data-practice="back">Back to topics</button>
      <span class="practice-done-badge">✓ DONE</span>
    </div>
    <div class="practice-done-card">
      <span class="eyebrow">Topic Drill Complete</span>
      <h3>All Questions Answered!</h3>
      <p>${esc(sourceLabel)} (${esc(practice.difficulty.toUpperCase())}) is now marked <strong>DONE</strong>.</p>
      ${total ? `<p class="practice-done-score">Session Score: <strong>${correct} / ${total}</strong> (${pct}% accuracy)</p>` : '<p class="practice-done-score">Every question in this set has already been answered.</p>'}
      <div class="practice-done-actions">
        <button class="leaderboard-action" data-practice="redo">Practice Again</button>
        <button class="practice-back" data-practice="back">Back to topics</button>
      </div>
    </div>`;
}

function renderPracticeQuiz() {
  const q = practice.current;
  const stepNum = Math.min(practice.deckTotal || 1, practice.session.total + (practice.picked === null ? 1 : 0));
  const header = `<div class="practice-bar">
    <button class="practice-back" data-practice="back">Back to topics</button>
    <span>Question ${stepNum} / ${practice.deckTotal || 1} · ${practice.session.correct} / ${practice.session.total} correct</span>
  </div>`;
  if (!q) return `${header}<p>No questions in this set yet. Try another difficulty or topic.</p>`;

  const answered = practice.picked !== null;
  const choices = q.choices.map((text, i) => {
    let state = '';
    if (answered) state = i === q.answer ? 'is-correct' : i === practice.picked ? 'is-wrong' : '';
    return `<button data-practice="answer" data-val="${i}" class="${state}" ${answered ? 'disabled' : ''}>${i + 1}. ${esc(text)}</button>`;
  }).join('');
  const right = practice.picked === q.answer;
  const pool = questionsFor(practice.source, practice.difficulty);
  const doneSet = loadDrillDoneSet();
  const hasMore = pool.some((item) => !practice.seen.has(item.q) && !doneSet.has(item.q));
  const nextLabel = hasMore ? 'Next question' : 'Finish & Mark Done';
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
    <p class="dim">${answered ? '' : 'Tap an answer or press 1 to 4.'}</p>`;
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
