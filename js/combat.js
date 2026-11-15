// ===== Question selection: adaptive difficulty, weak-topic weighting, spaced review =====
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const REVIEW_CHANCE = 0.3;   // chance that a battle question is a due review question
const REVIEW_DELAY = 3;      // answers to wait before a missed question can come back
const REVIEW_LIMIT = 25;     // most questions kept in the review queue
const REVIEW_STORAGE_KEY = 'kings-pigs-review-v1';
let practiceRunActive = false;

const QUESTION_DIFFICULTY = new Map();
for (const difficulty of DIFFICULTIES) {
  for (const question of QUESTION_BANK[difficulty]) QUESTION_DIFFICULTY.set(question.q, difficulty);
}

// Topics you get wrong more often come up more; topics you haven't tried much get a middle weight.
function topicWeight(question) {
  const topic = topicProgress[question.category] && topicProgress[question.category][question.topic];
  if (!topic || topic.attempted < 2) return 1.4;
  return 0.5 + 1.5 * (1 - topic.correct / topic.attempted);
}

function pickWeighted(pool) {
  const weights = pool.map(topicWeight);
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
  constructor() { this.reset(); }

  reset() {
    this.level = 0;
    this.mediumStreak = 0;
    this.used = { easy: [], medium: [], hard: [] };
    this.fromReview = false;
  }

  get name() { return DIFFICULTIES[this.level]; }

  // A due review question comes back now and then. Everything else is drawn from the current
  // difficulty, weighted toward weak topics, and not repeated until the pool runs out.
  nextQuestion() {
    const due = dueReviewQuestion();
    if (due && Math.random() < REVIEW_CHANCE) {
      this.fromReview = true;
      return due;
    }
    this.fromReview = false;
    const key = this.name;
    let pool = QUESTION_BANK[key].filter((q) => !this.used[key].includes(q));
    if (pool.length === 0) {
      this.used[key] = [];
      pool = QUESTION_BANK[key];
    }
    const q = pickWeighted(pool);
    this.used[key].push(q);
    return q;
  }

  // Correct answers raise difficulty, wrong answers lower it.
  // Medium advances to Hard only after two consecutive correct answers at Medium.
  record(correct) {
    if (!correct) {
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

const adaptive = new AdaptiveDifficulty();

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
      progress[question.category][question.topic] ||= { correct: 0, attempted: 0 };
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
      }
    }
  } catch (error) {
    console.error('Unable to load saved topic tracker progress.', error);
  }
  return progress;
}

const topicProgress = loadTopicProgress();

function saveTopicProgress() {
  if (practiceRunActive) return true;
  try {
    localStorage.setItem(activeTopicTrackerStorageKey, JSON.stringify(topicProgress));
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
}

function recordTopicAnswer(question, correct) {
  const topic = topicProgress[question.category]?.[question.topic];
  if (!topic) throw new Error(`Unknown question topic: ${question.category} / ${question.topic}`);
  topic.attempted++;
  if (correct) topic.correct++;
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
  heroHealFlashT: 0, heroHealTintT: 0,
  log: '', popups: [], hand: [], drawPile: [], discard: [], rewards: [], upgrades: [],
  fromReview: false, newUnlocks: [], pendingAttack: false,
  lungeT: 0, heroAttackT: 0, bossAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
  chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
  projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
  hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
  heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
  flash: { hero: 0, enemy: 0 },
};
const panel = document.getElementById('panel');

function resetRun() {
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
function setPanel(html) {
  panel.innerHTML = html;
  renderHud();
}

function renderHud() {
  const $ = (id) => document.getElementById(id);
  $('hpFill').style.width = `${(100 * hero.hp) / hero.maxHp}%`;
  $('hpTxt').textContent = `${hero.hp}/${hero.maxHp}`;
  $('manaFill').style.width = `${(100 * hero.mana) / hero.maxMana}%`;
  $('manaTxt').textContent = `${hero.mana}/${hero.maxMana}`;
  $('roomTxt').textContent = currentRoom.name;
  $('diffTxt').textContent = adaptive.name.toUpperCase();
  $('killsTxt').textContent = stats.kills;
  $('accTxt').textContent = accuracy();
  renderDashboard();
}

function renderExplore(msg) {
  const left = enemies.filter((e) => e.alive).length;
  const boss = currentRoom.boss;
  const fallback = left
    ? (boss
      ? 'The mini boss guards this room. Touch it to start a battle. Defeat it to unlock the door.'
      : 'Touch a virus to start a battle. Defeat them all to unlock the door.')
    : 'Room cleared! Walk to the door to continue.';
  const noun = boss ? 'boss' : (left === 1 ? 'virus' : 'viruses');
  setPanel(`<p class="title">${esc(currentRoom.name)}</p>
    <p>${esc(msg || fallback)}</p>
    <p class="dim">${left} ${noun} left</p>`);
}

function renderBattle() {
  const cards = battle.hand.map((id, i) => {
    const card = CARD_LIBRARY[id];
    const defendCooling = card.id === 'defend' && battle.defendCooldownTurns > 0;
    const blocked = hero.mana < cardCost(card, hero) || defendCooling;
    const detail = defendCooling
      ? `Cooldown: ${battle.defendCooldownTurns} turn${battle.defendCooldownTurns === 1 ? '' : 's'} remaining.`
      : `${esc(cardCostLabel(card, hero))}. ${esc(describeCard(card, hero))}`;
    return `<button${defendCooling ? ' class="is-cooling-down"' : ''} data-act="card" data-val="${i}" ${blocked ? 'disabled' : ''}>${i + 1}. ${esc(card.name)}<small>${detail}</small></button>`;
  }).join('');
  setPanel(`<p class="log">${esc(battle.log)}</p>
    <p class="intent">${isHeavy() ? 'Next turn: a HEAVY attack is coming!' : 'Next turn: a normal attack.'}</p>
    <div class="actions">${cards}</div>
    <p class="dim">Tap a card or press 1 to ${battle.hand.length}. Deck: ${runDeck.length} cards, ${battle.drawPile.length} left to draw.</p>`);
}

function renderQuestion() {
  const q = battle.question;
  const choices = q.choices.map((text, i) => {
    return `<button data-act="answer" data-val="${i}">${i + 1}. ${esc(text)}</button>`;
  }).join('');
  setPanel(`<p class="tag">${esc(q.category)} · ${esc(q.topic)} · ${adaptive.name.toUpperCase()}${battle.fromReview ? ' · REVIEW' : ''}</p>
    <p class="question">${esc(q.q)}</p>
    <div class="choices">${choices}</div>
    <p class="dim">Tap an answer or press 1 to 4.</p>`);
}

function renderFeedback(correct, notes) {
  const q = battle.question;
  const attackPending = battle.pendingAttack;
  setPanel(`<p class="${correct ? 'ok' : 'bad'}">${correct ? 'Correct!' : 'Not quite.'}</p>
    <p><b>Answer: ${esc(q.choices[q.answer])}.</b> ${esc(q.explain)}</p>
    <p class="log">${notes.map((n) => esc(n)).join(' ')}</p>
    <button data-act="continue"${attackPending ? ' disabled' : ''}>${attackPending ? 'Attack resolving...' : 'Continue<span class="keyhint"> (Enter)</span>'}</button>`);
}

function renderMenu() {
  setPanel('');
}

function renderWin() {
  const boss = battle.enemy.isBoss;
  const progressMessages = [
    boss ? 'Boss room cleared!' : '',
    stats.kills % 2 === 0 ? 'Upgrade unlocked!' : '',
  ].filter(Boolean)
  const progress = progressMessages.length ? `<p>${progressMessages.join(' · ')}</p>` : ''
  const unlocked = battle.newUnlocks.length
    ? `<p class="ok">New card unlocked: ${battle.newUnlocks.map((id) => esc(CARD_LIBRARY[id].name)).join(', ')}</p>`
    : '';
  setPanel(`<p class="ok">${esc(battle.enemy.name)} ${boss ? 'defeated!' : 'killed!'}</p>
    ${progress}
    ${unlocked}
    <button data-act="won">Continue<span class="keyhint"> (Enter)</span></button>`);
}

function renderLose() {
  setPanel(`<p class="bad">You were defeated.</p>
    <p>${practiceRunActive ? 'Practice progress is temporary and will be discarded when you exit.' : 'Retry this room with half HP. Your progress is saved.'}</p>
    <button data-act="retry">Retry room<span class="keyhint"> (Enter)</span></button>`);
}

function renderUpgrades() {
  battle.upgrades = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  battle.phase = 'upgrade';
  setPanel(`<p class="ok">Level up! Choose one upgrade (tap or press 1 to 3):</p>
    <div class="choices card-pick">${battle.upgrades.map((u, i) => `<button data-act="upgrade" data-val="${i}">${i + 1}. ${u.name}<small>${u.text}</small></button>`).join('')}</div>`);
}

function renderCardReward() {
  battle.phase = 'reward';
  battle.rewards = rewardChoices(3, getAchievementMetrics());
  const choices = battle.rewards.map((id, i) => {
    const card = CARD_LIBRARY[id];
    return `<button data-act="pickcard" data-val="${i}">${i + 1}. ${esc(card.name)}<small>${esc(cardCostLabel(card, hero))}. ${esc(describeCard(card, hero))}</small></button>`;
  }).join('');
  setPanel(`<p class="ok">Choose a card for your deck (tap or press 1 to ${battle.rewards.length}):</p>
    <div class="choices card-pick">${choices}</div>
    <p class="dim">Deck: ${runDeck.length} cards</p>`);
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
    heroHealFlashT: 0, heroHealTintT: 0,
    lungeT: 0, heroAttackT: 0, bossAttackT: 0, enemyLungeT: 0, enemyLungeDistance: 0,
    chargeCard: false, chargeStartedAt: 0, chargeReady: false, chargeMaxT: 0, chargeSparks: [],
    projectileT: -1, projectileQueued: false, projectileCharged: false, projectileDamage: 0,
    pendingAttack: false,
    hitT: 0, enemyInvertT: 0, cameraPushDistance: 0, cameraShakeT: 0, impactRingT: 0, enemyDefeatT: -1,
    heroHitT: 0, heroHitTintT: 0, heroKnockbackT: -1,
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
  hero.mana -= cost;
  battle.hand.splice(index, 1);
  battle.discard.push(id);
  fillHand();
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
  battle.question = adaptive.nextQuestion();
  battle.fromReview = adaptive.fromReview;
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
  recordReview(q, correct);
  stats.streak = correct ? stats.streak + 1 : 0;
  recordAchievementProgress('bestStreak', stats.streak);
  adaptive.record(correct);
  Sound.play(correct ? 'correct' : 'wrong');

  const notes = [resolveCard(battle.card, correct)];
  if (correct) {
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
  }
  battle.phase = 'feedback';
  renderFeedback(correct, notes);
}

// Resolves the card played this turn and returns a short description of what happened.
function resolveCard(id, correct) {
  const card = CARD_LIBRARY[id];
  if (card.kind === 'hit') {
    const dmg = correct
      ? Math.round(hero.attack * card.power * (card.correctMult || 1))
      : Math.round(hero.attack * 0.3);
    let note = 'Glancing blow only. ';
    if (correct) note = card.id === 'strike' ? '' : `${card.name}! `;
    if (correct && card.manaOnCorrect) hero.mana = Math.min(hero.maxMana, hero.mana + card.manaOnCorrect);
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

function continueBattle() {
  if (battle.phase !== 'feedback' || battle.pendingAttack) return;
  if (battle.enemy.hp <= 0) return winBattle();

  // Enemy turn: every third turn (every second for bosses) is a telegraphed heavy attack.
  const heavy = isHeavy();
  const foe = battle.enemy;
  let dmg = Math.max(1, Math.round(foe.attack * (heavy ? 1.7 : 1) - hero.defense - battle.tempDefense));
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
    ? `${heavy ? 'Heavy charge! ' : ''}${foe.name} hits you for ${dmg}.`
    : `${foe.name} misses while your invincibility is active.`;
  battle.block = 0;
  foe.turns++;

  if (hero.hp <= 0) {
    battle.phase = 'lost';
    Sound.music(null);
    Sound.play('lose');
    return renderLose();
  }
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
  };
  if (actions[act]) actions[act]();
});
