// Cards are the moves in your deck. Each battle you draw from your deck into a hand of HAND_SIZE.
// Rewards after each win add cards to this run's deck. Unlocks depend on lifetime progress,
// so the reward pool grows across runs without any extra saved data.
const STARTING_DECK = ['strike', 'power', 'defend', 'mend'];
const SOLO_STARTING_DECK = ['strike', 'power', 'defend', 'mend', 'charge'];

// cost: mana (number) or 'empower' (uses the hero's Power Strike cost from upgrades).
// kind: hit | defend | charge | heal | mana | buff
const CARD_LIBRARY = {
  strike: { id: 'strike', name: 'Strike', cost: 0, kind: 'hit', power: 1, start: true, text: 'Base attack damage.' },
  power: { id: 'power', name: 'Power Strike', cost: 'empower', kind: 'hit', power: 1.55, start: true, text: 'Costs mana for 1.55x damage.' },
  defend: { id: 'defend', name: 'Defend', cost: 0, kind: 'defend', start: true, text: 'Blocks most of the next hit. 2-turn cooldown.' },
  charge: { id: 'charge', name: 'Charge Mana', cost: 0, kind: 'charge', start: true, text: 'Restores mana.' },
  quick: { id: 'quick', name: 'Quick Jab', cost: 0, kind: 'hit', power: 0.65, manaOnCorrect: 8, unlock: null, text: 'A swift hit that restores 8 mana when correct.' },
  mend: { id: 'mend', name: 'Mend', cost: 0, kind: 'heal', heal: 12, unlock: null, text: 'Restores 12+ HP when correct.' },
  siphon: { id: 'siphon', name: 'Siphon', cost: 0, kind: 'mana', gain: 16, chipPower: 0.4, unlock: { metric: 'correct', goal: 10, text: 'Answer 10 questions correctly' }, text: 'Restores 16 mana and deals light chip damage when correct.' },
  heavy: { id: 'heavy', name: 'Heavy Blow', cost: 25, kind: 'hit', power: 2.4, unlock: { metric: 'kills', goal: 5, text: 'Defeat 5 viruses' }, text: 'Costs 25 mana for a crushing hit.' },
  fortify: { id: 'fortify', name: 'Fortify', cost: 0, kind: 'buff', defense: 3, manaOnCorrect: 4, unlock: { metric: 'kills', goal: 10, text: 'Defeat 10 viruses' }, text: '+3 defense for the battle and +4 mana when correct.' },
  overclock: { id: 'overclock', name: 'Overclock', cost: 10, kind: 'hit', power: 1, correctMult: 2, unlock: { metric: 'bosses', goal: 1, text: 'Defeat a mini boss' }, text: 'Costs 10 mana. Double damage when correct.' },
  kernel_aegis: { id: 'kernel_aegis', name: 'Kernel Aegis', cost: 10, kind: 'aegis', exclusiveActive: true, chargeMin: 3, chargeMax: 5, text: 'Charges via 3–5 answer streak (up to 1.5x). Blocks hits + full heal + 40–60 MP + surge; wrong answers drain/pierce.' },
  packet_lockdown: { id: 'packet_lockdown', name: 'Packet Lockdown', cost: 10, kind: 'stun', stunTurns: 8, exclusiveActive: true, chargeMin: 3, chargeMax: 5, text: 'Charges via 3–5 answer streak (up to 1.5x). 8–12t stun, breach DMG, +50% hit DMG while stunned & MP.' },
  plasma_compile: { id: 'plasma_compile', name: 'Overburn Execution', cost: 15, kind: 'burn_hit', baseDamage: 100, burnDamage: 20, burnTurns: 5, exclusiveActive: true, chargeMin: 3, chargeMax: 5, text: 'Charges via 3–5 answer streak (up to 1.5x). Heavy DMG (Execute <40% HP) + Inferno Burn (5t).' },
};

function cardCost(card, hero) {
  return card.cost === 'empower' ? hero.empowerCost : card.cost;
}

function cardCostLabel(card, hero) {
  const cost = cardCost(card, hero);
  return cost ? `${cost} mana` : 'Free';
}

// What the card will do right now, given the hero's current stats.
function describeCard(card, hero) {
  switch (card.kind) {
    case 'hit': {
      const effectiveAtk = hero.attack + (hero.tempAttack || 0);
      const hit = Math.round(effectiveAtk * card.power * (card.correctMult || 1));
      const extra = card.manaOnCorrect ? ` +${card.manaOnCorrect} MP if correct.` : '';
      return `${hit} damage if correct, misses if wrong.${extra}`;
    }
    case 'defend':
      return 'Blocks 75% of the next hit if correct, 25% if not. 2-turn cooldown.';
    case 'charge':
      return '+25 mana if correct, +10 if not.';
    case 'heal':
      return `Restores ${card.heal + hero.bonusHeal} HP if correct, 2 if not.`;
    case 'mana': {
      const effectiveAtk = hero.attack + (hero.tempAttack || 0);
      const chip = card.chipPower ? ` + ${Math.max(1, Math.round(effectiveAtk * card.chipPower))} DMG` : '';
      return `+${card.gain} mana${chip} if correct, +2 MP if not.`;
    }
    case 'buff': {
      const mpTxt = card.manaOnCorrect ? ` +${card.manaOnCorrect} MP` : '';
      return `+${card.defense} DEF for battle${mpTxt} if correct (+1 DEF if not).`;
    }
    case 'aegis': {
      const rank = typeof skillProgress !== 'undefined' ? Math.max(1, skillProgress.computerSystems?.ranks?.kernelAegis || 1) : 1;
      return `Shields normal hits + Full HP + 40–60 MP + ${35 * rank}–${Math.round(35 * rank * 1.5)} DMG (wrong drains MP & pierces). 3–5 Streak.`;
    }
    case 'stun': {
      const rank = typeof skillProgress !== 'undefined' ? Math.max(1, skillProgress.networkingSecurity?.ranks?.packetLockdown || 1) : 1;
      const baseDmg = 40 * rank;
      return `Stuns ${8 + (rank - 1) * 2}–${Math.round((8 + (rank - 1) * 2) * 1.5)}t + ${baseDmg}–${Math.round(baseDmg * 1.5)} DMG + 1.5x hit DMG + MP. 3–5 Streak.`;
    }
    case 'burn_hit': {
      const rank = typeof skillProgress !== 'undefined' ? Math.max(1, skillProgress.programming?.ranks?.overburnExecution || 1) : 1;
      const bonus = (Math.max(0, (hero.attack || 12) - 12) + (hero.tempAttack || 0)) * 2;
      const total = 100 + (rank - 1) * 50 + bonus;
      return `${total}–${Math.round(total * 1.5)} DMG (1.5x Execute <40%) + ${20 * rank}–${Math.round(20 * rank * 1.5)}/t burn (5t). 3–5 Streak.`;
    }
    default:
      return card.text;
  }
}

function cardUnlocked(card, metrics) {
  if (card.exclusiveActive) return false;
  if (card.start || !card.unlock) return true;
  return (metrics[card.unlock.metric] || 0) >= card.unlock.goal;
}

function unlockedCardIds(metrics) {
  return Object.values(CARD_LIBRARY).filter((card) => cardUnlocked(card, metrics)).map((card) => card.id);
}

const CARD_ROLE_ICONS = {
  attack: '<svg class="pixel-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M9 1h2v2h-1v1H9v1H8v1H7v1H6v1H5v1H4v1H2v-2h1V8h1V7h1V6h1V5h1V4h1V3h1V1zM2 8H1v1h1v1h1v1h1v-1H3V9H2V8z"/></svg>',
  defense: '<svg class="pixel-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 1h8v1h1v4h-1v2H9v1H8v1H7v1H5v-1H4V9H3V8H2V6H1V2h1V1zm1 2v3h1v2h1v1h2V8h1V6h1V3H3z"/></svg>',
  heal: '<svg class="pixel-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M4 1h4v3h3v4H8v3H4V8H1V4h3V1z"/></svg>',
  recovery: '<svg class="pixel-ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M5 1h2v1h1v2h1v2H8v2H7v2H5V8H4V6H3V4h1V2h1V1zM1 5h1v2H1V5zm9 0h1v2h-1V5z"/></svg>',
};

const ACTIVE_SKILL_SIGILS = {
  kernel_aegis: '<svg class="active-sigil-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" opacity="0.22" d="M4 3h16v2h2v8h-2v4h-2v2h-3v2h-6v-2H6v-2H4v-4H2V5h2V3z"/><path fill="currentColor" d="M5 2h14v2h2v9h-2v3h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-3H3V4h2V2zm2 4v6h2v3h2v2h2v-2h2v-3h2V6H7zm3 2h4v2h2v2h-2v2h-4v-2H8v-2h2V8z"/></svg>',
  packet_lockdown: '<svg class="active-sigil-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" opacity="0.22" d="M7 2h10v3h3v14h-3v3H7v-3H4V5h3V2z"/><path fill="currentColor" d="M8 3h8v2h2v4h2v10h-2v2H6v-2H4V9h2V5h2V3zm2 2v4h4V5h-4zm-4 6v8h12v-8H6zm5 2h2v2h1v2h-4v-2h1v-2z"/><path fill="currentColor" d="M1 11h2v2H1v-2zm20 0h2v2h-2v-2z"/></svg>',
  plasma_compile: '<svg class="active-sigil-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" opacity="0.22" d="M10 2h6v4h4v6h-3v5h-4v5H8v-5H5v-6h3V6h2V2z"/><path fill="currentColor" d="M13 1h4v2h-1v3h-1v3h5v2h-2v2h-2v2h-2v2h-2v3h-2v3H8v-3h1v-3h1v-3H5v-2h2V9h2V7h2V4h2V1zm-3 11h4v2h-2v3h2v-2h2v-3h-6v0z"/></svg>',
};

function getCardRoleMeta(card) {
  if (!card) {
    return { tone: 'offense', category: 'attack', label: 'ATTACK', shortLabel: 'ATK', iconSvg: CARD_ROLE_ICONS.attack };
  }
  if (card.exclusiveActive) {
    const map = {
      kernel_aegis: {
        tone: 'exclusive',
        category: 'exclusive',
        label: 'ACTIVE SKILL',
        discipline: 'SYSTEMS',
        sigilSvg: ACTIVE_SKILL_SIGILS.kernel_aegis,
      },
      packet_lockdown: {
        tone: 'exclusive',
        category: 'exclusive',
        label: 'ACTIVE SKILL',
        discipline: 'NETWORK',
        sigilSvg: ACTIVE_SKILL_SIGILS.packet_lockdown,
      },
      plasma_compile: {
        tone: 'exclusive',
        category: 'exclusive',
        label: 'ACTIVE SKILL',
        discipline: 'CODE',
        sigilSvg: ACTIVE_SKILL_SIGILS.plasma_compile,
      },
    };
    return map[card.id] || {
      tone: 'exclusive',
      category: 'exclusive',
      label: 'ACTIVE SKILL',
      discipline: 'RELIC',
      sigilSvg: ACTIVE_SKILL_SIGILS.kernel_aegis,
    };
  }
  switch (card.kind) {
    case 'hit':
      return { tone: 'offense', category: 'attack', label: 'ATTACK', shortLabel: 'ATK', iconSvg: CARD_ROLE_ICONS.attack };
    case 'heal':
      return { tone: 'defense', category: 'heal', label: 'HEAL', shortLabel: 'HEAL', iconSvg: CARD_ROLE_ICONS.heal };
    case 'defend':
    case 'buff':
      return { tone: 'defense', category: 'defense', label: 'DEFENSE', shortLabel: 'DEF', iconSvg: CARD_ROLE_ICONS.defense };
    case 'charge':
    case 'mana':
      return { tone: 'defense', category: 'recovery', label: 'RESTORE', shortLabel: 'MP', iconSvg: CARD_ROLE_ICONS.recovery };
    default:
      return { tone: 'offense', category: 'attack', label: 'ACTION', shortLabel: 'ACT', iconSvg: CARD_ROLE_ICONS.attack };
  }
}

// Picks up to `count` different unlocked cards to offer after a win.
function rewardChoices(count, metrics) {
  const bag = unlockedCardIds(metrics);
  const picks = [];
  while (picks.length < count && bag.length) {
    picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  return picks;
}
