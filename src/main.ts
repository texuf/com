import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

const TEXT = "texuf";
const FILL_RATIO = 2 / 3;
const FONT_FAMILY = "Arial, sans-serif";
const FONT_WEIGHT = "bold";
const REF_SIZE = 100;

// Measure text once at a reference font size using pretext.
// Text width scales linearly with font size, so we only need
// one measurement to compute the correct size for any viewport.
const font = `${FONT_WEIGHT} ${REF_SIZE}px ${FONT_FAMILY}`;
const prepared = prepareWithSegments(TEXT, font);
const { lines } = layoutWithLines(prepared, 99999, REF_SIZE);
const refWidth = lines[0].width;

const el = document.getElementById("text")!;

function sizeText(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Scale so the text fills 2/3 of whichever dimension is constraining
  const scaleX = (vw * FILL_RATIO) / refWidth;
  const scaleY = (vh * FILL_RATIO) / REF_SIZE;
  const fontSize = REF_SIZE * Math.min(scaleX, scaleY);

  el.style.fontSize = `${fontSize}px`;
}

window.addEventListener("resize", sizeText);
sizeText();
