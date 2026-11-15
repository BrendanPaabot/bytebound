// Keyboard and on-screen touch controls share one input handler.
const KEY_ALIASES = { ArrowLeft: 'a', ArrowRight: 'd', ArrowUp: 'up', ' ': 'space' };
const CONFIRM_KEYS = ['enter', 'w', 'e', 'space', 'up'];

function handleKey(rawKey, down, repeat = false) {
  const key = KEY_ALIASES[rawKey] || String(rawKey).toLowerCase();

  if (window.mpUI?.isOpen) {
    if (!down && (key === 'a' || key === 'd')) keys[key].pressed = false;
    return;
  }
  if (skillTreeOpen) {
    if (down && key === 'u' && !repeat) closeSkillTree()
    if (!down && (key === 'a' || key === 'd')) keys[key].pressed = false
    return
  }
  if (down && !repeat && key === 'u' && playViewActive && mode !== 'menu' && !(typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive)) {
    openSkillTree()
    return
  }
  if (mode !== 'menu' && !playViewActive) {
    if (key === 'a' || key === 'd') keys[key].pressed = false
    return
  }

  if (key === 'a' || key === 'd') {
    keys[key].pressed = down;
    return;
  }
  if (!down || repeat) return;

  if (mode === 'menu') {
    // Enter starts the game only when no nav button or setting has focus.
    const focused = document.activeElement;
    const onControl = focused && focused !== document.body && focused.closest('button, input, select, textarea, a');
    if (key === 'enter' && !onControl) startGame();
    return;
  }

  if (mode === 'battle') {
    const n = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const phase = battle.phase;
    const isMp = typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive;
    if (phase === 'mp_waiting' || phase === 'mp_dying') return;
    if (phase === 'choose' && n >= 0 && n < battle.hand.length) chooseCard(n);
    else if (phase === 'question' && n >= 0 && n < 4) answerQuestion(n);
    else if (!isMp && phase === 'upgrade' && n >= 0 && n < battle.upgrades.length) applyUpgrade(n);
    else if (!isMp && phase === 'reward' && n >= 0 && n < battle.rewards.length) pickReward(n);
    else if (CONFIRM_KEYS.includes(key)) {
      if (phase === 'feedback') continueBattle();
      else if (!isMp && phase === 'won') afterWin();
      else if (!isMp && phase === 'lost') retryRoom();
    }
    return;
  }
  if (mode !== 'explore' || player.preventInput) return;

  if (key === 'up') {
    tryDoor();
  } else if (key === 'w') {
    if (!tryDoor() && player.velocity.y === 0) player.velocity.y = -22;
  } else if (key === 'space') {
    if (player.velocity.y === 0) player.velocity.y = -22;
  }
}

window.addEventListener('keydown', (e) => {
  if (window.mpUI?.isOpen) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea, select, #multiplayerOverlay')) return;
  // A focused panel button handles Enter/Space itself.
  if (e.target.closest && e.target.closest('[data-act]') && e.key.toLowerCase() !== 'u') return;
  if (playViewActive && !e.repeat && (e.key === 'f' || e.key === 'F')) { toggleFullscreen(); return; }
  if (playViewActive && e.key in KEY_ALIASES) e.preventDefault();
  handleKey(e.key, true, e.repeat);
});
window.addEventListener('keyup', (e) => handleKey(e.key, false));

document.querySelectorAll('[data-k]').forEach((btn) => {
  const key = btn.dataset.k;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('is-pressed');
    if (btn.setPointerCapture) {
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    }
    handleKey(key, true);
  });
  const release = (e) => {
    btn.classList.remove('is-pressed');
    handleKey(key, false);
    if (e && e.pointerId != null && btn.hasPointerCapture && btn.hasPointerCapture(e.pointerId)) {
      try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});
