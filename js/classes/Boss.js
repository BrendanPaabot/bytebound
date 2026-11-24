// Boss rooms appear at mid-loop checkpoints and loop finales (see index.js).
// Mini Boss Kor uses boss-idle-trimmed.png / boss-asm_custom_attack.png;
// Final Boss King Crolue uses kingcrolue-idle.png / kingcrolue-attack.png.

// Sheet layouts were measured from the art: frames run left to right, then top to bottom.
// crop = the area that holds the figure in each cell; feetY/centerX are measured inside the crop.
const BOSS_IDLE = {
  src: './img/boss/boss-idle-trimmed.png',
  cols: 5, cell: 256, frames: 18, msPerFrame: 130,
  crop: { x: 54, y: 40, w: 124, h: 180 }, centerX: 62, feetY: 178,
};
const BOSS_ATTACK = {
  src: './img/boss/boss-asm_custom_attack.png',
  cols: 5, cell: 512, frames: 25,
  crop: { x: 140, y: 262, w: 372, h: 250 }, centerX: 201, feetY: 199,
};
const BOSS_ATTACK_BUFFER = 2;            // ticks per Kor attack frame
const BOSS_ATTACK_FRAMES = BOSS_ATTACK.frames;
const BOSS_BATTLE_HEIGHT = 240;          // on-screen height in battle
const BOSS_EXPLORE_HEIGHT = 150;         // on-screen height in the room

const KING_CROLUE_IDLE_SRC = './img/boss/kingcrolue-idle.png';
const KING_CROLUE_ATTACK_SRC = './img/boss/kingcrolue-attack.png';
const FINAL_BOSS_NAME = 'King Crolue';
const KING_CROLUE_IDLE_MS = 145;
const KING_CROLUE_IDLE_STAND_H = 132;
const KING_CROLUE_ATK_STAND_H = 107;
const KING_CROLUE_IDLE_FRAMES = [
  { x: 6, y: 7, width: 68, height: 132, anchorX: 39, feetY: 132 },
  { x: 85, y: 8, width: 76, height: 131, anchorX: 47.2, feetY: 131 },
  { x: 176, y: 10, width: 72, height: 128, anchorX: 42, feetY: 129 },
  { x: 267, y: 7, width: 67, height: 131, anchorX: 38.6, feetY: 131 },
  { x: 343, y: 4, width: 76, height: 132, anchorX: 47.5, feetY: 134 },
  { x: 433, y: 7, width: 76, height: 132, anchorX: 48.1, feetY: 132 },
  { x: 528, y: 7, width: 67, height: 132, anchorX: 38.3, feetY: 132 },
];
const KING_CROLUE_ATTACK_FRAMES = [
  { x: 4, y: 3, width: 90, height: 107, anchorX: 43.6, feetY: 106 },
  { x: 100, y: 4, width: 92, height: 105, anchorX: 52.2, feetY: 105 },
  { x: 198, y: 8, width: 93, height: 101, anchorX: 55.7, feetY: 101 },
  { x: 298, y: 7, width: 91, height: 102, anchorX: 62.3, feetY: 102 },
  { x: 396, y: 11, width: 92, height: 98, anchorX: 60.6, feetY: 98 },
  { x: 494, y: 24, width: 96, height: 96, anchorX: 72.5, feetY: 85 },
  { x: 0, y: 129, width: 119, height: 94, anchorX: 70.6, feetY: 81 },
  { x: 126, y: 129, width: 124, height: 94, anchorX: 67.8, feetY: 81 },
  { x: 263, y: 124, width: 328, height: 100, anchorX: 73.8, feetY: 86 },
  { x: 116, y: 235, width: 94, height: 92, anchorX: 52.2, feetY: 90 },
  { x: 211, y: 226, width: 95, height: 101, anchorX: 61.7, feetY: 99 },
  { x: 309, y: 226, width: 95, height: 101, anchorX: 54.1, feetY: 99 },
  { x: 404, y: 226, width: 96, height: 101, anchorX: 49.1, feetY: 99 },
  { x: 501, y: 226, width: 93, height: 101, anchorX: 51.6, feetY: 99 },
];
const KING_CROLUE_ATTACK_BUFFER = 3;     // ticks per step for dramatic ground-slam & shockwave
const KING_CROLUE_ATTACK_TIMELINE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13];

const bossIdleImage = new Image();
bossIdleImage.src = BOSS_IDLE.src;
const bossAttackImage = new Image();
bossAttackImage.src = BOSS_ATTACK.src;
const kingCrolueIdleImage = new Image();
kingCrolueIdleImage.src = KING_CROLUE_IDLE_SRC;
const kingCrolueAttackImage = new Image();
kingCrolueAttackImage.src = KING_CROLUE_ATTACK_SRC;
function requestFinalBossImage() {
  if (!kingCrolueIdleImage.getAttribute('src')) kingCrolueIdleImage.src = KING_CROLUE_IDLE_SRC;
  if (!kingCrolueAttackImage.getAttribute('src')) kingCrolueAttackImage.src = KING_CROLUE_ATTACK_SRC;
}
function getBossAttackDuration(boss) {
  if (boss?.isFinal) return KING_CROLUE_ATTACK_TIMELINE.length * KING_CROLUE_ATTACK_BUFFER;
  return BOSS_ATTACK_FRAMES * BOSS_ATTACK_BUFFER;
}
for (const [image, label] of [
  [bossIdleImage, 'boss idle'],
  [bossAttackImage, 'boss attack'],
  [kingCrolueIdleImage, 'king crolue idle'],
  [kingCrolueAttackImage, 'king crolue attack'],
]) {
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

function drawKingCrolue(ctx, cx, feetY, height, opts = {}) {
  const attacking = Boolean(opts.attacking);
  const image = attacking ? kingCrolueAttackImage : kingCrolueIdleImage;
  if (!image.complete) return;
  if (!image.naturalWidth) {
    drawBossPlaceholder(ctx, cx, feetY, height);
    return;
  }

  let frameData;
  let frameIndex = 0;
  if (attacking) {
    const step = Math.min(
      KING_CROLUE_ATTACK_TIMELINE.length - 1,
      Math.max(0, Math.floor((opts.attackElapsed || 0) / KING_CROLUE_ATTACK_BUFFER))
    );
    frameIndex = KING_CROLUE_ATTACK_TIMELINE[step];
    frameData = KING_CROLUE_ATTACK_FRAMES[frameIndex];
  } else {
    frameIndex = opts.frozen ? 0 : Math.floor(performance.now() / KING_CROLUE_IDLE_MS) % KING_CROLUE_IDLE_FRAMES.length;
    frameData = KING_CROLUE_IDLE_FRAMES[frameIndex];
  }

  const standHeight = attacking ? KING_CROLUE_ATK_STAND_H : KING_CROLUE_IDLE_STAND_H;
  const scale = height / standHeight;
  const dw = frameData.width * scale;
  const dh = frameData.height * scale;
  const dx = cx - frameData.anchorX * scale;
  const dy = feetY - frameData.feetY * scale;
  const shockwaveActive = attacking && frameIndex >= 5 && frameIndex <= 8;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);

  if (!opts.flash && !opts.invert) {
    ctx.save();
    ctx.fillStyle = shockwaveActive ? 'rgba(205, 32, 46, 0.34)' : `rgba(155, 22, 34, ${(0.16 + 0.12 * pulse).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx, feetY + 2, height * (shockwaveActive ? 0.44 : 0.28), Math.max(5, height * 0.045), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawFlipped(ctx, cx, Boolean(opts.faceLeft), opts.flash, opts.invert, () => {
    if (!opts.flash && !opts.invert) {
      ctx.shadowColor = shockwaveActive ? 'rgba(240, 52, 68, 0.85)' : 'rgba(180, 28, 42, 0.55)';
      ctx.shadowBlur = shockwaveActive ? 22 : 10 + 4 * pulse;
    }
    ctx.drawImage(
      image,
      frameData.x,
      frameData.y,
      frameData.width,
      frameData.height,
      dx,
      dy,
      dw,
      dh
    );
  });
}

// Draws the boss with its feet at feetY, centered on cx, scaled to `height` pixels tall.
function drawBossArt(ctx, boss, cx, feetY, height, opts = {}) {
  if (boss?.isFinal) {
    drawKingCrolue(ctx, cx, feetY, height, opts);
    return;
  }

  const faceLeft = Boolean(opts.faceLeft);
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
    : opts.frozen
      ? 0
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
  constructor(run, isFinal = false, opts = {}) {
    super(run, 0, opts);
    this.isBoss = true;
    this.isFinal = isFinal;
    this.grenu = !isFinal && Boolean(opts.grenu);
    this.kor = !isFinal && !this.grenu;
    if (isFinal) requestFinalBossImage();
    this.brute = !this.grenu;
    this.name = isFinal ? FINAL_BOSS_NAME : this.grenu ? 'Mini Boss Grenu' : 'Mini Boss Kor';
    this.maxHp = isFinal ? 220 : this.grenu ? 165 : 150;
    this.hp = this.maxHp;
    this.attack = isFinal ? 14 : this.grenu ? 13 : 12;
    this.heavyEvery = 2;
    this.speed = this.grenu ? 0.45 : 0;
    this.dir = -1;
    this.h = BOSS_EXPLORE_HEIGHT;
    this.w = this.grenu
      ? PIG_W * (BOSS_EXPLORE_HEIGHT / PIG_H)
      : isFinal
        ? (KING_CROLUE_IDLE_FRAMES[0].width * BOSS_EXPLORE_HEIGHT) / KING_CROLUE_IDLE_STAND_H
        : (BOSS_IDLE.crop.w * BOSS_EXPLORE_HEIGHT) / BOSS_IDLE.crop.h;
    this.minX = run.c1 * 64 + 8;
    this.maxX = (run.c2 + 1) * 64 - this.w - 8;
    this.x = (this.minX + this.maxX) / 2;
    this.y = run.row * 64 - this.h;
  }

  update() {
    if (!this.alive) return;
    if (this.grenu) {
      super.update();
      return;
    }
    if (typeof player !== 'undefined' && player) {
      const px = player.position ? player.position.x : (player.x || 0);
      const playerCenter = px + (player.width || 0) / 2;
      const bossCenter = this.x + this.w / 2;
      this.dir = playerCenter <= bossCenter ? -1 : 1;
    }
  }

  draw(frozen = false) {
    if (!this.alive) return;
    if (this.grenu) {
      drawPig(c, this.x, this.y, this.h / PIG_H, this.dir < 0, { animated: !frozen, idle: frozen, grenu: true });
      return;
    }
    drawBossArt(c, this, this.x + this.w / 2, this.y + this.h, this.h, { faceLeft: this.dir < 0, frozen });
  }
}
