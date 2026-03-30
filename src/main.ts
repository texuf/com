import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

// ---- Text measurement ----
const TEXT = "texuf";
const FILL_RATIO = 2 / 3;
const FONT_FAMILY = "Arial, sans-serif";
const FONT_WEIGHT = "bold";
const REF_SIZE = 100;

const refFont = `${FONT_WEIGHT} ${REF_SIZE}px ${FONT_FAMILY}`;
const refPrepared = prepareWithSegments(TEXT, refFont);
const { lines: refLines } = layoutWithLines(refPrepared, 99999, REF_SIZE);
const refWidth = refLines[0].width;

// ---- Monospace ASCII art config ----
const MONO_FONT_SIZE = 14;
const MONO_LINE_HEIGHT = 16;
const MONO_RAMP = " .`-_:,;^=+/|)\\!?0oOQ#%@";
const MONO_FONT = `400 ${MONO_FONT_SIZE}px "Courier New", Courier, monospace`;
const MONO_COLOR = "rgba(130, 155, 210, 0.7)";

// Measure monospace character width
const tmpC = document.createElement("canvas");
tmpC.width = 100;
tmpC.height = 50;
const tmpX = tmpC.getContext("2d")!;
tmpX.font = MONO_FONT;
const MONO_CHAR_W = tmpX.measureText("M").width;

// ---- Particle simulation config (fixed coordinate space) ----
const SIM_W = 220;
const SIM_H = 142;
const PARTICLE_N = 120;
const SPRITE_R = 14;
const ATTRACTOR_R = 12;
const LARGE_ATTRACTOR_R = 30;
const ATTRACTOR_FORCE_1 = 0.22;
const ATTRACTOR_FORCE_2 = 0.05;
const FIELD_DECAY = 0.82;
const FIELD_OVERSAMPLE = 2;

// ---- Canvas ----
const canvas = document.getElementById("display") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const measureCtx = document.createElement("canvas").getContext("2d")!;

// ---- Dynamic state ----
let cols = 1;
let rows = 1;
let fieldCols = 2;
let fieldRows = 2;
let W = 100;
let H = 100;
let textFontSize = 100;
let textDrawX = 0;
let textDrawY = 0;
let dpr = 1;
let brightnessField = new Float32Array(4);
let fsx = 1;
let fsy = 1;

// ---- Particles ----
type Particle = { x: number; y: number; vx: number; vy: number };
const particles: Particle[] = [];
for (let i = 0; i < PARTICLE_N; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * 40 + 20;
  particles.push({
    x: SIM_W / 2 + Math.cos(a) * r,
    y: SIM_H / 2 + Math.sin(a) * r,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
  });
}

// ---- Field stamps ----
type Stamp = {
  rx: number;
  ry: number;
  sx: number;
  sy: number;
  v: Float32Array;
};

function spriteAlpha(d: number): number {
  if (d >= 1) return 0;
  if (d <= 0.35) return 0.45 - 0.3 * (d / 0.35);
  return 0.15 * (1 - (d - 0.35) / 0.65);
}

function makeStamp(rpx: number): Stamp {
  const frx = rpx * fsx;
  const fry = rpx * fsy;
  const rx = Math.ceil(frx);
  const ry = Math.ceil(fry);
  const sx = rx * 2 + 1;
  const sy = ry * 2 + 1;
  const v = new Float32Array(sx * sy);
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++)
      v[(y + ry) * sx + x + rx] = spriteAlpha(
        Math.sqrt((x / frx) ** 2 + (y / fry) ** 2),
      );
  return { rx, ry, sx, sy, v };
}

let pStamp: Stamp;
let lgStamp: Stamp;
let smStamp: Stamp;

function splat(cx: number, cy: number, s: Stamp): void {
  const gx0 = Math.round(cx * fsx);
  const gy0 = Math.round(cy * fsy);
  for (let y = -s.ry; y <= s.ry; y++) {
    const gy = gy0 + y;
    if (gy < 0 || gy >= fieldRows) continue;
    const fo = gy * fieldCols;
    const so = (y + s.ry) * s.sx;
    for (let x = -s.rx; x <= s.rx; x++) {
      const gx = gx0 + x;
      if (gx < 0 || gx >= fieldCols) continue;
      const sv = s.v[so + x + s.rx]!;
      if (sv === 0) continue;
      const fi = fo + gx;
      brightnessField[fi] = Math.min(1, brightnessField[fi]! + sv);
    }
  }
}

// ---- Resize ----
function resize(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  dpr = window.devicePixelRatio || 1;

  // Compute font size to fill 2/3 of viewport
  const sx = (vw * FILL_RATIO) / refWidth;
  const sy = (vh * FILL_RATIO) / REF_SIZE;
  textFontSize = REF_SIZE * Math.min(sx, sy);

  // Get actual text bounding box at this font size
  measureCtx.font = `${FONT_WEIGHT} ${textFontSize}px ${FONT_FAMILY}`;
  const m = measureCtx.measureText(TEXT);
  W = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  H = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  textDrawX = m.actualBoundingBoxLeft;
  textDrawY = m.actualBoundingBoxAscent;

  // Set canvas pixel size (scaled for DPR)
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  // Compute character grid (overshoot by 1 to ensure full coverage)
  cols = Math.max(1, Math.ceil(W / MONO_CHAR_W) + 1);
  rows = Math.max(1, Math.ceil(H / MONO_LINE_HEIGHT) + 1);
  fieldCols = cols * FIELD_OVERSAMPLE;
  fieldRows = rows * FIELD_OVERSAMPLE;
  brightnessField = new Float32Array(fieldCols * fieldRows);

  // Field scale: maps SIM coordinates to field grid coordinates
  fsx = fieldCols / SIM_W;
  fsy = fieldRows / SIM_H;

  // Recreate stamps at new scale
  pStamp = makeStamp(SPRITE_R);
  lgStamp = makeStamp(LARGE_ATTRACTOR_R);
  smStamp = makeStamp(ATTRACTOR_R);
}

resize();
window.addEventListener("resize", resize);

// ---- Render loop ----
function render(now: number): void {
  // Attractor positions (in SIM coordinate space)
  const a1x = Math.cos(now * 0.0007) * SIM_W * 0.25 + SIM_W / 2;
  const a1y = Math.sin(now * 0.0011) * SIM_H * 0.3 + SIM_H / 2;
  const a2x = Math.cos(now * 0.0013 + Math.PI) * SIM_W * 0.2 + SIM_W / 2;
  const a2y = Math.sin(now * 0.0009 + Math.PI) * SIM_H * 0.25 + SIM_H / 2;

  // Update particles (in SIM coordinate space)
  for (const p of particles) {
    const d1x = a1x - p.x;
    const d1y = a1y - p.y;
    const d2x = a2x - p.x;
    const d2y = a2y - p.y;
    const dist1 = d1x * d1x + d1y * d1y;
    const dist2 = d2x * d2x + d2y * d2y;
    const ax = dist1 < dist2 ? d1x : d2x;
    const ay = dist1 < dist2 ? d1y : d2y;
    const d = Math.sqrt(Math.min(dist1, dist2)) + 1;
    const f = dist1 < dist2 ? ATTRACTOR_FORCE_1 : ATTRACTOR_FORCE_2;
    p.vx += (ax / d) * f + (Math.random() - 0.5) * 0.25;
    p.vy += (ay / d) * f + (Math.random() - 0.5) * 0.25;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -SPRITE_R) p.x += SIM_W + SPRITE_R * 2;
    if (p.x > SIM_W + SPRITE_R) p.x -= SIM_W + SPRITE_R * 2;
    if (p.y < -SPRITE_R) p.y += SIM_H + SPRITE_R * 2;
    if (p.y > SIM_H + SPRITE_R) p.y -= SIM_H + SPRITE_R * 2;
  }

  // Decay brightness field and splat particles + attractors
  for (let i = 0; i < brightnessField.length; i++)
    brightnessField[i]! *= FIELD_DECAY;
  for (const p of particles) splat(p.x, p.y, pStamp);
  splat(a1x, a1y, lgStamp);
  splat(a2x, a2y, smStamp);

  // Draw to canvas
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Draw monospace characters row by row
  ctx.font = MONO_FONT;
  ctx.fillStyle = MONO_COLOR;
  ctx.textBaseline = "top";

  for (let row = 0; row < rows; row++) {
    let text = "";
    const frs = row * FIELD_OVERSAMPLE * fieldCols;
    for (let col = 0; col < cols; col++) {
      const fcs = col * FIELD_OVERSAMPLE;
      let b = 0;
      for (let sy = 0; sy < FIELD_OVERSAMPLE; sy++) {
        const off = frs + sy * fieldCols + fcs;
        for (let sx = 0; sx < FIELD_OVERSAMPLE; sx++)
          b += brightnessField[off + sx]!;
      }
      const byte = Math.min(
        255,
        ((b / (FIELD_OVERSAMPLE * FIELD_OVERSAMPLE)) * 255) | 0,
      );
      text +=
        MONO_RAMP[
          Math.min(
            MONO_RAMP.length - 1,
            ((byte / 255) * MONO_RAMP.length) | 0,
          )
        ]!;
    }
    ctx.fillText(text, 0, row * MONO_LINE_HEIGHT);
  }

  // Mask: keep only pixels inside the "texuf" text shape
  ctx.globalCompositeOperation = "destination-in";
  ctx.font = `${FONT_WEIGHT} ${textFontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(TEXT, textDrawX, textDrawY);
  ctx.globalCompositeOperation = "source-over";

  ctx.restore();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
