import { particlesExperiment } from "./experiments/particles";
import { particlesExperiment2 } from "./experiments/particles2";
import { bannerExperiment } from "./experiments/banner";

type ExperimentFactory = (container: HTMLElement) => { destroy(): void };

const experiments: ExperimentFactory[] = [
  bannerExperiment,
  //particlesExperiment,
  particlesExperiment2,
];

const container = document.getElementById("container")!;
let currentIndex = 0;
let current: { destroy(): void } | null = null;

function switchTo(index: number): void {
  current?.destroy();
  currentIndex = index;
  current = experiments[index](container);
}

switchTo(0);

document.addEventListener("click", () => {
  switchTo((currentIndex + 1) % experiments.length);
});
