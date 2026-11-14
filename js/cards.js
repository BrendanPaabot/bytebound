// Cards are the moves in your deck. Each battle you draw from your deck into a hand of HAND_SIZE.
// Rewards after each win add cards to this run's deck. Unlocks depend on lifetime progress,
// so the reward pool grows across runs without any extra saved data.
const STARTING_DECK = ['strike', 'power', 'defend', 'mend'];

// cost: mana (number) or 'empower' (uses the hero's Power Strike cost from upgrades).
// kind: hit | defend | charge | heal | mana | buff
const CARD_LIBRARY = {
  strike: { id: 'strike', name: 'Strike', cost: 0, kind: 'hit', power: 1, start: true, text: 'Base attack damage.' },
  power: { id: 'power', name: 'Power Strike', cost: 'empower', kind: 'hit', power: 1.5, start: true, text: 'Costs mana for 1.5x damage.' },
  defend: { id: 'defend', name: 'Defend', cost: 0, kind: 'defend', start: true, text: 'Blocks most of the next hit. 2-turn cooldown.' },
  charge: { id: 'charge', name: 'Charge Mana', cost: 0, kind: 'charge', start: true, text: 'Restores mana.' },
  quick: { id: 'quick', name: 'Quick Jab', cost: 0, kind: 'hit', power: 0.6, manaOnCorrect: 3, unlock: null, text: 'A weaker hit that restores 3 mana when correct.' },
  mend: { id: 'mend', name: 'Mend', cost: 0, kind: 'heal', heal: 6, unlock: null, text: 'Restores HP when correct.' },
  siphon: { id: 'siphon', name: 'Siphon', cost: 0, kind: 'mana', gain: 8, unlock: { metric: 'correct', goal: 10, text: 'Answer 10 questions correctly' }, text: 'Restores 8 mana when correct.' },
  heavy: { id: 'heavy', name: 'Heavy Blow', cost: 30, kind: 'hit', power: 2.2, unlock: { metric: 'kills', goal: 5, text: 'Defeat 5 viruses' }, text: 'Costs 30 mana for a crushing hit.' },
  fortify: { id: 'fortify', name: 'Fortify', cost: 0, kind: 'buff', defense: 2, unlock: { metric: 'kills', goal: 10, text: 'Defeat 10 viruses' }, text: '+2 defense for the rest of the battle.' },
  overclock: { id: 'overclock', name: 'Overclock', cost: 10, kind: 'hit', power: 1, correctMult: 2, unlock: { metric: 'bosses', goal: 1, text: 'Defeat a mini boss' }, text: 'Costs 10 mana. Double damage when correct.' },
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
      const hit = Math.round(hero.attack * card.power * (card.correctMult || 1));
      const glance = Math.round(hero.attack * 0.3);
      const extra = card.manaOnCorrect ? ` +${card.manaOnCorrect} mana if correct.` : '';
      return `${hit} damage if correct, ${glance} if not.${extra}`;
    }
    case 'defend':
      return 'Blocks 75% of the next hit if correct, 25% if not. 2-turn cooldown.';
    case 'charge':
      return '+25 mana if correct, +10 if not.';
    case 'heal':
      return `Restores ${card.heal + hero.bonusHeal} HP if correct, 2 if not.`;
    case 'mana':
      return `+${card.gain} mana if correct, 2 if not.`;
    case 'buff':
      return `+${card.defense} defense for this battle.`;
    default:
      return card.text;
  }
}

function cardUnlocked(card, metrics) {
  if (card.start || !card.unlock) return true;
  return (metrics[card.unlock.metric] || 0) >= card.unlock.goal;
}

function unlockedCardIds(metrics) {
  return Object.values(CARD_LIBRARY).filter((card) => cardUnlocked(card, metrics)).map((card) => card.id);
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
