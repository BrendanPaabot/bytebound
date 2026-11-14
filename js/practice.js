// ===== Practice mode: study by topic without combat =====
// Answers count toward the topic tracker, skill points, and the review queue, but never cost HP.
const PRACTICE_DIFFICULTIES = ['mixed', 'easy', 'medium', 'hard'];
const practice = {
  mode: 'menu',          // 'menu' | 'quiz'
  source: 'all',         // 'all' | 'review' | { category, topic }
  difficulty: 'mixed',
  current: null,
  picked: null,
  session: { correct: 0, total: 0 },
  skillNote: '',
};

function questionsFor(source, difficulty) {
  const levels = difficulty === 'mixed' ? DIFFICULTIES : [difficulty];
  let pool = levels.flatMap((level) => QUESTION_BANK[level]);
  if (source === 'review') {
    const queued = new Set(reviewQueue.map((entry) => entry.text));
    pool = pool.filter((q) => queued.has(q.q));
  } else if (source && typeof source === 'object') {
    pool = pool.filter((q) => q.category === source.category && q.topic === source.topic);
  }
  return pool;
}

function startPractice(source) {
  practice.source = source;
  practice.mode = 'quiz';
  practice.session = { correct: 0, total: 0 };
  practice.current = null;
  nextPracticeQuestion();
}

function nextPracticeQuestion() {
  const pool = questionsFor(practice.source, practice.difficulty);
  let next = pool.length ? pickWeighted(pool) : null;
  if (pool.length > 1 && next === practice.current) {
    next = pickWeighted(pool.filter((q) => q !== practice.current));
  }
  practice.current = next;
  practice.picked = null;
  practice.skillNote = '';
}

function answerPractice(index) {
  const q = practice.current;
  if (!q || practice.picked !== null) return;
  const correct = index === q.answer;
  practice.picked = index;
  practice.session.total++;
  if (correct) practice.session.correct++;
  recordTopicAnswer(q, correct);
  recordReview(q, correct);
  if (correct && recordCorrectAnswer(q.category)) {
    practice.skillNote = `${q.category} skill point earned. Press U to spend it.`;
  }
  Sound.play(correct ? 'correct' : 'wrong');
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function renderPracticeView() {
  return practice.mode === 'quiz' ? renderPracticeQuiz() : renderPracticeMenu();
}

function renderPracticeMenu() {
  const chips = PRACTICE_DIFFICULTIES.map((difficulty) => `
    <button class="practice-chip" data-practice="difficulty" data-diff="${difficulty}" aria-pressed="${practice.difficulty === difficulty}">${difficulty === 'mixed' ? 'Mixed' : capitalize(difficulty)}</button>`).join('');
  const categories = Object.entries(topicProgress).map(([category, topics]) => {
    const rows = Object.keys(topics).map((topic) => {
      const count = questionsFor({ category, topic }, practice.difficulty).length;
      return `<div class="practice-topic">
        <span>${esc(topic)}</span>
        <small>${count} ${count === 1 ? 'question' : 'questions'}</small>
        <button class="practice-go" data-practice="start" data-src="topic" data-category="${esc(category)}" data-topic="${esc(topic)}" ${count ? '' : 'disabled'}>Practice</button>
      </div>`;
    }).join('');
    return `<details class="practice-category">
      <summary>${esc(category)}</summary>
      ${rows}
    </details>`;
  }).join('');
  return `<span class="eyebrow">Practice</span>
    <h2>Study without a fight</h2>
    <p>Answer questions at your own pace. Results count toward your tracker and skill points, and you can't lose HP here.</p>
    <div class="practice-controls"><span>Difficulty</span><div class="practice-chips">${chips}</div></div>
    <div class="practice-start">
      <button class="leaderboard-action" data-practice="start" data-src="all">Mixed quiz, all topics</button>
      <button class="leaderboard-action" data-practice="start" data-src="review" ${reviewQueue.length ? '' : 'disabled'}>Review missed (${reviewQueue.length})</button>
    </div>
    <div class="practice-categories">${categories}</div>`;
}

function renderPracticeQuiz() {
  const q = practice.current;
  const header = `<div class="practice-bar">
    <button class="practice-back" data-practice="back">Back to topics</button>
    <span>${practice.session.correct} / ${practice.session.total} correct</span>
  </div>`;
  if (!q) return `${header}<p>No questions in this set yet. Try another difficulty or topic.</p>`;

  const answered = practice.picked !== null;
  const choices = q.choices.map((text, i) => {
    let state = '';
    if (answered) state = i === q.answer ? 'is-correct' : i === practice.picked ? 'is-wrong' : '';
    return `<button data-practice="answer" data-val="${i}" class="${state}" ${answered ? 'disabled' : ''}>${i + 1}. ${esc(text)}</button>`;
  }).join('');
  const right = practice.picked === q.answer;
  const feedback = answered
    ? `<div class="practice-feedback ${right ? 'ok' : 'bad'}">
        <p><strong>${right ? 'Correct!' : 'Not quite.'}</strong> Answer: ${esc(q.choices[q.answer])}.</p>
        <p>${esc(q.explain)}</p>
        ${practice.skillNote ? `<p class="log">${esc(practice.skillNote)}</p>` : ''}
        <button class="leaderboard-action" data-practice="next">Next question <span class="keyhint">(Enter)</span></button>
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
  if (action === 'difficulty') {
    practice.difficulty = el.dataset.diff;
  } else if (action === 'start') {
    const src = el.dataset.src;
    startPractice(src === 'topic' ? { category: el.dataset.category, topic: el.dataset.topic } : src);
    dashboardView = 'practice';
    updateNavigation();
  } else if (action === 'answer') {
    answerPractice(Number(el.dataset.val));
  } else if (action === 'next') {
    if (practice.picked !== null) nextPracticeQuestion();
  } else if (action === 'back') {
    practice.mode = 'menu';
  }
  renderDashboard();
  return true;
}

// Number keys answer and Enter moves on while the practice quiz is showing.
function handlePracticeKey(key) {
  if (practice.mode !== 'quiz') return false;
  if (/^[1-4]$/.test(key)) {
    if (practice.current && practice.picked === null) {
      answerPractice(Number(key) - 1);
      renderDashboard();
    }
    return true;
  }
  if (key === 'enter') {
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.closest('button, input, select, textarea, a')) return false;
    if (practice.picked !== null) {
      nextPracticeQuestion();
      renderDashboard();
    }
    return true;
  }
  return false;
}
