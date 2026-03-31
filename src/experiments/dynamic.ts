import {
  prepareWithSegments,
  layoutWithLines,
  layoutNextLine,
  type LayoutCursor,
} from "@chenglou/pretext";
import { BODY_COPY } from "./dynamic-text";

export function dynamicExperiment(container: HTMLElement): {
  destroy(): void;
} {
  // ---- Title text measurement (defines column geometry) ----
  const TEXT = "texuf";
  const FILL_RATIO = 2 / 3;
  const TITLE_FONT_FAMILY = "Arial, sans-serif";
  const TITLE_FONT_WEIGHT = "bold";
  const REF_SIZE = 100;

  // Measure each character at reference size
  const refFont = `${TITLE_FONT_WEIGHT} ${REF_SIZE}px ${TITLE_FONT_FAMILY}`;
  const refCharWidths: number[] = [];
  for (const ch of TEXT) {
    const prepared = prepareWithSegments(ch, refFont);
    const { lines } = layoutWithLines(prepared, 99999, REF_SIZE);
    refCharWidths.push(lines.length > 0 ? lines[0].width : 0);
  }
  const refTotalWidth = refCharWidths.reduce((sum, w) => sum + w, 0);

  // ---- Body text config (half the particles mono size) ----
  const BODY_FONT_SIZE_BASE = 7;
  const BODY_LINE_HEIGHT_RATIO = 1.4;
  const BODY_FONT_FAMILY =
    'Georgia, Palatino, "Times New Roman", serif';

  // ---- DOM ----
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  container.appendChild(wrapper);

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .dyn-line {
      position: absolute;
      white-space: nowrap;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.85);
      pointer-events: none;
    }
  `;
  document.head.appendChild(styleEl);

  const measureCtx = document.createElement("canvas").getContext("2d")!;
  const linePool: HTMLSpanElement[] = [];

  function layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Display font size for title (same logic as banner)
    const scaleX = (vw * FILL_RATIO) / refTotalWidth;
    const scaleY = (vh * FILL_RATIO) / REF_SIZE;
    const displayFontSize = REF_SIZE * Math.min(scaleX, scaleY);
    const displayScale = displayFontSize / REF_SIZE;

    // Measure text height at display size
    const displayFont = `${TITLE_FONT_WEIGHT} ${displayFontSize}px ${TITLE_FONT_FAMILY}`;
    measureCtx.font = displayFont;
    const m = measureCtx.measureText(TEXT);
    const textHeight =
      m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

    // Compute column regions from per-character widths
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

    // Body font size (responsive, ~half particles mono)
    let fontScale: number;
    if (vw >= 2000) fontScale = 1;
    else fontScale = Math.max(0.5, 0.5 + ((vw - 450) / (2000 - 450)) * 0.5);
    const bodyFontSize = Math.max(4, BODY_FONT_SIZE_BASE * fontScale);
    const bodyLineHeight = Math.max(
      6,
      Math.round(bodyFontSize * BODY_LINE_HEIGHT_RATIO),
    );
    const bodyFont = `${bodyFontSize}px ${BODY_FONT_FAMILY}`;

    // Prepare body text at current font size
    const preparedBody = prepareWithSegments(BODY_COPY, bodyFont);

    // Flow text through all 5 columns left-to-right
    type Line = { x: number; y: number; text: string; colWidth: number };
    const allLines: Line[] = [];
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

    for (const col of columns) {
      if (col.width < bodyFontSize * 2) continue;
      let lineY = topY;
      while (lineY + bodyLineHeight <= topY + textHeight) {
        let line = layoutNextLine(preparedBody, cursor, col.width);
        if (line === null) {
          // Loop text from the start
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          line = layoutNextLine(preparedBody, cursor, col.width);
          if (line === null) break;
        }
        allLines.push({
          x: col.x,
          y: lineY,
          text: line.text,
          colWidth: col.width,
        });
        cursor = line.end;
        lineY += bodyLineHeight;
      }
    }

    // Sync DOM line pool
    while (linePool.length < allLines.length) {
      const span = document.createElement("span");
      span.className = "dyn-line";
      wrapper.appendChild(span);
      linePool.push(span);
    }
    while (linePool.length > allLines.length) {
      const span = linePool.pop()!;
      wrapper.removeChild(span);
    }

    // Position lines
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i]!;
      const span = linePool[i]!;
      span.textContent = line.text;
      span.style.left = `${line.x}px`;
      span.style.top = `${line.y}px`;
      span.style.font = bodyFont;
      span.style.lineHeight = `${bodyLineHeight}px`;
      span.style.width = `${line.colWidth}px`;
    }
  }

  window.addEventListener("resize", layout);
  layout();

  return {
    destroy() {
      window.removeEventListener("resize", layout);
      container.removeChild(wrapper);
      document.head.removeChild(styleEl);
    },
  };
}
