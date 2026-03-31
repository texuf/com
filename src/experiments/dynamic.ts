import {
  prepareWithSegments,
  layoutWithLines,
  layoutNextLine,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { BODY_COPY } from "./dynamic-text";

import {
  SOFT_HYPHEN,
  PREFIXES,
  SUFFIXES,
  HYPHEN_EXCEPTIONS,
} from "./justification.data";

function hyphenateWord(word: string): string[] {
  const lower = word.toLowerCase().replace(/[.,;:!?"'—–\-()]/g, "");
  if (lower.length < 5) return [word];

  const exact = HYPHEN_EXCEPTIONS[lower];
  if (exact !== undefined) {
    const parts: string[] = [];
    let pos = 0;
    for (let i = 0; i < exact.length; i++) {
      parts.push(word.slice(pos, pos + exact[i]!.length));
      pos += exact[i]!.length;
    }
    if (pos < word.length) parts[parts.length - 1] += word.slice(pos);
    return parts;
  }

  for (const prefix of PREFIXES) {
    if (lower.startsWith(prefix) && lower.length - prefix.length >= 3) {
      return [word.slice(0, prefix.length), word.slice(prefix.length)];
    }
  }

  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      const cut = word.length - suffix.length;
      return [word.slice(0, cut), word.slice(cut)];
    }
  }

  return [word];
}

function hyphenateText(text: string): string {
  const tokens = text.split(/(\s+)/);
  let result = "";
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      result += token;
      continue;
    }
    const parts = hyphenateWord(token);
    result += parts.length <= 1 ? token : parts.join(SOFT_HYPHEN);
  }
  return result;
}

// ========== Optimal Linebreaking ==========

type LineSegment =
  | { kind: "text"; text: string; width: number }
  | { kind: "space"; width: number };

type TrailingMarker = "none" | "soft-hyphen";
type LineEnding = "paragraph-end" | "wrap";

type MeasuredLine = {
  segments: LineSegment[];
  wordWidth: number;
  spaceCount: number;
  naturalWidth: number;
  maxWidth: number;
  ending: LineEnding;
  trailingMarker: TrailingMarker;
};

type LineSpacing =
  | { kind: "ragged" }
  | { kind: "overflow" }
  | { kind: "justified"; width: number };

type BreakCandidate = {
  segIndex: number;
  kind: "start" | "space" | "soft-hyphen" | "end";
};

type LineStats = {
  wordWidth: number;
  spaceCount: number;
  naturalWidth: number;
  trailingMarker: TrailingMarker;
};

const HUGE_BADNESS = 1e8;
const INFEASIBLE_SPACE_RATIO = 0.4;
const RIVER_THRESHOLD = 1.5;
const TIGHT_SPACE_RATIO = 0.65;
const SHORT_LINE_RATIO = 0.6;
const OVERFLOW_SPACE_RATIO = 0.2;
const MIN_READABLE_SPACE_RATIO = 0.75;

function isSpaceText(text: string): boolean {
  return text.trim().length === 0;
}

function toLineSegment(text: string, width: number): LineSegment {
  if (isSpaceText(text)) return { kind: "space", width };
  return { kind: "text", text, width };
}

function trimTrailingSpaces(segments: LineSegment[]): void {
  while (
    segments.length > 0 &&
    segments[segments.length - 1]!.kind === "space"
  ) {
    segments.pop();
  }
}

function finalizeMeasuredLine(
  segments: LineSegment[],
  maxWidth: number,
  ending: LineEnding,
  trailingMarker: TrailingMarker,
): MeasuredLine {
  let wordWidth = 0;
  let spaceCount = 0;
  let naturalWidth = 0;
  for (const seg of segments) {
    naturalWidth += seg.width;
    if (seg.kind === "space") spaceCount++;
    else wordWidth += seg.width;
  }
  return {
    segments,
    wordWidth,
    spaceCount,
    naturalWidth,
    maxWidth,
    ending,
    trailingMarker,
  };
}

function getLineStats(
  segments: readonly string[],
  widths: readonly number[],
  breakCandidates: readonly BreakCandidate[],
  fromCandidate: number,
  toCandidate: number,
  hyphenWidth: number,
  normalSpaceWidth: number,
): LineStats {
  const from = breakCandidates[fromCandidate]!.segIndex;
  const to = breakCandidates[toCandidate]!.segIndex;
  const trailingMarker: TrailingMarker =
    breakCandidates[toCandidate]!.kind === "soft-hyphen"
      ? "soft-hyphen"
      : "none";

  let wordWidth = 0;
  let spaceCount = 0;
  for (let segIndex = from; segIndex < to; segIndex++) {
    const text = segments[segIndex]!;
    if (text === SOFT_HYPHEN) continue;
    if (isSpaceText(text)) {
      spaceCount++;
      continue;
    }
    wordWidth += widths[segIndex]!;
  }

  if (to > from && isSpaceText(segments[to - 1]!)) spaceCount--;
  if (trailingMarker === "soft-hyphen") wordWidth += hyphenWidth;

  return {
    wordWidth,
    spaceCount,
    naturalWidth: wordWidth + spaceCount * normalSpaceWidth,
    trailingMarker,
  };
}

function lineBadness(
  stats: LineStats,
  maxWidth: number,
  normalSpaceWidth: number,
  isLastLine: boolean,
): number {
  if (isLastLine) {
    return stats.wordWidth > maxWidth ? HUGE_BADNESS : 0;
  }
  if (stats.spaceCount <= 0) {
    const slack = maxWidth - stats.wordWidth;
    return slack < 0 ? HUGE_BADNESS : slack * slack * 10;
  }
  const justifiedSpace = (maxWidth - stats.wordWidth) / stats.spaceCount;
  if (justifiedSpace < 0) return HUGE_BADNESS;
  if (justifiedSpace < normalSpaceWidth * INFEASIBLE_SPACE_RATIO)
    return HUGE_BADNESS;

  const ratio = (justifiedSpace - normalSpaceWidth) / normalSpaceWidth;
  const absRatio = Math.abs(ratio);
  const badness = absRatio * absRatio * absRatio * 1000;

  const riverExcess = justifiedSpace / normalSpaceWidth - RIVER_THRESHOLD;
  const riverPenalty =
    riverExcess > 0 ? 5000 + riverExcess * riverExcess * 10000 : 0;

  const tightThreshold = normalSpaceWidth * TIGHT_SPACE_RATIO;
  const tightPenalty =
    justifiedSpace < tightThreshold
      ? 3000 +
        (tightThreshold - justifiedSpace) *
          (tightThreshold - justifiedSpace) *
          10000
      : 0;

  const hyphenPenalty = stats.trailingMarker === "soft-hyphen" ? 50 : 0;
  return badness + riverPenalty + tightPenalty + hyphenPenalty;
}

function buildMeasuredLineFromCandidateRange(
  prepared: PreparedTextWithSegments,
  breakCandidates: readonly BreakCandidate[],
  fromCandidate: number,
  toCandidate: number,
  maxWidth: number,
  hyphenWidth: number,
): MeasuredLine {
  const from = breakCandidates[fromCandidate]!.segIndex;
  const to = breakCandidates[toCandidate]!.segIndex;
  const ending: LineEnding =
    breakCandidates[toCandidate]!.kind === "end" ? "paragraph-end" : "wrap";
  const trailingMarker: TrailingMarker =
    breakCandidates[toCandidate]!.kind === "soft-hyphen"
      ? "soft-hyphen"
      : "none";

  const segments: LineSegment[] = [];
  for (let segIndex = from; segIndex < to; segIndex++) {
    const text = prepared.segments[segIndex]!;
    if (text === SOFT_HYPHEN) continue;
    segments.push(toLineSegment(text, prepared.widths[segIndex]!));
  }

  if (trailingMarker === "soft-hyphen" && ending === "wrap") {
    segments.push({ kind: "text", text: "-", width: hyphenWidth });
  }

  trimTrailingSpaces(segments);
  return finalizeMeasuredLine(segments, maxWidth, ending, trailingMarker);
}

function layoutParagraphOptimal(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  hyphenWidth: number,
  normalSpaceWidth: number,
): MeasuredLine[] {
  const segments = prepared.segments;
  const widths = prepared.widths;
  const segmentCount = segments.length;

  if (segmentCount === 0) return [];

  const breakCandidates: BreakCandidate[] = [{ segIndex: 0, kind: "start" }];
  for (let segIndex = 0; segIndex < segmentCount; segIndex++) {
    const text = segments[segIndex]!;
    if (text === SOFT_HYPHEN) {
      if (segIndex + 1 < segmentCount)
        breakCandidates.push({ segIndex: segIndex + 1, kind: "soft-hyphen" });
      continue;
    }
    if (isSpaceText(text) && segIndex + 1 < segmentCount) {
      breakCandidates.push({ segIndex: segIndex + 1, kind: "space" });
    }
  }
  breakCandidates.push({ segIndex: segmentCount, kind: "end" });

  const candidateCount = breakCandidates.length;
  const dp: number[] = new Array(candidateCount).fill(Infinity);
  const previous: number[] = new Array(candidateCount).fill(-1);
  dp[0] = 0;

  for (let to = 1; to < candidateCount; to++) {
    const isLast = breakCandidates[to]!.kind === "end";
    for (let from = to - 1; from >= 0; from--) {
      if (dp[from] === Infinity) continue;
      const stats = getLineStats(
        segments,
        widths,
        breakCandidates,
        from,
        to,
        hyphenWidth,
        normalSpaceWidth,
      );
      if (stats.naturalWidth > maxWidth * 2) break;
      const totalBadness =
        dp[from]! + lineBadness(stats, maxWidth, normalSpaceWidth, isLast);
      if (totalBadness < dp[to]!) {
        dp[to] = totalBadness;
        previous[to] = from;
      }
    }
  }

  const breakIndices: number[] = [];
  let current = candidateCount - 1;
  while (current > 0) {
    if (previous[current] === -1) {
      current--;
      continue;
    }
    breakIndices.push(current);
    current = previous[current]!;
  }
  breakIndices.reverse();

  const lines: MeasuredLine[] = [];
  let fromCandidate = 0;
  for (const toCandidate of breakIndices) {
    lines.push(
      buildMeasuredLineFromCandidateRange(
        prepared,
        breakCandidates,
        fromCandidate,
        toCandidate,
        maxWidth,
        hyphenWidth,
      ),
    );
    fromCandidate = toCandidate;
  }

  return lines;
}

// ========== Display Spacing ==========

function getDisplaySpacing(
  line: MeasuredLine,
  normalSpaceWidth: number,
): LineSpacing {
  if (line.ending === "paragraph-end") return { kind: "ragged" };
  if (line.naturalWidth < line.maxWidth * SHORT_LINE_RATIO)
    return { kind: "ragged" };
  if (line.spaceCount <= 0) return { kind: "ragged" };

  const rawSpace = (line.maxWidth - line.wordWidth) / line.spaceCount;
  if (rawSpace < normalSpaceWidth * OVERFLOW_SPACE_RATIO)
    return { kind: "overflow" };

  const width = Math.max(rawSpace, normalSpaceWidth * MIN_READABLE_SPACE_RATIO);
  return { kind: "justified", width };
}

// ========== Experiment ==========

export function dynamicExperiment(container: HTMLElement): {
  destroy(): void;
} {
  // ---- Title text measurement (defines column geometry) ----
  const TEXT = "texuf";
  const FILL_RATIO = 2 / 3;
  const TITLE_FONT_FAMILY = "Arial, sans-serif";
  const TITLE_FONT_WEIGHT = "bold";
  const REF_SIZE = 100;

  const refFont = `${TITLE_FONT_WEIGHT} ${REF_SIZE}px ${TITLE_FONT_FAMILY}`;
  const refCharWidths: number[] = [];
  for (const ch of TEXT) {
    const prepared = prepareWithSegments(ch, refFont);
    const { lines } = layoutWithLines(prepared, 99999, REF_SIZE);
    refCharWidths.push(lines.length > 0 ? lines[0].width : 0);
  }
  const refTotalWidth = refCharWidths.reduce((sum, w) => sum + w, 0);

  // ---- Body text config ----
  const BODY_FONT_SIZE_BASE = 14;
  const BODY_LINE_HEIGHT_RATIO = 1.4;
  const BODY_FONT_FAMILY =
    '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif';

  // ---- Normalize and hyphenate body text ----
  const bodyText = BODY_COPY.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const hyphenatedBody = hyphenateText(bodyText);

  // ---- Canvas ----
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.pointerEvents = "none";
  container.appendChild(canvas);

  const measureCtx = document.createElement("canvas").getContext("2d")!;

  function layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Display font size for column geometry (same as banner)
    const scaleX = (vw * FILL_RATIO) / refTotalWidth;
    const scaleY = (vh * FILL_RATIO) / REF_SIZE;
    const displayFontSize = REF_SIZE * Math.min(scaleX, scaleY);
    const displayScale = displayFontSize / REF_SIZE;

    // Measure text height at display size
    const displayFont = `${TITLE_FONT_WEIGHT} ${displayFontSize}px ${TITLE_FONT_FAMILY}`;
    measureCtx.font = displayFont;
    const m = measureCtx.measureText(TEXT);
    const textHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

    // Column regions
    const totalWidth = refTotalWidth * displayScale;
    const startX = (vw - totalWidth) / 2;
    const topY = (vh - textHeight) / 2;

    type Column = { x: number; width: number };
    const columns: Column[] = [];
    let cx = startX;
    for (let i = 0; i < TEXT.length; i++) {
      const w = refCharWidths[i]! * displayScale;
      columns.push({ x: cx, width: w });
      cx += w;
    }

    // Body font size (responsive, same scaling as particles mono)
    let fontScale: number;
    if (vw >= 2000) fontScale = 1;
    else fontScale = Math.max(0.5, 0.5 + ((vw - 450) / (2000 - 450)) * 0.5);
    const bodyFontSize = Math.max(4, BODY_FONT_SIZE_BASE * fontScale);
    const bodyLineHeight = Math.max(
      6,
      Math.round(bodyFontSize * BODY_LINE_HEIGHT_RATIO),
    );
    const bodyFont = `${bodyFontSize}px ${BODY_FONT_FAMILY}`;

    // Canvas setup
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // Measure space and hyphen widths
    measureCtx.font = bodyFont;
    const normalSpaceWidth = measureCtx.measureText(" ").width;
    const hyphenWidth = measureCtx.measureText("-").width;

    // Prepare full hyphenated text for greedy allocation
    const fullPrepared = prepareWithSegments(hyphenatedBody, bodyFont);

    // Greedy pass: allocate text to columns
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    const maxLinesPerCol = Math.floor(textHeight / bodyLineHeight);

    type ColumnRender = {
      col: Column;
      lines: MeasuredLine[];
    };
    const renderColumns: ColumnRender[] = [];

    for (const col of columns) {
      if (col.width < bodyFontSize * 2) continue;

      const lineTexts: string[] = [];
      for (let i = 0; i < maxLinesPerCol; i++) {
        let line = layoutNextLine(fullPrepared, cursor, col.width);
        if (!line) {
          // Loop text
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          line = layoutNextLine(fullPrepared, cursor, col.width);
          if (!line) break;
        }
        lineTexts.push(line.text);
        cursor = line.end;
      }

      if (lineTexts.length === 0) continue;

      // Reconstruct column text (handle soft-hyphen joins)
      let colText = "";
      for (let i = 0; i < lineTexts.length; i++) {
        if (i > 0) {
          const prev = lineTexts[i - 1]!;
          if (!prev.endsWith(SOFT_HYPHEN)) colText += " ";
        }
        colText += lineTexts[i]!;
      }

      // Optimal linebreak on this column's text
      const colPrepared = prepareWithSegments(colText, bodyFont);
      const optimalLines = layoutParagraphOptimal(
        colPrepared,
        col.width,
        hyphenWidth,
        normalSpaceWidth,
      );

      renderColumns.push({
        col,
        lines: optimalLines.slice(0, maxLinesPerCol),
      });
    }

    // Render justified text to canvas
    ctx.font = bodyFont;
    ctx.textBaseline = "top";

    for (const { col, lines } of renderColumns) {
      let y = topY;
      for (const line of lines) {
        const spacing = getDisplaySpacing(line, normalSpaceWidth);
        let x = col.x;

        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";

        for (const seg of line.segments) {
          if (seg.kind === "space") {
            x += spacing.kind === "justified" ? spacing.width : seg.width;
            continue;
          }
          ctx.fillText(seg.text, x, y);
          x += seg.width;
        }

        y += bodyLineHeight;
      }
    }
  }

  window.addEventListener("resize", layout);
  layout();

  return {
    destroy() {
      window.removeEventListener("resize", layout);
      container.removeChild(canvas);
    },
  };
}
