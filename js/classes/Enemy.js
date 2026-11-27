const PIG_W = 48;
const PIG_H = 36;
// Hand-measured frame rectangles for the current virus sheets. If a replaced sheet is
// too small for these, resolveFrames() slices the sheet evenly instead of drawing nothing.
const VIRUS_WALK_FRAMES = [
  { x: 2, y: 3, width: 54, height: 105 },
  { x: 95, y: 2, width: 82, height: 106 },
  { x: 221, y: 2, width: 54, height: 106 },
  { x: 325, y: 3, width: 52, height: 105 },
  { x: 433, y: 2, width: 55, height: 106 },
  { x: 542, y: 2, width: 54, height: 106 },
];
const VIRUS_IDLE_FRAMES = [
  { x: 2, y: 0, width: 56, height: 107 },
  { x: 107, y: 0, width: 56, height: 107 },
  { x: 216, y: 0, width: 56, height: 107 },
  { x: 326, y: 0, width: 56, height: 107 },
  { x: 434, y: 0, width: 56, height: 107 },
  { x: 544, y: 0, width: 56, height: 107 },
];
const PIG_FRAME_DURATION = 140;
const VIRUS_IDLE_FRAME_DURATION = 200;
const DRIUS_IDLE_FRAMES = [
  { x: 19, y: 10, width: 104, height: 152 },
  { x: 135, y: 10, width: 110, height: 152 },
  { x: 257, y: 10, width: 106, height: 152 },
  { x: 375, y: 10, width: 96, height: 152 },
  { x: 481, y: 10, width: 93, height: 152 },
  { x: 21, y: 173, width: 108, height: 152 },
  { x: 141, y: 173, width: 108, height: 152 },
  { x: 258, y: 173, width: 104, height: 152 },
  { x: 371, y: 173, width: 101, height: 152 },
  { x: 482, y: 173, width: 98, height: 152 },
];
const DRIUS_WALK_FRAMES = [
  { x: 16, y: 32, width: 75, height: 133 },
  { x: 103, y: 32, width: 71, height: 133 },
  { x: 187, y: 32, width: 73, height: 133 },
  { x: 273, y: 32, width: 70, height: 133 },
  { x: 353, y: 32, width: 65, height: 133 },
  { x: 434, y: 32, width: 75, height: 133 },
  { x: 516, y: 32, width: 73, height: 133 },
  { x: 16, y: 181, width: 71, height: 135 },
  { x: 102, y: 181, width: 63, height: 135 },
  { x: 185, y: 181, width: 68, height: 135 },
  { x: 268, y: 181, width: 71, height: 135 },
  { x: 353, y: 181, width: 63, height: 135 },
  { x: 435, y: 181, width: 65, height: 135 },
  { x: 514, y: 181, width: 78, height: 135 },
];
const DRIUS_IDLE_FRAME_DURATION = 130;
const DRIUS_WALK_FRAME_DURATION = 85;
const DRIUS_ATTACK_FRAMES = [
  { x: 0, y: 0, width: 123, height: 166 },
  { x: 123, y: 0, width: 132, height: 166 },
  { x: 255, y: 0, width: 115, height: 166 },
  { x: 370, y: 0, width: 120, height: 166 },
  { x: 490, y: 0, width: 110, height: 166 },
  { x: 0, y: 166, width: 137, height: 166 },
  { x: 137, y: 166, width: 128, height: 166 },
  { x: 265, y: 166, width: 108, height: 166 },
  { x: 373, y: 166, width: 98, height: 166 },
  { x: 471, y: 166, width: 129, height: 166 },
];
const DRIUS_ATTACK_FRAMES_COUNT = DRIUS_ATTACK_FRAMES.length;
const DRIUS_ATTACK_BUFFER = 3;
const NYRMED_WALK_FRAMES = [
  { x: 0, y: 22, width: 138, height: 154, anchorX: 71.7 },
  { x: 138, y: 22, width: 119, height: 154, anchorX: 58.3 },
  { x: 257, y: 22, width: 110, height: 154, anchorX: 50 },
  { x: 367, y: 22, width: 112, height: 154, anchorX: 50.3 },
  { x: 479, y: 22, width: 119, height: 154, anchorX: 51.1 },
  { x: 0, y: 217, width: 117, height: 157, anchorX: 68.5 },
  { x: 117, y: 217, width: 122, height: 157, anchorX: 69 },
  { x: 239, y: 217, width: 103, height: 157, anchorX: 62 },
  { x: 342, y: 217, width: 128, height: 157, anchorX: 70.5 },
  { x: 470, y: 217, width: 128, height: 157, anchorX: 59.8 },
  { x: 0, y: 421, width: 112, height: 154, anchorX: 68.6 },
  { x: 112, y: 421, width: 146, height: 154, anchorX: 75.7 },
  { x: 258, y: 421, width: 100, height: 154, anchorX: 47.2 },
  { x: 358, y: 421, width: 120, height: 154, anchorX: 58.5 },
  { x: 478, y: 421, width: 120, height: 154, anchorX: 51.8 },
];
const NYRMED_WALK_FRAME_DURATION = 85;
const NYRMED_IDLE_FRAMES = [
  { x: 0, y: 18, width: 123, height: 138, anchorX: 63 },
  { x: 123, y: 18, width: 112, height: 138, anchorX: 57.6 },
  { x: 235, y: 18, width: 118, height: 138, anchorX: 63.5 },
  { x: 353, y: 18, width: 129, height: 138, anchorX: 66.3 },
  { x: 482, y: 18, width: 118, height: 138, anchorX: 57.1 },
  { x: 0, y: 293, width: 123, height: 133, anchorX: 65.3 },
  { x: 123, y: 293, width: 115, height: 133, anchorX: 58.6 },
  { x: 238, y: 293, width: 124, height: 133, anchorX: 62.6 },
  { x: 362, y: 293, width: 120, height: 133, anchorX: 61.9 },
  { x: 482, y: 293, width: 118, height: 133, anchorX: 57.7 },
];
const NYRMED_IDLE_FRAME_DURATION = 130;
const GRENU_WALK_FRAMES = [
  { x: 3, y: 5, width: 65, height: 99, anchorX: 34.6 },
  { x: 78, y: 5, width: 68, height: 99, anchorX: 37.6 },
  { x: 157, y: 5, width: 68, height: 99, anchorX: 37.6 },
  { x: 235, y: 5, width: 66, height: 99, anchorX: 34.6 },
  { x: 310, y: 5, width: 66, height: 99, anchorX: 34.7 },
  { x: 384, y: 5, width: 64, height: 99, anchorX: 33.2 },
  { x: 458, y: 5, width: 65, height: 99, anchorX: 34.1 },
  { x: 532, y: 5, width: 65, height: 99, anchorX: 34.4 },
];
const GRENU_WALK_FRAME_DURATION = 95;
const GRENU_IDLE_FRAMES = [
  { x: 1, y: 9, width: 100, height: 166, anchorX: 54.2 },
  { x: 118, y: 9, width: 110, height: 166, anchorX: 56.3 },
  { x: 250, y: 9, width: 100, height: 166, anchorX: 48.4 },
  { x: 360, y: 9, width: 115, height: 166, anchorX: 59.3 },
  { x: 489, y: 9, width: 105, height: 166, anchorX: 50.3 },
  { x: 3, y: 212, width: 108, height: 168, anchorX: 51.7 },
  { x: 122, y: 212, width: 108, height: 168, anchorX: 50.8 },
  { x: 241, y: 212, width: 107, height: 168, anchorX: 49.9 },
  { x: 365, y: 212, width: 108, height: 168, anchorX: 48 },
  { x: 485, y: 212, width: 115, height: 168, anchorX: 53 },
  { x: 0, y: 416, width: 103, height: 167, anchorX: 55.7 },
  { x: 118, y: 416, width: 107, height: 167, anchorX: 59.6 },
  { x: 242, y: 416, width: 105, height: 167, anchorX: 55.8 },
  { x: 361, y: 416, width: 105, height: 167, anchorX: 57 },
  { x: 483, y: 416, width: 104, height: 167, anchorX: 55.8 },
];
const GRENU_IDLE_FRAME_DURATION = 110;
// Light outline drawn around each virus so it stays readable on the dark room floors.
const OUTLINE_PAD = 2;
const OUTLINE_COLOR = '#f1eddd';

const virusWalkSpriteSheet = new Image();
virusWalkSpriteSheet.src = './img/bug/virus_walk.png';
const virusIdleSpriteSheet = new Image();
virusIdleSpriteSheet.src = './img/bug/virus_idle.png';
const driusWalkSpriteSheet = new Image();
driusWalkSpriteSheet.src = './img/bug/virus-fitted-walking.png';
const driusIdleSpriteSheet = new Image();
driusIdleSpriteSheet.src = './img/bug/virus-fitted-idle.png';
const driusAttackSpriteSheet = new Image();
driusAttackSpriteSheet.src = './img/bug/virus-fitted-attack.png';
const nyrmedWalkSpriteSheet = new Image();
nyrmedWalkSpriteSheet.src = './img/boss/nyrmed-walking.png';
const nyrmedIdleSpriteSheet = new Image();
nyrmedIdleSpriteSheet.src = './img/boss/nyrmed-idle.png';
const grenuWalkSpriteSheet = new Image();
grenuWalkSpriteSheet.src = './img/boss/grenu-walk.png';
const grenuIdleSpriteSheet = new Image();
grenuIdleSpriteSheet.src = './img/boss/grenu-idle.png';
for (const sheet of [virusWalkSpriteSheet, virusIdleSpriteSheet, driusWalkSpriteSheet, driusIdleSpriteSheet, driusAttackSpriteSheet, nyrmedWalkSpriteSheet, nyrmedIdleSpriteSheet, grenuWalkSpriteSheet, grenuIdleSpriteSheet]) {
  sheet.addEventListener('error', () => {
    console.error(`Missing enemy sprite sheet: ${sheet.getAttribute('src')}. Check the img/bug folder name and file name.`);
  }, { once: true });
}

const frameCache = new WeakMap();
const outlineCache = new WeakMap();
const frameOutlineCache = new WeakMap();

// Crops a single frame first so neighboring frames on packed sheets never bleed silhouettes into it.
function outlinedFrame(sheet, rect) {
  let map = frameOutlineCache.get(sheet);
  if (!map) {
    map = new Map();
    frameOutlineCache.set(sheet, map);
  }
  const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
  if (map.has(key)) return map.get(key);

  const pad = OUTLINE_PAD;
  const sil = document.createElement('canvas');
  sil.width = rect.width;
  sil.height = rect.height;
  const sctx = sil.getContext('2d');
  sctx.drawImage(sheet, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = OUTLINE_COLOR;
  sctx.fillRect(0, 0, rect.width, rect.height);

  const out = document.createElement('canvas');
  out.width = rect.width + pad * 2;
  out.height = rect.height + pad * 2;
  const octx = out.getContext('2d');
  for (const ox of [0, pad, pad * 2]) {
    for (const oy of [0, pad, pad * 2]) {
      if (ox === pad && oy === pad) continue;
      octx.drawImage(sil, ox, oy);
    }
  }
  octx.drawImage(sheet, rect.x, rect.y, rect.width, rect.height, pad, pad, rect.width, rect.height);
  map.set(key, out);
  return out;
}

// Uses the measured frames when they fit the sheet; otherwise slices the sheet into equal columns.
function resolveFrames(sheet, frames) {
  if (!frameCache.has(sheet)) {
    const fits = frames.every((f) =>
      f.x >= 0 && f.y >= 0 &&
      f.x + f.width <= sheet.naturalWidth &&
      f.y + f.height <= sheet.naturalHeight
    );
    const count = frames.length;
    const sliceWidth = Math.floor(sheet.naturalWidth / count);
    frameCache.set(sheet, fits ? frames : Array.from({ length: count }, (_, i) => ({
      x: i * sliceWidth, y: 0, width: sliceWidth, height: sheet.naturalHeight,
    })));
  }
  return frameCache.get(sheet);
}

// Builds a copy of the sheet with a light silhouette outline, once per sheet.
function outlinedSheet(sheet) {
  if (outlineCache.has(sheet)) return outlineCache.get(sheet);
  const pad = OUTLINE_PAD;
  const w = sheet.naturalWidth;
  const h = sheet.naturalHeight;

  const silhouette = document.createElement('canvas');
  silhouette.width = w;
  silhouette.height = h;
  const sctx = silhouette.getContext('2d');
  sctx.drawImage(sheet, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = OUTLINE_COLOR;
  sctx.fillRect(0, 0, w, h);

  const out = document.createElement('canvas');
  out.width = w + pad * 2;
  out.height = h + pad * 2;
  const octx = out.getContext('2d');
  for (const ox of [0, pad, pad * 2]) {
    for (const oy of [0, pad, pad * 2]) {
      if (ox === pad && oy === pad) continue; // the sprite itself goes here
      octx.drawImage(silhouette, ox, oy);
    }
  }
  octx.drawImage(sheet, pad, pad);
  outlineCache.set(sheet, out);
  return out;
}

function drawPlaceholder(ctx, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(241, 237, 221, 0.9)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#1d1a2a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#1d1a2a';
  ctx.font = window.ByteboundFont.canvas(12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('V', x + width / 2, y + height / 2);
  ctx.restore();
}

function drawPig(ctx, x, y, s, faceLeft, opts = {}) {
  const isNyrmed = Boolean(opts.nyrmed);
  const isGrenu = !isNyrmed && Boolean(opts.grenu);
  const isDriusAttack = !isNyrmed && !isGrenu && Boolean(opts.brute && opts.attacking);
  const sheet = isNyrmed
    ? (opts.idle ? nyrmedIdleSpriteSheet : nyrmedWalkSpriteSheet)
    : isGrenu
      ? (opts.idle ? grenuIdleSpriteSheet : grenuWalkSpriteSheet)
      : isDriusAttack
        ? driusAttackSpriteSheet
        : opts.brute
          ? (opts.idle ? driusIdleSpriteSheet : driusWalkSpriteSheet)
          : (opts.idle ? virusIdleSpriteSheet : virusWalkSpriteSheet);
  const configured = isNyrmed
    ? (opts.idle ? NYRMED_IDLE_FRAMES : NYRMED_WALK_FRAMES)
    : isGrenu
      ? (opts.idle ? GRENU_IDLE_FRAMES : GRENU_WALK_FRAMES)
      : isDriusAttack
        ? DRIUS_ATTACK_FRAMES
        : opts.brute
          ? (opts.idle ? DRIUS_IDLE_FRAMES : DRIUS_WALK_FRAMES)
          : (opts.idle ? VIRUS_IDLE_FRAMES : VIRUS_WALK_FRAMES);
  const frameDuration = isNyrmed
    ? (opts.idle ? NYRMED_IDLE_FRAME_DURATION : NYRMED_WALK_FRAME_DURATION)
    : isGrenu
      ? (opts.idle ? GRENU_IDLE_FRAME_DURATION : GRENU_WALK_FRAME_DURATION)
      : opts.brute
        ? (opts.idle ? DRIUS_IDLE_FRAME_DURATION : DRIUS_WALK_FRAME_DURATION)
        : (opts.idle ? VIRUS_IDLE_FRAME_DURATION : PIG_FRAME_DURATION);
  const width = PIG_W * s;
  const height = PIG_H * s;

  if (!sheet.complete) return; // still loading
  if (!sheet.naturalWidth) {   // failed to load: show a visible stand-in instead of nothing
    drawPlaceholder(ctx, x, y, width, height);
    return;
  }

  const frames = resolveFrames(sheet, configured);
  const frame = isDriusAttack
    ? Math.min(frames.length - 1, Math.floor((opts.attackElapsed || 0) / (opts.attackBuffer || DRIUS_ATTACK_BUFFER)))
    : (opts.animated
      ? Math.floor(performance.now() / frameDuration) % frames.length
      : 0);
  const rect = frames[frame];
  // The outlined sheet has OUTLINE_PAD extra pixels on each side, so widen the source to include them.
  const source = {
    x: rect.x,
    y: rect.y,
    width: rect.width + OUTLINE_PAD * 2,
    height: rect.height + OUTLINE_PAD * 2,
  };
  const frameScale = opts.nyrmed
    ? (height / ((opts.idle ? 138 : 157) + OUTLINE_PAD * 2))
    : opts.grenu
      ? (height / ((opts.idle ? 168 : 99) + OUTLINE_PAD * 2))
      : opts.brute
        ? (height / source.height)
        : Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * frameScale;
  const drawHeight = source.height * frameScale;
  const drawX = typeof rect.anchorX === 'number'
    ? (width / 2 - (rect.anchorX + OUTLINE_PAD) * frameScale)
    : ((width - drawWidth) / 2);

  ctx.save();
  ctx.translate(x + (faceLeft ? width : 0), y);
  if (faceLeft) {
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingEnabled = false;
  if (opts.flash) ctx.filter = 'brightness(0) invert(1)';
  else if (opts.invert) ctx.filter = 'invert(1)';
  if (!opts.brute && !opts.nyrmed && !opts.grenu) {
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
  }
  const isolateFrame = Boolean(opts.nyrmed || opts.brute || opts.grenu);
  const drawImg = isolateFrame ? outlinedFrame(sheet, rect) : outlinedSheet(sheet);
  const drawSx = isolateFrame ? 0 : source.x;
  const drawSy = isolateFrame ? 0 : source.y;
  ctx.drawImage(
    drawImg,
    drawSx,
    drawSy,
    source.width,
    source.height,
    drawX,
    height - drawHeight,
    drawWidth,
    drawHeight
  );
  ctx.restore();
}

class Enemy {
  // `run` is a walkable platform {row, c1, c2} read from the level's collision grid.
  constructor(run, index, opts = {}) {
    this.nyrmed = Boolean(opts.nyrmed);
    this.grenu = !this.nyrmed && Boolean(opts.grenu);
    this.brute = !this.nyrmed && !this.grenu && (Boolean(opts.brute) || index % 3 === 2);
    this.name = this.nyrmed ? 'Nyrmed' : this.grenu ? 'Grenu' : this.brute ? 'Drius' : 'Virus Grunt';
    this.maxHp = this.nyrmed ? 95 : this.grenu ? 85 : this.brute ? 70 : 40;
    this.hp = this.maxHp;
    this.attack = this.nyrmed ? 15 : this.grenu ? 13 : this.brute ? 12 : 8;
    this.turns = 0;
    this.loopTier = 0;
    this.loopArmor = 0;
    this.loopDmgReduction = 0;
    // Drawn about as tall as the king so the viruses stand out in the rooms; Nyrmed is slightly larger than Drius.
    this.scale = this.nyrmed ? 2.45 : this.grenu ? 2.15 : this.brute ? 2.1 : 1.8;
    this.w = PIG_W * this.scale;
    this.h = PIG_H * this.scale;
    this.minX = run.c1 * 64 + 8;
    this.maxX = (run.c2 + 1) * 64 - this.w - 8;
    this.x = this.minX + Math.random() * (this.maxX - this.minX);
    this.y = run.row * 64 - this.h;
    this.dir = index % 2 ? -1 : 1;
    this.speed = this.nyrmed ? 0.72 : this.grenu ? 0.65 : 0.6;
    this.alive = true;
  }

  // Scales this foe for a later pass through the rooms.
  scaleStats(hpScale, atkScale) {
    this.maxHp = Math.round(this.maxHp * hpScale);
    this.hp = this.maxHp;
    this.attack = Math.round(this.attack * atkScale);
  }

  update() {
    if (!this.alive) return;
    this.x += this.dir * this.speed;
    if (this.x < this.minX) { this.x = this.minX; this.dir = 1; }
    if (this.x > this.maxX) { this.x = this.maxX; this.dir = -1; }
  }

  draw(frozen = false) {
    if (this.alive) drawPig(c, this.x, this.y, this.scale, this.dir < 0, { animated: !frozen, idle: frozen, brute: this.brute, nyrmed: this.nyrmed, grenu: this.grenu });
  }
}
