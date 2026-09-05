import {
  captureFilename,
  captureScenes,
  type CaptureScene,
  type CarVisualCaptureScene,
  type FieldOverviewCaptureScene,
  type QFactoryCaptureScene,
  type WorldOverviewCaptureScene,
} from "../game/captureScenes";

export interface DeterministicCaptureHandlers {
  ensureWorldRendererAvailable(): void;
  pauseWorldSimulation(): void;
  captureQFactory(scene: QFactoryCaptureScene): Promise<Blob>;
  captureCarVisual(scene: CarVisualCaptureScene): Promise<Blob>;
  captureOutdoor(scene: WorldOverviewCaptureScene | FieldOverviewCaptureScene): Promise<Blob>;
}

export class DeterministicCaptureController {
  constructor(
    private readonly app: HTMLElement,
    private readonly handlers: DeterministicCaptureHandlers,
  ) {}

  async run(scene: CaptureScene): Promise<void> {
    this.handlers.ensureWorldRendererAvailable();
    this.handlers.pauseWorldSimulation();
    let blob: Blob;
    if (scene.kind === "qfactory") {
      blob = await this.handlers.captureQFactory(scene);
    } else if (scene.kind === "car-visual") {
      blob = await this.handlers.captureCarVisual(scene);
    } else {
      blob = await this.handlers.captureOutdoor(scene);
    }
    const digest = await sha256Hex(blob);
    this.showResult(scene, blob, digest);
    console.info(`Deterministic capture '${scene.id}': ${scene.size.width}x${scene.size.height}, SHA-256 ${digest}.`);
  }

  private showResult(scene: CaptureScene, blob: Blob, digest: string): void {
    document.querySelector(".capture-result")?.remove();
    this.app.dataset.captureMode = "true";
    const objectUrl = URL.createObjectURL(blob);
    const root = document.createElement("section");
    root.className = "capture-result";

    const header = document.createElement("header");
    const heading = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "DETERMINISTIC CAPTURE";
    const title = document.createElement("h1");
    title.textContent = scene.label;
    const metadata = document.createElement("p");
    metadata.className = "capture-metadata";
    metadata.textContent = `${scene.size.width}×${scene.size.height} · SHA-256 ${digest}`;
    heading.append(eyebrow, title, metadata);
    const download = document.createElement("a");
    download.className = "primary-button capture-download";
    download.href = objectUrl;
    download.download = captureFilename(scene);
    download.textContent = "Save PNG";
    header.append(heading, download);

    const image = document.createElement("img");
    image.className = "capture-image";
    image.src = objectUrl;
    image.width = scene.size.width;
    image.height = scene.size.height;
    image.alt = `${scene.label} deterministic browser-port capture`;

    const navigation = document.createElement("nav");
    navigation.className = "capture-navigation";
    navigation.setAttribute("aria-label", "Deterministic capture scenes");
    for (const candidate of captureScenes) {
      const link = document.createElement("a");
      const url = new URL(location.href);
      url.search = "";
      url.searchParams.set("capture", candidate.id);
      link.href = url.toString();
      link.textContent = candidate.label;
      link.classList.toggle("selected", candidate.id === scene.id);
      navigation.append(link);
    }
    root.append(header, image, navigation);
    this.app.append(root);
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
