import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

export function bannerExperiment(
  container: HTMLElement,
): { destroy(): void } {
  const TEXT = "texuf";
  const FILL_RATIO = 2 / 3;
  const FONT_FAMILY = "Arial, sans-serif";
  const FONT_WEIGHT = "bold";
  const REF_SIZE = 100;

  const font = `${FONT_WEIGHT} ${REF_SIZE}px ${FONT_FAMILY}`;
  const prepared = prepareWithSegments(TEXT, font);
  const { lines } = layoutWithLines(prepared, 99999, REF_SIZE);
  const refWidth = lines[0].width;

  const el = document.createElement("div");
  el.textContent = TEXT;
  el.style.fontFamily = FONT_FAMILY;
  el.style.fontWeight = FONT_WEIGHT;
  el.style.color = "#fff";
  el.style.lineHeight = "1";
  el.style.whiteSpace = "nowrap";
  container.appendChild(el);

  function sizeText(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = (vw * FILL_RATIO) / refWidth;
    const scaleY = (vh * FILL_RATIO) / REF_SIZE;
    const fontSize = REF_SIZE * Math.min(scaleX, scaleY);
    el.style.fontSize = `${fontSize}px`;
  }

  window.addEventListener("resize", sizeText);
  sizeText();

  return {
    destroy() {
      window.removeEventListener("resize", sizeText);
      container.removeChild(el);
    },
  };
}
