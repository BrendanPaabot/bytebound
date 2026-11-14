// Boss rooms appear every BOSS_EVERY levels (see index.js). The mini boss uses the sprite sheets in
// img/miniboss/. For the final boss, drop a single image named img/finalboss/final-boss.png in place;
// it is used automatically on the last level of the run once it loads.

// Sheet layouts were measured from the art: frames run left to right, then top to bottom.
// crop = the area that holds the figure in each cell; feetY/centerX are measured inside the crop.
const BOSS_IDLE = {
  src: './img/miniboss/boss-idle-trimmed.png',
  cols: 5, cell: 256, frames: 18, msPerFrame: 130,
  crop: { x: 54, y: 40, w: 124, h: 180 }, centerX: 62, feetY: 178,
};
const BOSS_ATTACK = {
  src: './img/miniboss/boss-asm_custom_attack.png',
  cols: 5, cell: 512, frames: 25,
  crop: { x: 140, y: 262, w: 372, h: 250 }, centerX: 201, feetY: 199,
};
const BOSS_ATTACK_BUFFER = 2;            // ticks per attack frame
const BOSS_ATTACK_FRAMES = BOSS_ATTACK.frames;
const BOSS_BATTLE_HEIGHT = 240;          // on-screen height in battle
const BOSS_EXPLORE_HEIGHT = 150;         // on-screen height in the room
const FINAL_BOSS_SRC = './img/finalboss/final-boss.png';

const bossIdleImage = new Image();
bossIdleImage.src = BOSS_IDLE.src;
const bossAttackImage = new Image();
bossAttackImage.src = BOSS_ATTACK.src;
// The final boss image is only requested when the final level starts, so a missing file costs nothing before then.
const finalBossImage = new Image();
let finalBossRequested = false;
function requestFinalBossImage() {
  if (finalBossRequested) return;
  finalBossRequested = true;
  finalBossImage.src = FINAL_BOSS_SRC;
}
for (const [image, label] of [[bossIdleImage, 'boss idle'], [bossAttackImage, 'boss attack']]) {
  image.addEventListener('error', () => console.error(`Missing ${label} sprite sheet: ${image.getAttribute('src')}`), { once: true });
}

function drawFlipped(ctx, cx, faceLeft, flash, invert, draw) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (faceLeft) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }
  if (flash) ctx.filter = 'brightness(0) invert(1)';
  else if (invert) ctx.filter = 'invert(1)';
  draw();
  ctx.restore();
}

function drawBossPlaceholder(ctx, cx, feetY, height) {
  const width = height * 0.6;
  ctx.save();
  ctx.fillStyle = 'rgba(241, 237, 221, 0.9)';
  ctx.fillRect(cx - width / 2, feetY - height, width, height);
  ctx.strokeStyle = '#1d1a2a';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - width / 2, feetY - height, width, height);
  ctx.fillStyle = '#1d1a2a';
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOSS', cx, feetY - height / 2);
  ctx.restore();
}

// Draws the boss with its feet at feetY, centered on cx, scaled to `height` pixels tall.
function drawBossArt(ctx, boss, cx, feetY, height, opts = {}) {
  const faceLeft = Boolean(opts.faceLeft);
  if (boss.isFinal && finalBossImage.complete && finalBossImage.naturalWidth) {
    const width = finalBossImage.naturalWidth * (height / finalBossImage.naturalHeight);
    drawFlipped(ctx, cx, faceLeft, opts.flash, opts.invert, () => {
      ctx.drawImage(finalBossImage, cx - width / 2, feetY - height, width, height);
    });
    return;
  }

  const attacking = Boolean(opts.attacking);
  const sheet = attacking ? BOSS_ATTACK : BOSS_IDLE;
  const image = attacking ? bossAttackImage : bossIdleImage;
  if (!image.complete) return;
  if (!image.naturalWidth) {
    drawBossPlaceholder(ctx, cx, feetY, height);
    return;
  }

  const frame = attacking
    ? Math.min(sheet.frames - 1, Math.floor((opts.attackElapsed || 0) / BOSS_ATTACK_BUFFER))
    : Math.floor(performance.now() / BOSS_IDLE.msPerFrame) % sheet.frames;
  const col = frame % sheet.cols;
  const row = Math.floor(frame / sheet.cols);
  // One scale for both sheets, so the attack pose matches the idle size.
  const scale = height / BOSS_IDLE.crop.h;
  const dw = sheet.crop.w * scale;
  const dh = sheet.crop.h * scale;
  const dx = cx - sheet.centerX * scale;
  const dy = feetY - sheet.feetY * scale;
  const sx = col * sheet.cell + sheet.crop.x;
  const sy = row * sheet.cell + sheet.crop.y;
  drawFlipped(ctx, cx, faceLeft, opts.flash, opts.invert, () => {
    ctx.drawImage(image, sx, sy, sheet.crop.w, sheet.crop.h, dx, dy, dw, dh);
  });
}

class Boss extends Enemy {
  constructor(run, isFinal = false) {
    super(run, 0);
    this.isBoss = true;
    this.isFinal = isFinal;
    if (isFinal) requestFinalBossImage();
    this.brute = true;
    this.name = isFinal ? 'Final Boss' : 'Mini Boss';
    this.maxHp = isFinal ? 220 : 150;
    this.hp = this.maxHp;
    this.attack = isFinal ? 14 : 12;
    this.heavyEvery = 2;
    this.speed = 0.45;
    this.h = BOSS_EXPLORE_HEIGHT;
    this.w = (BOSS_IDLE.crop.w * BOSS_EXPLORE_HEIGHT) / BOSS_IDLE.crop.h;
    this.minX = run.c1 * 64 + 8;
    this.maxX = (run.c2 + 1) * 64 - this.w - 8;
    this.x = (this.minX + this.maxX) / 2;
    this.y = run.row * 64 - this.h;
  }

  draw() {
    if (!this.alive) return;
    drawBossArt(c, this, this.x + this.w / 2, this.y + this.h, this.h, { faceLeft: this.dir < 0 });
  }
}
