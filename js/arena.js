// ===== Battle arena =====
const HERO_SPOT = { x: 300, y: 454 };
const FOE_SPOT = { x: 760, y: 454 };
const motes = Array.from({ length: 28 }, () => ({ x: Math.random() * 1024, y: Math.random() * 576, s: 0.3 + Math.random() * 0.7 }));
const fxParticles = [];
const ARENA_THEMES = {
  arena: './img/map/datacenter/pcbattlearena.jpg',
  storeroom: './img/map/datacenter/backgroundLevel1.jpg?v=clean-room',
  hall: './img/map/datacenter/backgroundLevel2.jpg',
  throne: './img/map/datacenter/backgroundLevel3.jpg',
  server: './img/map/bbcorp/backgroundLevel5.jpg?v=1',
};
let currentArenaTheme = 'arena';
const arenaBackground = new Image();
let arenaT = 0;

arenaBackground.addEventListener('error', () => {
  console.error('Failed to load battle arena background:', arenaBackground.src);
});
arenaBackground.src = ARENA_THEMES.arena;

function setArenaTheme(themeId) {
  const nextId = ARENA_THEMES[themeId] ? themeId : 'arena';
  if (currentArenaTheme === nextId && arenaBackground.src) return;
  currentArenaTheme = nextId;
  arenaBackground.src = ARENA_THEMES[nextId];
}

function drawArenaBackground() {
  const W = canvas.width, H = canvas.height;
  if (arenaBackground.complete && arenaBackground.naturalWidth > 0) {
    const sourceHeight = Math.min(arenaBackground.naturalHeight, arenaBackground.naturalWidth * H / W);
    c.drawImage(arenaBackground, 0, 0, arenaBackground.naturalWidth, sourceHeight, 0, 0, W, H);
  } else {
    c.fillStyle = '#1d1a2a';
    c.fillRect(0, 0, W, H);
  }
}

// Animated layer: rings, circuit pulses and floating motes.
function drawArena() {
  arenaT++;
  const W = canvas.width, H = canvas.height;
  drawArenaBackground();

  const p = 0.5 + 0.5 * Math.sin(arenaT * 0.07);
  c.lineWidth = 3;
  for (const s of [HERO_SPOT, FOE_SPOT]) {
    c.strokeStyle = `rgba(111, 227, 232, ${0.3 + 0.4 * p})`;
    c.beginPath();
    c.ellipse(s.x, s.y + 2, 120 + 5 * p, 28 + 3 * p, 0, 0, Math.PI * 2);
    c.stroke();
  }

  c.fillStyle = '#bff0fa';
  for (const m of motes) {
    m.y -= 0.25 * m.s;
    if (m.y < -4) {
      m.y = H + 4;
      m.x = Math.random() * W;
    }
    c.globalAlpha = 0.3 + 0.4 * m.s;
    c.fillRect(m.x, m.y, 2, 2);
  }
  c.globalAlpha = 1;
}

// Pixel particles for hits, shields, charge and healing.
function emitFx(x, y, color, count = 12, speed = 3) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    fxParticles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 30 + Math.random() * 12, color });
  }
}

function drawFx() {
  for (let i = fxParticles.length - 1; i >= 0; i--) {
    const p = fxParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life--;
    if (p.life <= 0) {
      fxParticles.splice(i, 1);
      continue;
    }
    c.globalAlpha = Math.min(1, p.life / 20);
    c.fillStyle = p.color;
    c.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
  c.globalAlpha = 1;
}
