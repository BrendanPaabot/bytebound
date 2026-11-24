// Keyboard and on-screen touch controls share one input handler.
const KEY_ALIASES = { ArrowLeft: 'a', ArrowRight: 'd', ArrowUp: 'up', ' ': 'space' };
const CONFIRM_KEYS = ['enter', 'w', 'e', 'space', 'up'];

function handleKey(rawKey, down, repeat = false) {
  const key = KEY_ALIASES[rawKey] || String(rawKey).toLowerCase();

  if (typeof window.ByteboundTutorial?.interceptKey === 'function') {
    if (window.ByteboundTutorial.interceptKey(key, rawKey, down, repeat)) return true;
  }

  if (window.mpUI?.isOpen) {
    if (!down && (key === 'a' || key === 'd')) keys[key].pressed = false;
    return;
  }
  if (worldMapOpen) {
    if (down && key === 'm' && !repeat && typeof closeWorldMap === 'function') closeWorldMap()
    if (!down && (key === 'a' || key === 'd')) keys[key].pressed = false
    return
  }
  if (skillTreeOpen) {
    if (down && key === 'u' && !repeat) closeSkillTree()
    if (!down && (key === 'a' || key === 'd')) keys[key].pressed = false
    return
  }
  if (down && !repeat && key === 'm' && playViewActive && mode !== 'menu' && !(typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive)) {
    if (typeof openWorldMap === 'function') openWorldMap()
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
    if (!playViewActive && typeof dashboardView !== 'undefined' && dashboardView === 'practice' && typeof handlePracticeKey === 'function') {
      if (handlePracticeKey(key)) return;
    }
    // Enter starts the game only when no nav button or setting has focus.
    const focused = document.activeElement;
    const onControl = focused && focused !== document.body && focused.closest('button, input, select, textarea, a');
    const runSavesOpen = Boolean(document.getElementById('runSavesOverlay') && !document.getElementById('runSavesOverlay').hidden);
    if (key === 'enter' && !onControl && !runSavesOpen) startGame();
    return;
  }

  if (mode === 'battle') {
    const n = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const phase = battle.phase;
    const isMp = typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive;
    if (phase === 'mp_waiting' || phase === 'mp_dying') return;
    if (phase === 'choose') {
      if (!isMp && key === 'r' && hero.mana <= 0 && typeof startRemedialChallenge === 'function') startRemedialChallenge();
      else if (n >= 0 && n < battle.hand.length) chooseCard(n);
    }
    else if (phase === 'question' && n >= 0 && n < 4) answerQuestion(n);
    else if (!isMp && phase === 'remedial' && n >= 0 && n < 4 && typeof answerRemedialQuestion === 'function') answerRemedialQuestion(n);
    else if (!isMp && phase === 'upgrade' && n >= 0 && n < battle.upgrades.length) applyUpgrade(n);
    else if (!isMp && phase === 'reward' && n >= 0 && n < battle.rewards.length) pickReward(n);
    else if (CONFIRM_KEYS.includes(key)) {
      if (phase === 'feedback') continueBattle();
      else if (!isMp && phase === 'ally_turn' && typeof continueAllyTurn === 'function') continueAllyTurn();
      else if (!isMp && phase === 'enemy_follower_turn' && typeof continueEnemyFollowerTurn === 'function') continueEnemyFollowerTurn();
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
  if (e.target && e.target.closest && e.target.closest('#tutorialBubble')) {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') return;
  }
  // A focused panel button handles Enter/Space itself.
  if (e.target.closest && e.target.closest('[data-act]') && e.key.toLowerCase() !== 'u' && !window.ByteboundTutorial?.isActionLocked?.()) return;
  if (playViewActive && !e.repeat && (e.key === 'f' || e.key === 'F')) {
    if (window.ByteboundTutorial?.isActionLocked?.()) return;
    toggleFullscreen();
    return;
  }
  if (playViewActive && e.key in KEY_ALIASES) e.preventDefault();
  const tutorialHandled = handleKey(e.key, true, e.repeat);
  if (tutorialHandled) {
    e.stopImmediatePropagation();
  }
});
window.addEventListener('keyup', (e) => handleKey(e.key, false));

const touchButtons = [...document.querySelectorAll('[data-k]')];
const dirTouchButtons = touchButtons.filter((b) => b.dataset.k === 'a' || b.dataset.k === 'd');
const activeTouchPointers = new Map(); // pointerId -> { btn, key, isDir }

function syncDirectionalKeysFromPointers() {
  let leftHeld = false;
  let rightHeld = false;
  for (const entry of activeTouchPointers.values()) {
    if (entry.key === 'a') leftHeld = true;
    if (entry.key === 'd') rightHeld = true;
  }
  keys.a.pressed = leftHeld;
  keys.d.pressed = rightHeld;
  for (const b of dirTouchButtons) {
    const held = b.dataset.k === 'a' ? leftHeld : rightHeld;
    b.classList.toggle('is-pressed', held);
  }
}

function releaseTouchPointer(pointerId) {
  const entry = activeTouchPointers.get(pointerId);
  if (!entry) return;
  activeTouchPointers.delete(pointerId);
  if (entry.isDir) {
    syncDirectionalKeysFromPointers();
  } else {
    let stillHeld = false;
    for (const other of activeTouchPointers.values()) {
      if (other.btn === entry.btn) {
        stillHeld = true;
        break;
      }
    }
    if (!stillHeld) {
      entry.btn.classList.remove('is-pressed');
      handleKey(entry.key, false);
    }
  }
  if (entry.btn.hasPointerCapture && entry.btn.hasPointerCapture(pointerId)) {
    try { entry.btn.releasePointerCapture(pointerId); } catch (_) {}
  }
}

function releaseAllTouchControls() {
  for (const pid of [...activeTouchPointers.keys()]) {
    releaseTouchPointer(pid);
  }
  keys.a.pressed = false;
  keys.d.pressed = false;
  touchButtons.forEach((b) => b.classList.remove('is-pressed'));
}

touchButtons.forEach((btn) => {
  const key = btn.dataset.k;
  const isDir = key === 'a' || key === 'd';
  btn.addEventListener('pointerdown', (e) => {
    if (typeof window.ByteboundTutorial?.interceptTouchButton === 'function') {
      if (window.ByteboundTutorial.interceptTouchButton(key, btn, e)) return;
    }
    btn._lastPtrDownAt = performance.now();
    e.preventDefault();
    if (btn.setPointerCapture) {
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    }
    activeTouchPointers.set(e.pointerId, { btn, key, isDir });
    if (isDir) {
      syncDirectionalKeysFromPointers();
    } else {
      btn.classList.add('is-pressed');
      handleKey(key, true);
    }
    window.ByteboundTutorial?.onTouchButtonAction?.(key, btn, 'pointerdown');
  });
  btn.addEventListener('click', (e) => {
    if (performance.now() - (btn._lastPtrDownAt || 0) < 420) return;
    if (typeof window.ByteboundTutorial?.interceptTouchButton === 'function') {
      if (window.ByteboundTutorial.interceptTouchButton(key, btn, e)) return;
    }
    if (isDir) {
      keys[key].pressed = true;
      btn.classList.add('is-pressed');
      window.setTimeout(() => {
        keys[key].pressed = false;
        btn.classList.remove('is-pressed');
      }, 240);
    } else {
      handleKey(key, true, false);
      window.setTimeout(() => handleKey(key, false, false), 80);
    }
    window.ByteboundTutorial?.onTouchButtonAction?.(key, btn, 'click');
  });
  if (isDir) {
    // Allow smooth thumb sliding between LEFT and RIGHT on the D-pad without lifting
    btn.addEventListener('pointermove', (e) => {
      const entry = activeTouchPointers.get(e.pointerId);
      if (!entry || !entry.isDir) return;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.touch-dir[data-k]');
      if (target && (target.dataset.k === 'a' || target.dataset.k === 'd') && target.dataset.k !== entry.key) {
        entry.key = target.dataset.k;
        syncDirectionalKeysFromPointers();
      }
    });
  }
  const release = (e) => releaseTouchPointer(e.pointerId);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

window.addEventListener('blur', releaseAllTouchControls);
window.addEventListener('orientationchange', () => {
  releaseAllTouchControls();
  window.setTimeout(() => {
    if (typeof syncTouchVisibility === 'function') syncTouchVisibility();
    if (typeof updateExploreCamera === 'function' && typeof mode !== 'undefined' && mode === 'explore') {
      updateExploreCamera();
    }
  }, 120);
});
