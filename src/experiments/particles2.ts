import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

export function particlesExperiment2(container: HTMLElement): {
  destroy(): void;
} {
  // ---- Text measurement (for mask) ----
  const TEXT = "texuf";
  const FILL_RATIO = 2 / 3;
  const FONT_FAMILY = "Arial, sans-serif";
  const FONT_WEIGHT = "bold";
  const REF_SIZE = 100;

  const refFont = `${FONT_WEIGHT} ${REF_SIZE}px ${FONT_FAMILY}`;
  const refPrepared = prepareWithSegments(TEXT, refFont);
  const { lines: refLines } = layoutWithLines(refPrepared, 99999, REF_SIZE);
  const refWidth = refLines[0].width;

  // ---- Proportional font config ----
  const PROP_FONT_SIZE_BASE = 14;
  const PROP_LINE_HEIGHT_BASE = 16;
  const PROP_FAMILY = 'Georgia, Palatino, "Times New Roman", serif';
  const CHARSET =
    " .,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  //const CHARSET = " .,:texuf";
  const WEIGHTS = [300, 500, 800] as const;
  const FONT_STYLES = ["normal", "italic"] as const;
  type FontStyleVariant = (typeof FONT_STYLES)[number];

  let propFontSize = PROP_FONT_SIZE_BASE;
  let propLineHeight = PROP_LINE_HEIGHT_BASE;

  // ---- Build palette ----
  type PaletteEntry = {
    char: string;
    weight: number;
    style: FontStyleVariant;
    width: number;
    brightness: number;
  };

  const brightnessCanvas = document.createElement("canvas");
  brightnessCanvas.width = 28;
  brightnessCanvas.height = 28;
  const bCtx = brightnessCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;

  function estimateBrightness(ch: string, font: string): number {
    const size = 28;
    bCtx.clearRect(0, 0, size, size);
    bCtx.font = font;
    bCtx.fillStyle = "#fff";
    bCtx.textBaseline = "middle";
    bCtx.fillText(ch, 1, size / 2);
    const data = bCtx.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i]!;
    return sum / (255 * size * size);
  }

  function measureCharWidth(ch: string, font: string): number {
    const prepared = prepareWithSegments(ch, font);
    return prepared.widths.length > 0 ? prepared.widths[0]! : 0;
  }

  const palette: PaletteEntry[] = [];
  for (const style of FONT_STYLES) {
    for (const weight of WEIGHTS) {
      const font = `${style === "italic" ? "italic " : ""}${weight} ${PROP_FONT_SIZE_BASE}px ${PROP_FAMILY}`;
      for (const ch of CHARSET) {
        if (ch === " ") continue;
        const width = measureCharWidth(ch, font);
        if (width <= 0) continue;
        const brightness = estimateBrightness(ch, font);
        palette.push({ char: ch, weight, style, width, brightness });
      }
    }
  }

  const maxBrightness = Math.max(...palette.map((e) => e.brightness));
  if (maxBrightness > 0) {
    for (const entry of palette) entry.brightness /= maxBrightness;
  }
  palette.sort((a, b) => a.brightness - b.brightness);

  const BASE_TARGET_ROW_W = 440;
  const BASE_COLS = 50;
  const baseCellW = BASE_TARGET_ROW_W / BASE_COLS;

  function findBest(targetBrightness: number): PaletteEntry {
    let lo = 0;
    let hi = palette.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (palette[mid]!.brightness < targetBrightness) lo = mid + 1;
      else hi = mid;
    }
    let bestScore = Infinity;
    let best = palette[lo]!;
    const start = Math.max(0, lo - 15);
    const end = Math.min(palette.length, lo + 15);
    for (let i = start; i < end; i++) {
      const entry = palette[i]!;
      const brightnessError =
        Math.abs(entry.brightness - targetBrightness) * 2.5;
      const widthError = Math.abs(entry.width - baseCellW) / baseCellW;
      const score = brightnessError + widthError;
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best;
  }

  // ---- Brightness lookup ----
  function esc(ch: string): string {
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === "&") return "&amp;";
    if (ch === '"') return "&quot;";
    return ch;
  }

  function wCls(weight: number, style: FontStyleVariant): string {
    const wc = weight === 300 ? "w3" : weight === 500 ? "w5" : "w8";
    return style === "italic" ? `${wc} it` : wc;
  }

  const propHtmlLookup: string[] = [];
  for (let bb = 0; bb < 256; bb++) {
    const brightness = bb / 255;
    if (brightness < 0.03) {
      propHtmlLookup.push(" ");
      continue;
    }
    const match = findBest(brightness);
    const alphaIndex = Math.max(1, Math.min(10, Math.round(brightness * 10)));
    propHtmlLookup.push(
      `<span class="${wCls(match.weight, match.style)} a${alphaIndex}">${esc(match.char)}</span>`,
    );
  }

  // ---- Inject CSS ----
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .prop-wrapper {
      position: relative;
      overflow: hidden;
    }
    .prop-wrapper .art-row {
      white-space: nowrap;
      font-family: Georgia, Palatino, "Times New Roman", serif;
      color: rgb(237, 113, 12);
    }
    .prop-wrapper .w3 { font-weight: 300; }
    .prop-wrapper .w5 { font-weight: 500; }
    .prop-wrapper .w8 { font-weight: 800; }
    .prop-wrapper .it { font-style: italic; }
    .prop-wrapper .a1 { opacity: 0.1; }
    .prop-wrapper .a2 { opacity: 0.2; }
    .prop-wrapper .a3 { opacity: 0.3; }
    .prop-wrapper .a4 { opacity: 0.4; }
    .prop-wrapper .a5 { opacity: 0.5; }
    .prop-wrapper .a6 { opacity: 0.6; }
    .prop-wrapper .a7 { opacity: 0.7; }
    .prop-wrapper .a8 { opacity: 0.8; }
    .prop-wrapper .a9 { opacity: 0.9; }
    .prop-wrapper .a10 { opacity: 1.0; }
  `;
  document.head.appendChild(styleEl);

  // ---- Particle simulation config ----
  const SIM_W = 220;
  const SIM_H = 142;
  const PARTICLE_N = 120;
  const SPRITE_R = 14;
  const ATTRACTOR_R = 12;
  const LARGE_ATTRACTOR_R = 30;
  const ATTRACTOR_FORCE_1 = 0.22;
  const ATTRACTOR_FORCE_2 = 0.05;
  const ATTRACTOR_FORCE_3 = 0.12;
  const ATTRACTOR_FORCE_4 = 0.08;
  const FIELD_DECAY = 0.82;
  const FIELD_OVERSAMPLE = 2;

  // ---- DOM structure ----
  const wrapper = document.createElement("div");
  wrapper.className = "prop-wrapper";
  container.appendChild(wrapper);

  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d")!;
  const measureCtx = document.createElement("canvas").getContext("2d")!;

  // ---- Dynamic state ----
  let cols = 1;
  let numRows = 1;
  let fieldCols = 2;
  let fieldRows = 2;
  let W = 100;
  let H = 100;
  let brightnessField = new Float32Array(4);
  let fsx = 1;
  let fsy = 1;

  const rowDivs: HTMLDivElement[] = [];

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

    // Scale prop font (same logic as mono scaling in particles1)
    let scale: number;
    if (vw >= 2000) scale = 1;
    else scale = Math.max(0.5, 0.5 + ((vw - 450) / (2000 - 450)) * 0.5);
    propFontSize = PROP_FONT_SIZE_BASE * scale;
    propLineHeight = PROP_LINE_HEIGHT_BASE * scale;

    // Compute text font size for mask
    const sx = (vw * FILL_RATIO) / refWidth;
    const sy = (vh * FILL_RATIO) / REF_SIZE;
    const textFontSize = REF_SIZE * Math.min(sx, sy);

    // Measure text bounding box
    measureCtx.font = `${FONT_WEIGHT} ${textFontSize}px ${FONT_FAMILY}`;
    const m = measureCtx.measureText(TEXT);
    W = vw;
    //W = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    H = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

    // Grid dimensions
    const scaledCellW = baseCellW * scale;
    cols = Math.max(1, Math.ceil(W / scaledCellW));
    numRows = Math.max(1, Math.ceil(H / propLineHeight) + 1);
    fieldCols = cols * FIELD_OVERSAMPLE;
    fieldRows = numRows * FIELD_OVERSAMPLE;
    brightnessField = new Float32Array(fieldCols * fieldRows);

    fsx = fieldCols / SIM_W;
    fsy = fieldRows / SIM_H;

    pStamp = makeStamp(SPRITE_R);
    lgStamp = makeStamp(LARGE_ATTRACTOR_R);
    smStamp = makeStamp(ATTRACTOR_R);

    // Rebuild row divs
    while (rowDivs.length > numRows) {
      const div = rowDivs.pop()!;
      wrapper.removeChild(div);
    }
    while (rowDivs.length < numRows) {
      const div = document.createElement("div");
      div.className = "art-row";
      wrapper.appendChild(div);
      rowDivs.push(div);
    }
    for (const div of rowDivs) {
      div.style.height = div.style.lineHeight = `${propLineHeight}px`;
      div.style.fontSize = `${propFontSize}px`;
    }

    // Update wrapper size
    wrapper.style.width = `${W}px`;
    wrapper.style.height = `${H}px`;

    // Generate mask canvas
    const dpr = window.devicePixelRatio || 1;
    maskCanvas.width = Math.round(W * dpr);
    maskCanvas.height = Math.round(H * dpr);
    maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    maskCtx.clearRect(0, 0, W, H);
    maskCtx.font = `${FONT_WEIGHT} ${textFontSize}px ${FONT_FAMILY}`;
    maskCtx.fillStyle = "#fff";
    maskCtx.textBaseline = "alphabetic";
    const xOffsetHack = 1.021;
    const yOffsetHack = 0.978;
    const textDrawX =
      m.actualBoundingBoxLeft + ((vw * (1.0 - FILL_RATIO)) / 2.0) * xOffsetHack;
    const textDrawY = m.actualBoundingBoxAscent * yOffsetHack;
    maskCtx.fillText(TEXT, textDrawX, textDrawY);

    // Apply CSS mask
    const maskDataUrl = maskCanvas.toDataURL();
    wrapper.style.webkitMaskImage = `url(${maskDataUrl})`;
    wrapper.style.maskImage = `url(${maskDataUrl})`;
    wrapper.style.webkitMaskSize = `${W}px ${H}px`;
    wrapper.style.maskSize = `${W}px ${H}px`;
    wrapper.style.webkitMaskRepeat = "no-repeat";
    wrapper.style.maskRepeat = "no-repeat";
  }

  resize();
  window.addEventListener("resize", resize);

  // ---- Render loop ----
  let animId = 0;

  function render(now: number): void {
    const a1x = Math.cos(now * 0.0007) * SIM_W * 0.25 + SIM_W / 2;
    const a1y = Math.sin(now * 0.0011) * SIM_H * 0.3 + SIM_H / 2;
    const a2x = Math.cos(now * 0.0013 + Math.PI) * SIM_W * 0.2 + SIM_W / 2;
    const a2y = Math.sin(now * 0.0009 + Math.PI) * SIM_H * 0.25 + SIM_H / 2;
    const a3x =
      Math.cos(now * 0.0005 + Math.PI * 0.5) * SIM_W * 0.3 + SIM_W / 2;
    const a3y =
      Math.sin(now * 0.0008 + Math.PI * 0.5) * SIM_H * 0.25 + SIM_H / 2;
    const a4x =
      Math.cos(now * 0.001 + Math.PI * 1.5) * SIM_W * 0.15 + SIM_W / 2;
    const a4y =
      Math.sin(now * 0.0012 + Math.PI * 1.5) * SIM_H * 0.35 + SIM_H / 2;

    const attractors = [
      { x: a1x, y: a1y, f: ATTRACTOR_FORCE_1 },
      { x: a2x, y: a2y, f: ATTRACTOR_FORCE_2 },
      { x: a3x, y: a3y, f: ATTRACTOR_FORCE_3 },
      { x: a4x, y: a4y, f: ATTRACTOR_FORCE_4 },
    ];

    for (const p of particles) {
      let closestDx = 0,
        closestDy = 0,
        closestDist = Infinity,
        closestF = 0;
      for (const att of attractors) {
        const dx = att.x - p.x,
          dy = att.y - p.y;
        const dist = dx * dx + dy * dy;
        if (dist < closestDist) {
          closestDist = dist;
          closestDx = dx;
          closestDy = dy;
          closestF = att.f;
        }
      }
      const d = Math.sqrt(closestDist) + 1;
      p.vx += (closestDx / d) * closestF + (Math.random() - 0.5) * 0.25;
      p.vy += (closestDy / d) * closestF + (Math.random() - 0.5) * 0.25;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -SPRITE_R) p.x += SIM_W + SPRITE_R * 2;
      if (p.x > SIM_W + SPRITE_R) p.x -= SIM_W + SPRITE_R * 2;
      if (p.y < -SPRITE_R) p.y += SIM_H + SPRITE_R * 2;
      if (p.y > SIM_H + SPRITE_R) p.y -= SIM_H + SPRITE_R * 2;
    }

    for (let i = 0; i < brightnessField.length; i++)
      brightnessField[i]! *= FIELD_DECAY;
    for (const p of particles) splat(p.x, p.y, pStamp);
    splat(a1x, a1y, lgStamp);
    splat(a2x, a2y, smStamp);
    splat(a3x, a3y, smStamp);
    splat(a4x, a4y, smStamp);

    // Render propHtml to row divs
    for (let row = 0; row < numRows; row++) {
      let html = "";
      const frs = row * FIELD_OVERSAMPLE * fieldCols;
      for (let col = 0; col < cols; col++) {
        const fcs = col * FIELD_OVERSAMPLE;
        let b = 0;
        for (let sy = 0; sy < FIELD_OVERSAMPLE; sy++) {
          const off = frs + sy * fieldCols + fcs;
          for (let sx = 0; sx < FIELD_OVERSAMPLE; sx++)
            b += brightnessField[off + sx]!;
        }
        const bb = Math.min(
          255,
          ((b / (FIELD_OVERSAMPLE * FIELD_OVERSAMPLE)) * 255) | 0,
        );
        html += propHtmlLookup[bb];
      }
      rowDivs[row]!.innerHTML = html;
    }

    animId = requestAnimationFrame(render);
  }

  animId = requestAnimationFrame(render);

  return {
    destroy() {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      container.removeChild(wrapper);
      document.head.removeChild(styleEl);
    },
  };
}
