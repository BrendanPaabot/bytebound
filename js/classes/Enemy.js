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
// Light outline drawn around each virus so it stays readable on the dark room floors.
const OUTLINE_PAD = 2;
const OUTLINE_COLOR = '#f1eddd';

const virusWalkSpriteSheet = new Image();
virusWalkSpriteSheet.src = './img/bug/virus_walk.png';
const virusIdleSpriteSheet = new Image();
virusIdleSpriteSheet.src = './img/bug/virus_idle.png';
for (const sheet of [virusWalkSpriteSheet, virusIdleSpriteSheet]) {
  sheet.addEventListener('error', () => {
    console.error(`Missing enemy sprite sheet: ${sheet.getAttribute('src')}. Check the img/bug folder name and file name.`);
  }, { once: true });
}

const frameCache = new WeakMap();
const outlineCache = new WeakMap();

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
  ctx.font = '12px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('V', x + width / 2, y + height / 2);
  ctx.restore();
}

function drawPig(ctx, x, y, s, faceLeft, opts = {}) {
  const sheet = opts.idle ? virusIdleSpriteSheet : virusWalkSpriteSheet;
  const configured = opts.idle ? VIRUS_IDLE_FRAMES : VIRUS_WALK_FRAMES;
  const frameDuration = opts.idle ? VIRUS_IDLE_FRAME_DURATION : PIG_FRAME_DURATION;
  const width = PIG_W * s;
  const height = PIG_H * s;

  if (!sheet.complete) return; // still loading
  if (!sheet.naturalWidth) {   // failed to load: show a visible stand-in instead of nothing
    drawPlaceholder(ctx, x, y, width, height);
    return;
  }

  const frames = resolveFrames(sheet, configured);
  const frame = opts.animated
    ? Math.floor(performance.now() / frameDuration) % frames.length
    : 0;
  const rect = frames[frame];
  // The outlined sheet has OUTLINE_PAD extra pixels on each side, so widen the source to include them.
  const source = {
    x: rect.x,
    y: rect.y,
    width: rect.width + OUTLINE_PAD * 2,
    height: rect.height + OUTLINE_PAD * 2,
  };
  const frameScale = Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * frameScale;
  const drawHeight = source.height * frameScale;

  ctx.save();
  ctx.translate(x + (faceLeft ? width : 0), y);
  if (faceLeft) {
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingEnabled = false;
  if (opts.flash) ctx.filter = 'brightness(0) invert(1)';
  else if (opts.invert) ctx.filter = 'invert(1)';
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.drawImage(
    outlinedSheet(sheet),
    source.x,
    source.y,
    source.width,
    source.height,
    (width - drawWidth) / 2,
    height - drawHeight,
    drawWidth,
    drawHeight
  );
  ctx.restore();
}

class Enemy {
  // `run` is a walkable platform {row, c1, c2} read from the level's collision grid.
  constructor(run, index) {
    this.brute = index % 3 === 2;
    this.name = this.brute ? 'Virus Brute' : 'Virus Grunt';
    this.maxHp = this.brute ? 70 : 40;
    this.hp = this.maxHp;
    this.attack = this.brute ? 12 : 8;
    this.turns = 0;
    // Drawn about as tall as the king so the viruses stand out in the rooms.
    this.scale = this.brute ? 2.1 : 1.8;
    this.w = PIG_W * this.scale;
    this.h = PIG_H * this.scale;
    this.minX = run.c1 * 64 + 8;
    this.maxX = (run.c2 + 1) * 64 - this.w - 8;
    this.x = this.minX + Math.random() * (this.maxX - this.minX);
    this.y = run.row * 64 - this.h;
    this.dir = index % 2 ? -1 : 1;
    this.speed = 0.6;
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

  draw() {
    if (this.alive) drawPig(c, this.x, this.y, this.scale, this.dir < 0, { animated: true });
  }
}
