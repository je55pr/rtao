import "./styles.css";
import { installAppShell } from "./app/appShell";
import { diagnosticsReportText, FrameRateSampler, liveDiagnosticsRows } from "./app/debugDiagnostics";
import { DeterministicCaptureController } from "./app/deterministicCaptureController";
import { requiredElement } from "./app/dom";
import { bindAppDom } from "./app/domBindings";
import { fieldDisplayName, type GameHudState, gameHudView, raceStatusText } from "./app/hudModel";
import { ImportController } from "./app/importController";
import { canOpenPauseMenu } from "./app/pauseState";
import { RecoveredProgressStore } from "./app/recoveredProgressStore";
import { raceResultsView } from "./app/raceResultsModel";
import { SceneFade } from "./app/sceneTransition";
import { carAssetPath } from "./formats/carPath";
import type { DialogueActionToken, DialogueEntity, DialogueFlow, DialogueRuntimeState, DialogueVariant } from "./formats/dialogue";
import type { FixedInteractionDefinition, OverworldCatalogue } from "./formats/overworld";
import { isQuickPicPhotoNumber } from "./formats/quickPic";
import { readRaceCatalogue } from "./formats/raceCatalogue";
import { AdvertisingDistanceTracker } from "./game/advertisingDistanceTracker";
import { BodyShopCatalogueSession, reconstructedBodyShopStock } from "./game/bodyCatalog";
import {
  type CarVisualCaptureScene,
  captureSceneById,
  captureScenes,
  type FieldOverviewCaptureScene,
  type PeachRaceCaptureScene,
  type QFactoryCaptureScene,
  type WorldOverviewCaptureScene,
  peachRaceCaptureSceneById,
  peachRaceCaptureScenes,
} from "./game/captureScenes";
import type { Q62CarModel } from "./game/carView";
import {
  type AdvertisingRedemptionResult,
  advertisingSponsorCount,
  advertisingSponsorIndexFromOptionSelector,
  purchaseIndexedItem,
  type RecoveredCommerceState,
  sellIndexedPart,
} from "./game/commerceProgress";
import { applyRecoveredDialogueHostAction } from "./game/dialogueProgress";
import type { BrowserDrivingGame, CarState } from "./game/drivingGame";
import { applyRecoveredEquipmentHostAction, fitOwnedNativeEquipmentPart, type RecoveredEquipmentState } from "./game/equipmentProgress";
import { findNearestFixedInteraction } from "./game/fixedInteractionProximity";
import {
  defaultChoiceIndex,
  describeFixedInteriorHostAction,
  describeInteriorHostAction,
  fixedInteriorStartSlot,
  nativeNumericChoiceInitialValue,
  nativeNumericChoiceTarget,
  stepNativeNumericChoice,
} from "./game/interiorFlow";
import type { QFactoryInteriorView, ShopInteriorRoomView } from "./game/interiorView";
import { nativeTyreGripMultiplier } from "./game/nativeTyrePerformance";
import {
  browserCompatibilityPaintWord,
  decodeNativeBodyPaint,
  type NativePaintChannel,
  type NativePaintTone,
  nativePaintChannel,
  nativeWheelPaintColor,
  nativeWheelPaintCount,
  nativeWheelPaintIndex,
  PaintShopSession,
  purchasePaint,
} from "./game/paintShop";
import {
  aggregatePartPerformance,
  aggregatePartsAppearance,
  applyKnownNativeEquipmentSelectors,
  createDevelopmentPartsSave,
  createPartLoadout,
  defaultPartLoadout,
  developmentPartCatalogue,
  equipPart,
  knownNativePart,
  type NativeFittingCategory,
  nativeFittingCatalogue,
  type PartCategory,
  type PartLoadout,
  partCategoryLabels,
  partCategoryOrder,
  readDevelopmentPartsSave,
  selectedPart,
} from "./game/parts";
import type { RaceCompletionResult, RecoveredRaceState } from "./game/raceProgress";
import type { PeachRaceCoordinator } from "./game/raceSession/peachRaceCoordinator";
import { qFactoryRaceLaunchActivityId, qFactoryRaceOptions, qFactoryRaceSelectionTargets } from "./game/raceSession/qFactoryRaceFlow";
import type { RaceView } from "./game/raceView";
import {
  PartsShopCatalogueSession,
  reconstructedPartsShopStock,
  reconstructedSecondHandInventory,
  shopPartCategoryLabels,
} from "./game/shopCatalog";
import type { DrivingWorld } from "./game/worldCollision";
import type { BrowserWorldSimulation } from "./game/worldSimulation";
import type { WorldView } from "./game/worldView";
import { classifyImportSelection, describeImportFailure, type ImportProblem } from "./importer/importDiagnostics";
import {
  clearCurrentPointer,
  currentImportDirectory,
  type ImportManifest,
  readBytes,
  readCurrentManifest,
  readJson,
  removeImportDirectory,
  writeBytes,
  writeJson,
} from "./storage/opfs";

const app = requiredElement<HTMLElement>("app");
const selectTeamCarActionOpcode = 0x04;
const raceSelectActionOpcode = 0x08;
const startRaceActionOpcode = 0x03;
const numericChoiceActionOpcode = 0x05;
const shopOrServiceActionOpcode = 0x13;
const paintShopActionOpcode = 0x03;
const quickPicPhotoActionOpcode = 0x11;
const advertisingRewardActionOpcode = 0x16;
installAppShell(app);

const {
  dropZone,
  fileInput,
  emptyState,
  viewerHost,
  installedPanel,
  importCard,
  importPhase,
  importDetail,
  progressBar,
  progressLabel,
  errorCard,
  errorDetail,
  cancelImportButton,
  worldLocation,
  worldTime,
  worldVisibility,
  driveToggle,
  gameHud,
  hudLocation,
  hudCake,
  hudSpeed,
  hudStatus,
  hudHint,
  raceResultsOverlay,
  raceResultsTitle,
  raceResultsPlaces,
  raceResultsPrize,
  raceResultsBalance,
  raceResultsBest,
  raceResultsPromotion,
  raceResultsReturn,
  debugOverlay,
  debugLiveRows,
  pauseOverlay,
  pauseStopDriving,
  pauseResume,
} = bindAppDom();
const raceToggle = requiredElement<HTMLButtonElement>("race-toggle");
const sceneFadeElement = requiredElement<HTMLElement>("scene-fade");
const sceneFade = new SceneFade(
  {
    setCovered: (covered, instant) => {
      sceneFadeElement.classList.toggle("instant", instant);
      sceneFadeElement.classList.toggle("covered", covered);
    },
  },
  // The cover must be committed before the classes that fade it away are
  // removed, or the transition has nothing to run from. A timer rather than
  // requestAnimationFrame: a backgrounded tab stops issuing frames, and a
  // reveal that never arrives would leave the scene stuck behind black.
  (reveal) => {
    void sceneFadeElement.offsetHeight;
    setTimeout(reveal, 16);
  },
);
let worldView: WorldView | undefined;
let drivingWorld: DrivingWorld | undefined;
let drivingGame: BrowserDrivingGame | undefined;
let playerCar: Q62CarModel | undefined;
let peachRaceView: RaceView | undefined;
let peachRaceCoordinator: PeachRaceCoordinator | undefined;
let peachRaceModels: Q62CarModel[] = [];
let peachRaceFrame = 0;
let peachRaceLastTimestamp = 0;
let peachRaceAccumulatorMs = 0;
let peachRaceSceneTime = 0;
let peachRaceRewardApplied = false;
let peachRaceResultOpen = false;
let peachRaceSuspendedTownSession = false;
const peachRaceKeys = new Set<string>();
let activeDirectory: FileSystemDirectoryHandle | undefined;
let activeManifest: ImportManifest | undefined;
const loadedWorldFieldNumbers = new Set<number>();
const loadingWorldFields = new Map<number, Promise<void>>();
let lastPrefetchedWorldField: number | undefined;
let activeExecutableBytes: Uint8Array | undefined;
let isDriving = false;
let playUiActive = false;
let debugOverlayVisible = false;
let debugOverlayFrame = 0;
const debugFrameRate = new FrameRateSampler();
let pauseMenuOpen = false;
let pauseReturnFocus: HTMLElement | undefined;
let worldSimulation: BrowserWorldSimulation | undefined;
let overworldCatalogue: OverworldCatalogue | undefined;
let residentGreetings = new Map<string, DialogueVariant>();
let activeDialogue: { speaker: string; pages: string[]; pageIndex: number } | undefined;
let qFactoryDialogueEntity: DialogueEntity | undefined;
let playerDialogueState: DialogueRuntimeState | undefined;
let playerCommerceState: RecoveredCommerceState | undefined;
let playerEquipmentState: RecoveredEquipmentState | undefined;
let playerRaceState: RecoveredRaceState | undefined;
let recoveredProgressStore: RecoveredProgressStore | undefined;
let qFactoryInteriorView: QFactoryInteriorView | undefined;
let shopInteriorPreviewView: ShopInteriorRoomView | undefined;
let shopInteriorPreviewInteraction: FixedInteractionDefinition | undefined;
let shopInteriorSession: { flow: DialogueFlow; choiceIndex: number; interaction: FixedInteractionDefinition; entity: DialogueEntity } | undefined;
let shopNumericChoiceSession: { action: DialogueActionToken; value: number } | undefined;
let shopAdvertisingRewardSession: { action: DialogueActionToken; result: AdvertisingRedemptionResult } | undefined;
let qFactorySession: { flow: DialogueFlow; choiceIndex: number; interaction: FixedInteractionDefinition; raceOptionIndex: number; selectedRaceActivityId?: number } | undefined;
let equippedParts: PartLoadout = defaultPartLoadout;
let changePartsSession: {
  original: PartLoadout;
  draft: PartLoadout;
  originalSelectors: number[];
  draftSelectors: number[];
  catalogue: readonly NativeFittingCategory[];
  categoryIndex: number;
  partIndex: number;
} | undefined;
let partsShopSession: PartsShopCatalogueSession | undefined;
let secondHandShopActive = false;
let bodyShopSession: BodyShopCatalogueSession | undefined;
let paintShopSession: PaintShopSession | undefined;
let quickPicPhotoSession: { action: DialogueActionToken; photoNumber: number; objectUrl: string } | undefined;
const advertisingDistanceTracker = new AdvertisingDistanceTracker();
type PaintShopCursor = { kind: "body"; tone: NativePaintTone; channel: NativePaintChannel } | { kind: "wheel" };
let paintShopCursor: PaintShopCursor = { kind: "body", tone: 0, channel: 0 };
let shopInteriorPlayerBytes: Uint8Array | undefined;
let shopInteriorTireBytes: Uint8Array | undefined;
let shopInteriorWheelBytes: Uint8Array | undefined;
let bodyShopPreviewGeneration = 0;
let bodyShopPreviewBodyId = 62;
let qFactoryLoading = false;
let qFactoryLoadGeneration = 0;
let shopInteriorPreviewLoadGeneration = 0;
let shopInteriorPreviewLoading = false;
let residentModelLoadGeneration = 0;
let residentModelLoadChain: Promise<void> = Promise.resolve();
let fujiProbeIndex = -1;
const fujiProbes = [
  { from: 223, to: 221, position: { x: 960.15, y: 31, z: 40 }, yaw: Math.PI, label: "Peach north road" },
  { from: 221, to: 220, position: { x: 1560, y: 5, z: 575 }, yaw: Math.PI / 2, label: "countryside to Bridge" },
  { from: 220, to: 113, position: { x: 1389.9, y: 25, z: 40 }, yaw: Math.PI, label: "Bridge north road to Fuji" },
] as const;

const importController = new ImportController({
  showEmpty,
  showImport,
  updateProgress,
  showInstalled,
  installCompleted: hydrateCompletedInstall,
  backgroundImportFailed: (error) => {
    console.warn("Peach Town remains playable, but the background whole-world cache did not finish.", error);
  },
  showError: (title, error) => {
    showImportProblem(describeImportFailure(error instanceof Error ? error.message : String(error), title));
  },
});

// DEV-ONLY: expose the world renderer for browser-driven inspection. Stripped
// from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __rtaWorldView?: () => unknown }).__rtaWorldView = () => worldView;
}
const deterministicCaptureController = new DeterministicCaptureController(app, {
  ensureWorldRendererAvailable: () => {
    if (!worldView) throw new Error("The world renderer is unavailable for deterministic capture.");
  },
  pauseWorldSimulation: () => worldSimulation?.setPaused(true),
  captureQFactory,
  captureCarVisual,
  captureOutdoor,
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) beginImport([...fileInput.files]);
});
raceToggle.addEventListener("click", () => {
  if (peachRaceCoordinator) stopPeachRace();
  else void startPeachRace().catch((error) => { stopPeachRace(); showError("Peach Raceway could not start.", error); });
});
raceResultsReturn.addEventListener("click", stopPeachRace);
// Registered before the race and dialogue handlers so that an Escape they
// consume is still seen here while their state is live: leaving a race must not
// also open the pause layer behind it.
window.addEventListener("keydown", handleShellKey);
window.addEventListener("keydown", handlePeachRaceKeyDown);
window.addEventListener("keyup", handlePeachRaceKeyUp);

// DEV-ONLY: `?devdisc` brings up the world without a manual file picker, for
// headless/browser-driven visual checks. It reuses an existing usable install
// (fast restore from the OPFS mesh cache) and only re-imports the disc from the
// rta-dev-disc vite middleware when there is none, or when `?devdisc=force` is
// given. With `?onlyfield=N` it imports just those sectors (+ the always-required
// files), which fits a small browser-storage quota. Stripped from production.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("devdisc")) {
  void (async () => {
    const parameters = new URLSearchParams(location.search);
    const force = parameters.get("devdisc") === "force";
    const requestedFields = (parameters.get("onlyfield") ?? "")
      .split(",").map((part) => Number.parseInt(part.trim(), 10)).filter((value) => Number.isInteger(value));
    const devOnlyFields = requestedFields.length ? [...new Set(requestedFields)].sort((a, b) => a - b) : undefined;

    const { compiledFieldCacheVersion } = await import("./formats/fieldGeometry");
    const manifest = await readCurrentManifest().catch(() => undefined);
    const currentMeshes = new Set(
      (manifest?.compiledFields ?? []).filter((f) => f.cacheVersion === compiledFieldCacheVersion).map((f) => f.fieldNumber),
    );
    const expectedFields = devOnlyFields ?? [...manifest?.fields.map((f) => f.fieldNumber) ?? []];
    // With `?onlyfield` any current install whose compiled cache already holds
    // every requested field is reusable — a full 64-field install counts, not
    // just a matching dev-partial one. Without it, require a complete full install.
    const installUsable = !!manifest
      && expectedFields.length > 0
      && expectedFields.every((n) => currentMeshes.has(n))
      && (devOnlyFields
        ? true
        : manifest.devPartialFields === undefined && manifest.fields.length === 64 && currentMeshes.size === 64);

    if (installUsable && !force) {
      await importController.restore();
      return;
    }

    const names = [
      "Road Trip Adventure (Europe) (En,Fr,De).cue",
      "Road Trip Adventure (Europe) (En,Fr,De).bin",
    ];
    // Only reclaim space from a disposable dev-partial install before importing:
    // `assertCacheHeadroom` runs before `importGame` would reclaim it and the
    // pane's storage quota is tiny. A healthy full install is left untouched so a
    // failed disc fetch or import cannot destroy it — `importGame` then swaps it
    // out transactionally (publish new, then remove old).
    if (manifest && manifest.devPartialFields !== undefined) {
      await removeImportDirectory(manifest.importId).catch(() => undefined);
      await clearCurrentPointer().catch(() => undefined);
    }
    const files = await Promise.all(names.map(async (name) => {
      const response = await fetch(`/__dev-disc?name=${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error(`dev disc fetch failed for ${name}: ${response.status}`);
      return new File([await response.blob()], name);
    }));
    await importController.start(files, devOnlyFields);
  })().catch((error) => showError("The dev disc could not be auto-imported.", error));
}

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) beginImport(files);
});

cancelImportButton.addEventListener("click", () => {
  void importController.cancel();
});

requiredElement<HTMLButtonElement>("try-again").addEventListener("click", () => {
  showEmpty();
  fileInput.click();
});

worldLocation.addEventListener("change", () => {
  void showWorldLocation(worldLocation.value).catch((error) => showError("That world location could not be loaded.", error));
});

async function showWorldLocation(value: string): Promise<void> {
  if (!worldView) return;
  worldLocation.disabled = true;
  try {
    if (value === "world") {
      requiredElement<HTMLElement>("viewer-title").textContent = "Loading whole world…";
      await ensureAllWorldFields();
      worldView.showWorldOverview();
      sceneFade.flash();
      requiredElement<HTMLElement>("viewer-title").textContent = "The whole world";
      return;
    }
    const fieldNumber = Number.parseInt(value, 10);
    await ensureWorldFieldLoaded(fieldNumber);
    if (!worldView.focusField(fieldNumber)) return;
    sceneFade.flash();
    requiredElement<HTMLElement>("viewer-title").textContent = ({
      223: "Peach Town",
      113: "Fuji City",
      203: "White Mountain",
      233: "Papaya Island",
    } as Record<number, string>)[fieldNumber] ?? `FLD/${fieldNumber.toString().padStart(3, "0")}`;
    void ensureNearbyWorldFields(fieldNumber).catch((error) => console.warn("Nearby world prefetch failed.", error));
  } finally {
    worldLocation.disabled = isDriving || activeManifest?.installStage === "bootstrap";
  }
}


worldTime.addEventListener("change", () => {
  worldView?.setTimeOfDay(Number.parseFloat(worldTime.value) * 9_000);
});

worldVisibility.addEventListener("change", () => {
  const value = worldVisibility.value;
  if (value === "authentic" || value === "extended" || value === "unlimited") worldView?.setVisibilityMode(value);
});

driveToggle.addEventListener("click", () => {
  void toggleDriving().catch((error) => showError("The Q62 driving slice could not be started.", error));
});

requiredElement<HTMLButtonElement>("open-pause").addEventListener("click", openPauseMenu);
pauseResume.addEventListener("click", closePauseMenu);
pauseStopDriving.addEventListener("click", () => {
  closePauseMenu();
  stopDrivingSession();
});
requiredElement<HTMLButtonElement>("pause-diagnostics").addEventListener("click", () => {
  setDebugOverlayVisible(!debugOverlayVisible);
});
pauseOverlay.addEventListener("click", (event) => {
  if (event.target === pauseOverlay) closePauseMenu();
});
requiredElement<HTMLButtonElement>("debug-hide").addEventListener("click", () => setDebugOverlayVisible(false));
requiredElement<HTMLButtonElement>("debug-copy").addEventListener("click", () => {
  void copyDiagnosticsReport();
});

window.addEventListener("keydown", handleDialogueKey);
window.addEventListener("resize", () => { if (qFactorySession || shopInteriorPreviewInteraction || shopInteriorPreviewLoading) sizeFactoryStage(); });
requiredElement<HTMLButtonElement>("dialogue-continue").addEventListener("click", advanceResidentDialogue);
requiredElement<HTMLButtonElement>("dialogue-close").addEventListener("click", endResidentDialogue);
requiredElement<HTMLButtonElement>("factory-continue").addEventListener("click", () => shopInteriorSession ? advanceShopInteriorDialogue() : advanceQFactoryDialogue());
requiredElement<HTMLButtonElement>("factory-return").addEventListener("click", () => {
  if (partsShopSession) finishPartsShopCatalogue();
  else if (bodyShopSession) finishBodyShopCatalogue();
  else if (paintShopSession) finishPaintShopSelector(false);
  else if (shopInteriorSession) {
    if (shopNumericChoiceSession) finishShopNumericChoice();
    else if (isCurrentQuickPicPhotoAction()) void captureCurrentQuickPicPhoto();
    else returnFromShopInteriorHostAction();
  }
  else if (qFactorySession?.flow.currentExternalAction?.opcode === startRaceActionOpcode) activateQFactoryHostAction();
  else returnFromQFactoryHostAction();
});
requiredElement<HTMLButtonElement>("factory-numeric-decrement").addEventListener("click", () => moveShopNumericChoice(-1));
requiredElement<HTMLButtonElement>("factory-numeric-increment").addEventListener("click", () => moveShopNumericChoice(1));
requiredElement<HTMLButtonElement>("factory-leave").addEventListener("click", endActiveInterior);
requiredElement<HTMLButtonElement>("parts-apply").addEventListener("click", () => finishChangeParts(true));
requiredElement<HTMLButtonElement>("parts-cancel").addEventListener("click", () => finishChangeParts(false));
requiredElement<HTMLButtonElement>("shop-close").addEventListener("click", () => {
  if (bodyShopSession) finishBodyShopCatalogue();
  else finishPartsShopCatalogue();
});
requiredElement<HTMLButtonElement>("shop-purchase").addEventListener("click", () => {
  if (bodyShopSession) purchaseSelectedBody();
  else purchaseSelectedPart();
});
requiredElement<HTMLButtonElement>("paint-cancel").addEventListener("click", () => finishPaintShopSelector(false));
requiredElement<HTMLButtonElement>("paint-apply").addEventListener("click", purchaseSelectedPaint);
requiredElement<HTMLButtonElement>("quick-pic-cancel").addEventListener("click", cancelQuickPicPhoto);
requiredElement<HTMLButtonElement>("quick-pic-keep").addEventListener("click", keepQuickPicPhoto);

requiredElement<HTMLButtonElement>("remove-install").addEventListener("click", async () => {
  const manifest = await readCurrentManifest();
  if (!manifest || !window.confirm("Remove the locally installed game data from this browser? Your original disc image is not affected.")) return;
  await clearCurrentPointer();
  await removeImportDirectory(manifest.importId);
  stopDrivingSession();
  playerCar?.dispose();
  playerCar = undefined;
  stopWorldSimulation();
  drivingWorld = undefined;
  activeDirectory = undefined;
  activeManifest = undefined;
  playerDialogueState = undefined;
  playerEquipmentState = undefined;
  playerCommerceState = undefined;
  playerRaceState = undefined;
  activeExecutableBytes = undefined;
  worldView?.dispose();
  worldView = undefined;
  showEmpty();
});

if (!(import.meta.env.DEV && new URLSearchParams(location.search).has("devdisc"))) {
  void importController.restore();
}

async function showInstalled(manifest: ImportManifest): Promise<void> {
  stopPeachRace();
  stopDrivingSession();
  stopWorldSimulation();
  playerCar?.dispose();
  playerCar = undefined;
  drivingWorld = undefined;
  activeDirectory = undefined;
  activeManifest = undefined;
  loadedWorldFieldNumbers.clear();
  loadingWorldFields.clear();
  lastPrefetchedWorldField = undefined;
  emptyState.hidden = true;
  importCard.hidden = true;
  errorCard.hidden = true;
  viewerHost.hidden = false;
  installedPanel.hidden = false;
  playUiActive = true;
  requiredElement<HTMLElement>("disc-version").textContent = `${manifest.identity.bootExecutable} · ${manifest.identity.videoMode || "PAL"}`;
  requiredElement<HTMLElement>("viewer-title").textContent = "Preparing world";
  requiredElement<HTMLElement>("field-count").textContent = `0/${manifest.fields.length}`;
  requiredElement<HTMLElement>("triangle-count").textContent = "—";
  requiredElement<HTMLElement>("resident-count").textContent = "—";
  worldLocation.disabled = true;
  driveToggle.disabled = true;
  raceToggle.disabled = true;
  raceToggle.textContent = "Peach Raceway loading…";

  const bootstrapInstall = manifest.installStage === "bootstrap";
  const upgradedManifest = await ensureWholeWorldCache(manifest, (completed, total) => {
    requiredElement<HTMLElement>("field-count").textContent = `${completed}/${total}`;
  });
  // DEV-ONLY: `?onlyfield=213` (comma-separated) loads just those sectors so
  // iterating on one field's geometry does not pay the whole-world build cost.
  const devOnlyFields = import.meta.env.DEV
    ? (new URLSearchParams(location.search).get("onlyfield") ?? "")
        .split(",").map((part) => Number.parseInt(part.trim(), 10)).filter((value) => Number.isInteger(value))
    : [];
  const onlyFieldSet = devOnlyFields.length ? new Set(devOnlyFields) : undefined;
  const parameters = new URLSearchParams(location.search);
  const fastNormalStart = !onlyFieldSet
    && !parameters.has("capture")
    && !parameters.has("driveProbe")
    && !parameters.has("interiorProbe")
    && !parameters.has("dialogueProbe");
  const startupFieldSet = onlyFieldSet ?? (fastNormalStart ? new Set([223]) : undefined);
  const compiledWorld = [...upgradedManifest.compiledFields]
    .filter((field) => !startupFieldSet || startupFieldSet.has(field.fieldNumber))
    .sort((a, b) => a.fieldNumber - b.fieldNumber);
  if (!startupFieldSet && !bootstrapInstall && compiledWorld.length !== 64) throw new Error(`The cached install has ${compiledWorld.length}/64 compiled world sectors.`);
  const directory = await currentImportDirectory(upgradedManifest);
  activeDirectory = directory;
  activeManifest = upgradedManifest;
  equippedParts = await loadDevelopmentParts(directory);
  recoveredProgressStore = await RecoveredProgressStore.restore(directory);
  playerDialogueState = recoveredProgressStore.dialogueState;
  playerCommerceState = recoveredProgressStore.commerceState;
  playerEquipmentState = recoveredProgressStore.equipmentState;
  playerRaceState = recoveredProgressStore.raceState;
  equippedParts = applyKnownNativeEquipmentSelectors(equippedParts, playerEquipmentState.selectorEntries()[0] ?? []);
  if (!worldView) {
    const { WorldView: WorldViewClass } = await import("./game/worldView");
    worldView = new WorldViewClass(viewerHost);
  }
  worldView.startWorld();
  const [{ decodeSkyTextureSet }, { deserializeCompiledField }, { DrivingWorld: DrivingWorldClass }, skyBytes] = await Promise.all([
    import("./formats/skyTexture"),
    import("./formats/fieldGeometry"),
    import("./game/worldCollision"),
    readBytes(directory, "game/SYS/SORA.GSL"),
  ]);
  worldView.setSky(decodeSkyTextureSet(skyBytes));
  worldView.setTimeOfDay(Number.parseFloat(worldTime.value) * 9_000);
  const visibility = worldVisibility.value;
  if (visibility === "authentic" || visibility === "extended" || visibility === "unlimited") worldView.setVisibilityMode(visibility);
  drivingWorld = new DrivingWorldClass();
  let roadRibbons = 0, pavedRibbons = 0, dirtRibbons = 0, unresolvedRoadVertices = 0;
  let suppressedStaticTriangles = 0;
  const suppressedByField: string[] = [];
  let stats = { sectors: 0, triangles: 0, primitives: 0 };
  for (const [index, compiled] of compiledWorld.entries()) {
    const bytes = await readBytes(directory, compiled.path);
    const mesh = deserializeCompiledField(bytes);
    stats = worldView.addCompiledFieldMesh(compiled.fieldNumber, mesh);
    drivingWorld.addCompiledFieldSurface(compiled.fieldNumber, mesh);
    roadRibbons += mesh.roads.ribbonCount;
    pavedRibbons += mesh.roads.pavedRibbonCount;
    dirtRibbons += mesh.roads.dirtRibbonCount;
    unresolvedRoadVertices += mesh.roads.unresolvedVertexCount;
    suppressedStaticTriangles += mesh.suppressedTriangleCount;
    if (mesh.suppressedTriangleCount > 0) {
      suppressedByField.push(`FLD/${compiled.fieldNumber.toString().padStart(3, "0")}:${mesh.suppressedTriangleCount}`);
    }
    requiredElement<HTMLElement>("field-count").textContent = `${index + 1}/${compiledWorld.length}`;
    requiredElement<HTMLElement>("triangle-count").textContent = stats.triangles.toLocaleString();
    if ((index & 3) === 3) await nextFrame();
  }
  stats = worldView.finishWorld();
  console.info(`Renderer-equivalent static triangles suppressed: ${suppressedStaticTriangles}${suppressedByField.length ? ` (${suppressedByField.join(", ")})` : ""}.`);

  // Evidence-backed dynamic field props (FLD/213 wind-turbine rotors, FLD/220/221
  // coastal palm crowns) live in the Extra[1] object container rather than the
  // compiled MSCALF-8 mesh. Decode them from the cached raw FLD bytes for the
  // fields that carry an Extra[1] section.
  const dynamicObjectFields = upgradedManifest.fields.filter(
    (field) => field.sectionCount >= 5 && (!startupFieldSet || startupFieldSet.has(field.fieldNumber)),
  );
  if (dynamicObjectFields.length > 0) {
    const [{ readFieldObjectAsset, findTurbineAnchors, findPalmCrownAnchors }, { readFieldRenderPrimitives }] = await Promise.all([
      import("./formats/fieldObjects"),
      import("./formats/fieldGeometry"),
    ]);
    // DEV-ONLY: `?showprops` places one scaled static copy of every Extra[1]
    // object (including unidentified `prop` kinds) at a debug anchor for
    // eyeballing.
    const showProps = import.meta.env.DEV && new URLSearchParams(location.search).has("showprops");
    let dynamicInstances = 0;
    for (const field of dynamicObjectFields) {
      const raw = await readBytes(directory, `game/${field.path}`);
      const asset = readFieldObjectAsset(raw);
      if (!asset) continue;
      if (showProps) {
        worldView.addDebugDynamicObject(field.fieldNumber, asset, { x: 800, y: 160, z: 800 });
        console.info(`[showprops] FLD/${field.fieldNumber}: ${asset.kind}, ${asset.meshes.length} meshes, radius ${asset.radius.toFixed(1)}, texture ${asset.texture ? `${asset.texture.width}x${asset.texture.height}` : "none"}`);
        dynamicInstances += 1;
        await nextFrame();
        continue;
      }
      if (asset.kind !== "turbine-rotor" && asset.kind !== "palm-crown") continue;
      const primitives = readFieldRenderPrimitives(raw);
      const anchors = asset.kind === "turbine-rotor"
        ? findTurbineAnchors(primitives)
        : findPalmCrownAnchors(primitives);
      if (anchors.length === 0) continue;
      worldView.addFieldDynamicObjects(field.fieldNumber, asset, anchors);
      dynamicInstances += anchors.length;
      await nextFrame();
    }
    if (dynamicInstances > 0) console.info(`Dynamic field objects: ${dynamicInstances} instances rendered (geometry/texture evidence-backed; animation, facing & scale host-approximated).`);
  }
  const collisionWorld = [...(upgradedManifest.collisionFields ?? [])]
    .filter((field) => !startupFieldSet || startupFieldSet.has(field.fieldNumber))
    .sort((a, b) => a.fieldNumber - b.fieldNumber);
  if (!startupFieldSet && !bootstrapInstall && collisionWorld.length !== 64) throw new Error(`The cached install has ${collisionWorld.length}/64 collision sectors.`);
  requiredElement<HTMLElement>("viewer-title").textContent = "Preparing driving surfaces";
  for (const [index, collision] of collisionWorld.entries()) {
    drivingWorld.addField(collision.fieldNumber, await readBytes(directory, collision.path));
    loadedWorldFieldNumbers.add(collision.fieldNumber);
    requiredElement<HTMLElement>("field-count").textContent = `${index + 1}/${collisionWorld.length}`;
    if ((index & 7) === 7) await nextFrame();
  }
  console.info(`Authored roads: ${roadRibbons} minimap ribbons (${pavedRibbons} paved, ${dirtRibbons} dirt), ${unresolvedRoadVertices} unresolved projected vertices.`);
  const [{ readOverworldCatalogue }, executableBytes] = await Promise.all([
    import("./formats/overworld"),
    readBytes(directory, `game/${upgradedManifest.identity.bootExecutable}`),
  ]);
  activeExecutableBytes = executableBytes;
  updatePeachRaceAvailability();
  overworldCatalogue = readOverworldCatalogue(executableBytes);
  console.info(`Persistent fixed interactions: ${overworldCatalogue.interactions.length} authored zones mapped into ${new Set(overworldCatalogue.interactions.map((zone) => zone.fieldNumber)).size} standard world sectors.`);
  await loadDialogueCatalogue(executableBytes);
  const captureId = parameters.get("capture");
  const captureScene = captureId ? captureSceneById(captureId) : undefined;
  if (captureId && !captureScene) {
    throw new Error(`Unknown deterministic capture '${captureId}'. Available captures: ${captureScenes.map((candidate) => candidate.id).join(", ")}.`);
  }
  const raceCaptureId = parameters.get("raceCapture");
  const raceCaptureScene = raceCaptureId ? peachRaceCaptureSceneById(raceCaptureId) : undefined;
  if (raceCaptureId && !raceCaptureScene) {
    throw new Error(`Unknown Peach race capture '${raceCaptureId}'. Available captures: ${peachRaceCaptureScenes.map((candidate) => candidate.id).join(", ")}.`);
  }
  sceneFade.setEnabled(!captureScene && !raceCaptureScene);
  const { BrowserWorldSimulation: BrowserWorldSimulationClass } = await import("./game/worldSimulation");
  const loadedFieldNumbers = new Set(compiledWorld.map((field) => field.fieldNumber));
  const residentDefinitions = overworldCatalogue.residents.filter((resident) => loadedFieldNumbers.has(resident.fieldNumber));
  const simulation = new BrowserWorldSimulationClass(residentDefinitions, drivingWorld, worldView);
  worldSimulation = simulation;
  simulation.start();
  const modelLoadGeneration = ++residentModelLoadGeneration;
  requiredElement<HTMLElement>("resident-count").textContent = `0/${simulation.residents.length}`;
  // Canonical captures deliberately exclude roaming residents. Do not even
  // start their asynchronous model loads in capture mode: otherwise an actor
  // could attach between the visibility snapshot and the offscreen render.
  if (!captureScene && !raceCaptureScene && !onlyFieldSet) {
    void queueResidentModelLoad(upgradedManifest, directory, simulation, modelLoadGeneration).catch((error) => {
      if (modelLoadGeneration === residentModelLoadGeneration) console.error("Resident car models could not finish loading in the background.", error);
    });
  }
  const peachStartup = bootstrapInstall || fastNormalStart;
  requiredElement<HTMLElement>("viewer-title").textContent = peachStartup
    ? "Peach Town"
    : onlyFieldSet ? `FLD/${devOnlyFields[0]?.toString().padStart(3, "0")}` : "The whole world";
  requiredElement<HTMLElement>("field-count").textContent = String(stats.sectors);
  requiredElement<HTMLElement>("triangle-count").textContent = stats.triangles.toLocaleString();
  worldLocation.value = peachStartup
    ? "223"
    : onlyFieldSet && worldLocation.querySelector(`option[value="${devOnlyFields[0]}"]`)
      ? String(devOnlyFields[0])
      : "world";
  worldLocation.disabled = bootstrapInstall;
  driveToggle.disabled = false;
  if (peachStartup) worldView.focusField(223);
  else if (onlyFieldSet && devOnlyFields[0] !== undefined) worldView.focusField(devOnlyFields[0]);
  if (raceCaptureScene) {
    if (!bootstrapInstall) await runDeterministicPeachRaceCapture(raceCaptureScene);
  } else if (captureScene) {
    await deterministicCaptureController.run(captureScene);
  } else if (parameters.get("driveProbe") === "fuji") {
    await toggleDriving();
    startFujiProbe();
  } else if (parameters.get("interiorProbe")) {
    await toggleDriving();
    const probe = parameters.get("interiorProbe") ?? "qfactory";
    const [areaText, slotText] = probe === "qfactory" ? ["1", "0"] : probe.split(/[:-]/, 2);
    const areaIndex = Number.parseInt(areaText ?? "", 10);
    const localIndex = Number.parseInt(slotText ?? "", 10);
    const interaction = overworldCatalogue.interactions.find((candidate) => candidate.areaIndex === areaIndex && candidate.localIndex === localIndex);
    if (!interaction) throw new Error(`Interior probe '${probe}' does not identify an executable-defined fixed interaction.`);
    const sourceX = interaction.corners.reduce((sum, corner) => sum + corner[0], 0) / interaction.corners.length;
    const sourceZ = interaction.corners.reduce((sum, corner) => sum + corner[1], 0) / interaction.corners.length;
    drivingGame?.controller.teleport(interaction.fieldNumber, { x: 1600 - sourceX, y: 31, z: sourceZ }, 0);
    if (interaction.areaIndex === 1 && interaction.localIndex === 0) await startQFactoryInterior(interaction);
    else await startShopInteriorPreview(interaction);
  } else if (parameters.get("dialogueProbe")) {
    await toggleDriving();
    const name = parameters.get("dialogueProbe") ?? "James";
    const resident = worldSimulation?.residents.find((candidate) => candidate.state.definition.name.toLowerCase() === name.toLowerCase())?.state;
    const greeting = residentGreetings.get(name.toLowerCase());
    if (!resident || !greeting) throw new Error(`Dialogue probe resident '${name}' is not available.`);
    drivingGame?.controller.teleport(resident.fieldNumber, {
      x: resident.position.x - Math.sin(resident.yaw) * 3.5,
      y: resident.position.y,
      z: resident.position.z - Math.cos(resident.yaw) * 3.5,
    }, resident.yaw);
    startResidentDialogue(resident.definition.name, greeting.pages);
  }
  if (fastNormalStart && !bootstrapInstall) {
    lastPrefetchedWorldField = 223;
    void ensureNearbyWorldFields(223).catch((error) => console.warn("Initial nearby world prefetch failed.", error));
  }
}

async function ensureWorldFieldLoaded(fieldNumber: number): Promise<void> {
  if (loadedWorldFieldNumbers.has(fieldNumber)) return;
  const existing = loadingWorldFields.get(fieldNumber);
  if (existing) return existing;
  if (!activeManifest || activeManifest.installStage === "bootstrap" || !activeDirectory || !worldView || !drivingWorld) return;
  const compiled = activeManifest.compiledFields.find((field) => field.fieldNumber === fieldNumber);
  const collisionRecord = activeManifest.collisionFields?.find((field) => field.fieldNumber === fieldNumber);
  if (!compiled || !collisionRecord) throw new Error(`FLD/${fieldNumber.toString().padStart(3, "0")} is not present in the completed local cache.`);
  const task = (async () => {
    const [[meshBytes, collisionBytes], { deserializeCompiledField }, { deserializeCompiledCollision }] = await Promise.all([
      Promise.all([readBytes(activeDirectory!, compiled.path), readBytes(activeDirectory!, collisionRecord.path)]),
      import("./formats/fieldGeometry"),
      import("./formats/fieldCollision"),
    ]);
    const mesh = deserializeCompiledField(meshBytes);
    const collision = deserializeCompiledCollision(collisionBytes);
    const stats = worldView!.addCompiledFieldMesh(fieldNumber, mesh);
    drivingWorld!.addCompiledFieldSurface(fieldNumber, mesh);
    drivingWorld!.addCompiledField(fieldNumber, collision);
    loadedWorldFieldNumbers.add(fieldNumber);
    await loadLazyFieldDynamicObjects(fieldNumber);
    requiredElement<HTMLElement>("field-count").textContent = String(stats.sectors);
    requiredElement<HTMLElement>("triangle-count").textContent = stats.triangles.toLocaleString();
  })();
  loadingWorldFields.set(fieldNumber, task);
  try { await task; } finally { loadingWorldFields.delete(fieldNumber); }
}

async function loadLazyFieldDynamicObjects(fieldNumber: number): Promise<void> {
  if (!activeManifest || !activeDirectory || !worldView) return;
  const field = activeManifest.fields.find((candidate) => candidate.fieldNumber === fieldNumber);
  if (!field || field.sectionCount < 5) return;
  const [{ readFieldObjectAsset, findTurbineAnchors, findPalmCrownAnchors }, { readFieldRenderPrimitives }] = await Promise.all([
    import("./formats/fieldObjects"),
    import("./formats/fieldGeometry"),
  ]);
  const raw = await readBytes(activeDirectory, `game/${field.path}`);
  const asset = readFieldObjectAsset(raw);
  if (!asset || (asset.kind !== "turbine-rotor" && asset.kind !== "palm-crown")) return;
  const primitives = readFieldRenderPrimitives(raw);
  const anchors = asset.kind === "turbine-rotor" ? findTurbineAnchors(primitives) : findPalmCrownAnchors(primitives);
  if (anchors.length > 0) worldView.addFieldDynamicObjects(fieldNumber, asset, anchors);
}

async function syncLoadedWorldResidents(): Promise<void> {
  if (!activeManifest || !activeDirectory || !overworldCatalogue || !worldSimulation) return;
  worldSimulation.addDefinitions(
    overworldCatalogue.residents.filter((resident) => loadedWorldFieldNumbers.has(resident.fieldNumber)),
  );
  if (worldSimulation.modelCount >= worldSimulation.residents.length) return;
  const generation = residentModelLoadGeneration;
  await queueResidentModelLoad(activeManifest, activeDirectory, worldSimulation, generation);
}

async function ensureNearbyWorldFields(fieldNumber: number): Promise<void> {
  if (!activeManifest || activeManifest.installStage === "bootstrap") return;
  const { nearbyWorldFieldNumbers } = await import("./game/worldTopology");
  for (const nearby of nearbyWorldFieldNumbers(fieldNumber)) {
    await ensureWorldFieldLoaded(nearby);
    await nextFrame();
  }
  await syncLoadedWorldResidents();
}

async function ensureAllWorldFields(): Promise<void> {
  if (!activeManifest || activeManifest.installStage === "bootstrap") return;
  for (const compiled of activeManifest.compiledFields) {
    await ensureWorldFieldLoaded(compiled.fieldNumber);
    if ((loadedWorldFieldNumbers.size & 1) === 0) await nextFrame();
  }
  await syncLoadedWorldResidents();
}

async function hydrateCompletedInstall(manifest: ImportManifest): Promise<void> {
  if (activeManifest?.importId !== manifest.importId || activeManifest.installStage !== "bootstrap") return;
  if (!activeDirectory || !worldView || !drivingWorld) return;
  activeManifest = manifest;
  updatePeachRaceAvailability();
  const centre = drivingGame?.controller.state.fieldNumber ?? 223;
  const startedAt = performance.now();
  lastPrefetchedWorldField = centre;
  await ensureNearbyWorldFields(centre);
  if (!isDriving) worldLocation.disabled = false;
  console.info(`Background install complete: ${manifest.fields.length} world sectors and ${manifest.raceCourses?.length ?? 0} race courses cached; nearby live ring reached ${loadedWorldFieldNumbers.size} sectors in ${Math.round(performance.now() - startedAt)} ms.`);
  const raceCaptureId = new URLSearchParams(location.search).get("raceCapture");
  const raceCaptureScene = raceCaptureId ? peachRaceCaptureSceneById(raceCaptureId) : undefined;
  if (raceCaptureScene) await runDeterministicPeachRaceCapture(raceCaptureScene);
}

function updatePeachRaceAvailability(): void {
  if (peachRaceCoordinator) {
    raceToggle.disabled = false;
    raceToggle.textContent = "Leave Peach Raceway";
    return;
  }
  const ready = !!activeDirectory && !!activeExecutableBytes
    && !!activeManifest?.compiledRaceCourses?.some((record) => record.courseId === 0)
    && !!activeManifest?.raceCourseCollisions?.some((record) => record.courseId === 0)
    && !!activeManifest?.raceCourses?.some((record) => record.courseId === 0);
  raceToggle.disabled = !ready;
  raceToggle.textContent = ready ? "Race Peach Raceway" : "Peach Raceway loading…";
}

async function startPeachRace(scheduleAnimation = true, playerEquipmentSelectors: readonly number[] = Array(15).fill(0), activityId = 0, preserveTownSession = false): Promise<void> {
  if (activityId !== 0) throw new Error(`Only validated Peach Raceway activity 0 can launch; received activity ${activityId}.`);
  if (!activeDirectory || !activeManifest || !activeExecutableBytes) throw new Error("The installed PAL data is not ready.");
  const compiled = activeManifest.compiledRaceCourses?.find((record) => record.courseId === 0);
  const collision = activeManifest.raceCourseCollisions?.find((record) => record.courseId === 0);
  const source = activeManifest.raceCourses?.find((record) => record.courseId === 0);
  if (!compiled || !collision || !source) throw new Error("COURSE/C00 is not present in the completed local race cache.");

  stopPeachRace();
  if (preserveTownSession && drivingGame && isDriving) {
    endQFactoryInterior();
    endResidentDialogue();
    drivingGame.setPaused(true);
    worldSimulation?.setPaused(true);
    peachRaceSuspendedTownSession = true;
  } else {
    stopDrivingSession();
  }
  raceToggle.disabled = true;
  raceToggle.textContent = "Loading Peach Raceway…";
  worldLocation.disabled = true;
  driveToggle.disabled = true;
  worldSimulation?.setPaused(true);

  const [{ RaceView: RaceViewClass }, { PeachRaceCoordinator: Coordinator, peachRaceEntrantId },
    { createPeachRaceRuntime }, { deserializeCompiledCollision }, { Q62CarModel: CarModel }] = await Promise.all([
    import("./game/raceView"),
    import("./game/raceSession/peachRaceCoordinator"),
    import("./game/raceSession/peachRaceRuntime"),
    import("./formats/fieldCollision"),
    import("./game/carView"),
  ]);
  const [compiledBytes, collisionBytes, courseBytes, tireBytes, wheelBytes] = await Promise.all([
    readBytes(activeDirectory, compiled.path),
    readBytes(activeDirectory, collision.path),
    readBytes(activeDirectory, `game/${source.path}`),
    readBytes(activeDirectory, "game/CARS/TIRE.BIN"),
    readOptionalInstalledWheelBytes(activeDirectory),
  ]);
  const runtime = createPeachRaceRuntime({
    executable: activeExecutableBytes,
    courseBytes,
    compiledCollision: deserializeCompiledCollision(collisionBytes),
    // Standalone capture supplies the validated all-standard selectors; Q's Factory may supply recovered fitted selectors.
    playerEquipmentSelectors,
    // The special equipment flag path remains outside the validated ordinary-frame boundary.
    playerEquipmentFlags: 0,
    globalEquipmentFlags: 0,
    countdown: { elapsedUpdates: 0, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50 },
    sceneKind: 0,
    sceneByte0B: 0,
    raceModeByte: 0,
  });
  const coordinator = new Coordinator(runtime);
  const view = new RaceViewClass(viewerHost);
  view.loadCourse(0, compiledBytes);

  const bodyBytes = new Map<number, Uint8Array>();
  const models: Q62CarModel[] = [];
  try {
    for (const initial of runtime.initialCommands) {
      const entrant = initial.entrant;
      const bodyId = entrant.kind === "opponent" ? entrant.participant.bodyId : 62;
      let bytes = bodyBytes.get(bodyId);
      if (!bytes) {
        bytes = await readBytes(activeDirectory, `game/${carAssetPath(bodyId)}`);
        bodyBytes.set(bodyId, bytes);
      }
      const paintWord = entrant.kind === "opponent"
        ? entrant.participant.packedPaint
        : playerEquipmentState?.paintWord ?? browserCompatibilityPaintWord;
      const paint = decodeNativeBodyPaint(paintWord);
      models.push(new CarModel(bytes, tireBytes, {
        name: entrant.kind === "opponent" ? entrant.participant.name : "Player Q62",
        primaryPaint: paint.primary,
        secondaryPaint: paint.secondary,
        ...(wheelBytes ? { wheelBytes } : {}),
        nativeTyreSelector: 0,
        nativeWheelSelector: 0,
        wheelColor: nativeWheelPaintColor(paintWord),
        wheelColorIndex: nativeWheelPaintIndex(paintWord),
      }));
    }
    const poses = new Map(coordinator.poses().map((entry) => [entry.carIndex, entry.pose] as const));
    view.setEntrants(runtime.initialCommands.map((initial, index) => ({
      id: peachRaceEntrantId(initial.carIndex),
      object: models[index]!,
      pose: poses.get(initial.carIndex)!,
    })));
  } catch (error) {
    models.forEach((model) => model.dispose());
    view.dispose();
    worldSimulation?.setPaused(false);
    updatePeachRaceAvailability();
    throw error;
  }

  peachRaceView = view;
  peachRaceCoordinator = coordinator;
  peachRaceModels = models;
  peachRaceSceneTime = 0;
  peachRaceLastTimestamp = 0;
  peachRaceAccumulatorMs = 0;
  peachRaceRewardApplied = false;
  hidePeachRaceResults();
  peachRaceKeys.clear();
  viewerHost.querySelector<HTMLElement>(".world-canvas")?.style.setProperty("visibility", "hidden");
  requiredElement<HTMLElement>("viewer-title").textContent = "Peach Raceway";
  requiredElement<HTMLElement>("viewer-help").textContent = "WASD / arrows · native 50 Hz race controls · Esc to leave";
  updatePeachRaceAvailability();
  refreshGameHud();
  coordinator.syncView(view);
  sceneFade.flash();
  if (scheduleAnimation) peachRaceFrame = requestAnimationFrame(runPeachRaceFrame);
}

async function runDeterministicPeachRaceCapture(scene: PeachRaceCaptureScene): Promise<void> {
  await startPeachRace(false);
  const coordinator = peachRaceCoordinator;
  const view = peachRaceView;
  if (!coordinator || !view) throw new Error("Peach race capture could not acquire the live race runtime.");
  const playerStart = coordinator.runtime.session.entrant(0).state.coordinates;
  for (let update = 0; update < scene.updates; update += 1) {
    coordinator.step({ sceneTime: update, playerCommands: scene.playerCommands });
  }
  coordinator.syncView(view);
  refreshGameHud();
  const playerEnd = coordinator.runtime.session.entrant(0).state.coordinates;
  const movement = Math.hypot(playerEnd[0] - playerStart[0], playerEnd[2] - playerStart[2]);
  if (!(movement > 0.01)) throw new Error(`Deterministic Peach race capture did not move the player after ${scene.updates} updates.`);

  const blob = await view.capturePng(scene.size);
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const digestHex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  document.querySelector(".capture-result")?.remove();
  app.dataset.captureMode = "true";
  const objectUrl = URL.createObjectURL(blob);
  const root = document.createElement("section");
  root.className = "capture-result";
  const header = document.createElement("header");
  const heading = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "DETERMINISTIC RACE CAPTURE";
  const title = document.createElement("h1");
  title.textContent = scene.label;
  const metadata = document.createElement("p");
  metadata.className = "capture-metadata";
  metadata.textContent = `${scene.size.width}×${scene.size.height} · tick ${scene.updates} · moved ${movement.toFixed(3)} · SHA-256 ${digestHex}`;
  heading.append(eyebrow, title, metadata);
  const download = document.createElement("a");
  download.className = "primary-button capture-download";
  download.href = objectUrl;
  download.download = `rta-${scene.id}-${scene.size.width}x${scene.size.height}.png`;
  download.textContent = "Save PNG";
  header.append(heading, download);
  const image = document.createElement("img");
  image.className = "capture-image";
  image.src = objectUrl;
  image.width = scene.size.width;
  image.height = scene.size.height;
  image.alt = `${scene.label} PAL-backed deterministic browser-port capture`;
  root.append(header, image);
  app.append(root);
  console.info(`Deterministic Peach race capture '${scene.id}': tick ${scene.updates}, player moved ${movement.toFixed(3)} course units, SHA-256 ${digestHex}.`);
}

function runPeachRaceFrame(timestamp: number): void {
  if (!peachRaceCoordinator || !peachRaceView) return;
  if (peachRaceLastTimestamp === 0) peachRaceLastTimestamp = timestamp;
  peachRaceAccumulatorMs += Math.min(100, Math.max(0, timestamp - peachRaceLastTimestamp));
  peachRaceLastTimestamp = timestamp;
  while (peachRaceAccumulatorMs >= 20) {
    peachRaceCoordinator.step({ sceneTime: peachRaceSceneTime++, playerCommands: peachRaceCommandMask() });
    peachRaceAccumulatorMs -= 20;
    applyPeachRaceResultIfReady();
    if (peachRaceResultOpen) {
      peachRaceAccumulatorMs = 0;
      break;
    }
  }
  peachRaceCoordinator.syncView(peachRaceView);
  refreshGameHud();
  if (peachRaceResultOpen) {
    peachRaceFrame = 0;
    return;
  }
  peachRaceFrame = requestAnimationFrame(runPeachRaceFrame);
}

function peachRaceCommandMask(): number {
  let commands = 0;
  if (peachRaceKeys.has("KeyW") || peachRaceKeys.has("ArrowUp")) commands |= 1;
  if (peachRaceKeys.has("KeyS") || peachRaceKeys.has("ArrowDown")) commands |= 2;
  if (peachRaceKeys.has("KeyA") || peachRaceKeys.has("ArrowLeft")) commands |= 0x8000;
  if (peachRaceKeys.has("KeyD") || peachRaceKeys.has("ArrowRight")) commands |= 0x2000;
  return commands;
}

function handlePeachRaceKeyDown(event: KeyboardEvent): void {
  if (!peachRaceCoordinator) return;
  if (peachRaceResultOpen) {
    if (["Escape", "Enter", "Space", "KeyE"].includes(event.code)) {
      event.preventDefault();
      stopPeachRace();
    }
    return;
  }
  if (event.code === "Escape") {
    event.preventDefault();
    stopPeachRace();
    return;
  }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
    peachRaceKeys.add(event.code);
  }
}

function handlePeachRaceKeyUp(event: KeyboardEvent): void {
  if (!peachRaceCoordinator) return;
  peachRaceKeys.delete(event.code);
}

function applyPeachRaceResultIfReady(): void {
  if (peachRaceRewardApplied || !peachRaceCoordinator || !activeExecutableBytes || !playerRaceState || !playerCommerceState) return;
  const handoff = peachRaceCoordinator.runtime.session.resultHandoff();
  if (handoff.status !== "ready") return;
  const result = peachRaceCoordinator.runtime.session.applyResult(
    readRaceCatalogue(activeExecutableBytes), playerRaceState, playerCommerceState,
  );
  peachRaceRewardApplied = true;
  queueRecoveredProgressSave();
  console.info(`Peach Raceway result applied: best native finish ${result.bestFinishIndex}, +${result.prizeCake} Cake.`);
  refreshGameHud();
  showPeachRaceResults(result, handoff.nativeFinishIndices);
}

function showPeachRaceResults(result: RaceCompletionResult, nativeFinishIndices: readonly number[]): void {
  const view = raceResultsView({ raceName: "Peach Raceway", completion: result, nativeFinishIndices });
  raceResultsTitle.textContent = view.raceName;
  raceResultsPlaces.replaceChildren(...view.finishers.map((finisher) => {
    const row = document.createElement("div");
    row.className = "race-results-place";
    const label = document.createElement("span");
    label.textContent = finisher.label;
    const place = document.createElement("strong");
    place.textContent = finisher.place;
    row.append(label, place);
    return row;
  }));
  raceResultsPrize.textContent = view.prize;
  raceResultsBalance.textContent = view.balance;
  raceResultsBest.textContent = view.bestResult;
  raceResultsBest.classList.toggle("updated", view.bestUpdated);
  raceResultsPromotion.textContent = view.promotion;
  raceResultsPromotion.hidden = !view.promotionVisible;
  peachRaceResultOpen = true;
  raceResultsOverlay.hidden = false;
  gameHud.hidden = true;
  raceResultsReturn.focus();
}

function hidePeachRaceResults(): void {
  peachRaceResultOpen = false;
  raceResultsOverlay.hidden = true;
  raceResultsPlaces.replaceChildren();
}

function stopPeachRace(): void {
  const resumeTownSession = peachRaceSuspendedTownSession && !!drivingGame && isDriving;
  hidePeachRaceResults();
  peachRaceSuspendedTownSession = false;
  if (peachRaceFrame) cancelAnimationFrame(peachRaceFrame);
  peachRaceFrame = 0;
  peachRaceKeys.clear();
  peachRaceCoordinator = undefined;
  peachRaceView?.dispose();
  peachRaceView = undefined;
  peachRaceModels.forEach((model) => model.dispose());
  peachRaceModels = [];
  const worldCanvas = viewerHost.querySelector<HTMLElement>(".world-canvas");
  if (worldCanvas) worldCanvas.style.removeProperty("visibility");
  worldSimulation?.setPaused(false);
  if (resumeTownSession) drivingGame?.setPaused(false);
  driveToggle.disabled = !drivingWorld;
  worldLocation.disabled = resumeTownSession || !drivingWorld || activeManifest?.installStage === "bootstrap";
  if (resumeTownSession && drivingGame) {
    requiredElement<HTMLElement>("viewer-title").textContent = "Driving Q62";
    requiredElement<HTMLElement>("viewer-help").textContent = "WASD / arrows to drive · Hold Shift for developer boost";
    refreshGameHud(drivingGame.controller.state);
  } else {
    if (drivingWorld) requiredElement<HTMLElement>("viewer-title").textContent = loadedWorldFieldNumbers.size === 64 ? "The whole world" : "Peach Town area";
    requiredElement<HTMLElement>("viewer-help").textContent = "Drag to orbit · Scroll to zoom · Right-drag to pan";
    refreshGameHud();
  }
  updatePeachRaceAvailability();
  sceneFade.flash();
}

async function toggleDriving(): Promise<void> {
  if (isDriving) {
    stopDrivingSession();
    return;
  }
  if (!worldView || !drivingWorld || !activeDirectory) throw new Error("The persistent world is not ready yet.");
  driveToggle.disabled = true;
  driveToggle.textContent = "Loading Q62…";
  if (!playerCar) {
    playerCar = await ensurePlayerCarModel();
    console.info(`Q62 decoded: ${playerCar.primitiveCount.toLocaleString()} strips, ${playerCar.triangleCount.toLocaleString()} body/wheel triangles; bounds ${JSON.stringify(playerCar.localBounds)}.`);
  }
  const { BrowserDrivingGame: BrowserDrivingGameClass } = await import("./game/drivingGame");
  drivingGame = new BrowserDrivingGameClass(drivingWorld, worldView, playerCar, handleDriveState);
  drivingGame.setPartPerformance(aggregatePartPerformance(equippedParts));
  drivingGame.setNativeTyreSelector(playerEquipmentState?.selectedItem(0, 1) ?? 0);
  drivingGame.setNativeBrakeSelector(playerEquipmentState?.selectedItem(0, 6) ?? 0);
  advertisingDistanceTracker.reset();
  drivingGame.start();
  const spawn = drivingGame.controller.state;
  console.info(`Q62 spawn: FLD/${spawn.fieldNumber.toString().padStart(3, "0")} (${spawn.position.x.toFixed(2)}, ${spawn.position.y.toFixed(2)}, ${spawn.position.z.toFixed(2)}).`);
  isDriving = true;
  driveToggle.textContent = "Stop driving";
  driveToggle.disabled = false;
  worldLocation.disabled = true;
  requiredElement<HTMLElement>("viewer-title").textContent = "Driving Q62";
  requiredElement<HTMLElement>("viewer-help").textContent = "WASD / arrows to drive · Hold Shift for developer boost";
  refreshGameHud();
}

function startFujiProbe(): void {
  if (!drivingGame) return;
  fujiProbeIndex = 0;
  armFujiProbe();
  drivingGame.setInputOverride({ throttle: 1, steering: 0, boost: false });
}

function armFujiProbe(): void {
  const probe = fujiProbes[fujiProbeIndex];
  if (!probe || !drivingGame) return;
  drivingGame.controller.teleport(probe.from, probe.position, probe.yaw);
  console.info(`Browser Fuji seam probe ${fujiProbeIndex + 1}/${fujiProbes.length}: FLD/${probe.from} -> FLD/${probe.to} (${probe.label}).`);
}

function handleDriveState(state: CarState): void {
  refreshGameHud(state);
  accumulateAdvertisingDistance(state);
  if (activeManifest?.installStage !== "bootstrap" && lastPrefetchedWorldField !== state.fieldNumber) {
    lastPrefetchedWorldField = state.fieldNumber;
    void ensureNearbyWorldFields(state.fieldNumber).catch((error) => console.warn("Nearby driving-sector prefetch failed.", error));
  }
  const probe = fujiProbes[fujiProbeIndex];
  if (!probe || state.fieldNumber !== probe.to) return;
  console.info(`BROWSER FUJI SEAM PASS ${fujiProbeIndex + 1}/${fujiProbes.length}: FLD/${probe.from} -> FLD/${probe.to}.`);
  fujiProbeIndex += 1;
  if (fujiProbeIndex >= fujiProbes.length) {
    drivingGame?.setInputOverride({ throttle: 0, steering: 0, boost: false });
    console.info("BROWSER FUJI ROUTE PASS: FLD/223 -> FLD/221 -> FLD/220 -> FLD/113 without a world reload.");
  } else {
    armFujiProbe();
  }
}

function accumulateAdvertisingDistance(state: CarState): void {
  const sponsorIndex = playerEquipmentState
    ? advertisingSponsorIndexFromOptionSelector(playerEquipmentState.selectedItem(0, 11))
    : undefined;
  const result = advertisingDistanceTracker.record(state.distanceTravelled, sponsorIndex, playerCommerceState);
  if (result.saveRecommended) queueRecoveredProgressSave();
}

function stopDrivingSession(): void {
  endActiveInterior();
  endResidentDialogue();
  queueRecoveredProgressSave();
  drivingGame?.stop();
  drivingGame = undefined;
  fujiProbeIndex = -1;
  isDriving = false;
  driveToggle.textContent = "Start driving Q62";
  driveToggle.disabled = !drivingWorld;
  worldLocation.disabled = !drivingWorld || activeManifest?.installStage === "bootstrap";
  requiredElement<HTMLElement>("viewer-help").textContent = "Drag to orbit · Scroll to zoom · Right-drag to pan";
  if (drivingWorld) requiredElement<HTMLElement>("viewer-title").textContent = loadedWorldFieldNumbers.size === 64 ? "The whole world" : "Peach Town area";
  refreshGameHud();
}

function nearbyPrompt(state: CarState): string | undefined {
  const resident = worldSimulation?.nearest(state.fieldNumber, state.position, 5);
  const interaction = findNearestFixedInteraction(overworldCatalogue?.interactions ?? [], state.fieldNumber, state.position);
  const label = resident?.definition.name ?? interaction?.interaction.name;
  return label ? `Nearby · ${label} · E ${resident ? "talk" : "enter"}` : undefined;
}

function currentGameHudState(driveState?: CarState): GameHudState {
  const cake = playerCommerceState?.cake ?? 0;
  if (peachRaceCoordinator) {
    const session = peachRaceCoordinator.runtime.session;
    const player = session.entrant(0);
    const live = session.livePositions();
    return {
      mode: "race",
      cake,
      location: "Peach Raceway",
      raceStatus: raceStatusText({
        countdownComplete: session.isCountdownComplete,
        finishIndex: player.finishIndex,
        completedLaps: player.completedLaps,
        entrantCount: session.entrantCount,
        requiredLaps: session.requiredLaps,
        rewardSaved: peachRaceRewardApplied,
        positionIndex: live.status === "available"
          ? live.positions.find((entry) => entry.carIndex === 0)?.positionIndex
          : undefined,
      }),
    };
  }
  const state = driveState ?? drivingGame?.controller.state;
  if (isDriving && state) {
    return {
      mode: "driving",
      cake,
      location: fieldDisplayName(state.fieldNumber),
      speedKph: Math.round(Math.abs(state.speed) * 3.6),
      nearby: nearbyPrompt(state),
    };
  }
  return { mode: "overview", cake, location: "" };
}

/**
 * Normal play shows game state only. Sector/triangle/resident counts, raw field
 * ids, coordinates and surface live in the developer overlay instead.
 */
function refreshGameHud(driveState?: CarState): void {
  const view = gameHudView(currentGameHudState(driveState));
  if (playUiActive) {
    gameHud.hidden = peachRaceResultOpen || !view.visible;
    installedPanel.hidden = view.visible;
  }
  hudLocation.textContent = view.location;
  hudCake.textContent = view.cake;
  hudSpeed.textContent = view.speed;
  hudSpeed.hidden = !view.speedVisible;
  hudStatus.textContent = view.status;
  hudStatus.hidden = !view.statusVisible;
  hudHint.textContent = view.hint;
  if (debugOverlayVisible) refreshDebugOverlay();
}

function refreshDebugOverlay(): void {
  const state = peachRaceCoordinator ? undefined : drivingGame?.controller.state;
  const rows = liveDiagnosticsRows({
    mode: peachRaceCoordinator ? "race" : isDriving ? "driving" : "overview",
    fps: debugFrameRate.fps,
    fieldNumber: state?.fieldNumber,
    position: state?.position,
    surface: state?.surfaceKind,
    loadedSectors: loadedWorldFieldNumbers.size,
    installStage: activeManifest?.installStage,
  });
  debugLiveRows.replaceChildren(...rows.map((row) => {
    const line = document.createElement("div");
    const label = document.createElement("dt");
    label.textContent = row.label;
    const value = document.createElement("dd");
    value.textContent = row.value;
    line.append(label, value);
    return line;
  }));
}

function setDebugOverlayVisible(visible: boolean): void {
  if (debugOverlayVisible === visible) return;
  debugOverlayVisible = visible;
  debugOverlay.hidden = !visible;
  requiredElement<HTMLElement>("debug-feedback").hidden = true;
  requiredElement<HTMLElement>("pause-diagnostics").textContent = visible ? "Hide developer diagnostics" : "Show developer diagnostics";
  if (visible) {
    debugFrameRate.reset();
    refreshDebugOverlay();
    debugOverlayFrame = requestAnimationFrame(sampleDebugOverlayFrame);
  } else if (debugOverlayFrame) {
    cancelAnimationFrame(debugOverlayFrame);
    debugOverlayFrame = 0;
  }
}

// Only runs while a developer has the overlay open, so normal play and
// deterministic captures keep their original timing.
function sampleDebugOverlayFrame(timestamp: number): void {
  debugFrameRate.sample(timestamp);
  refreshDebugOverlay();
  debugOverlayFrame = requestAnimationFrame(sampleDebugOverlayFrame);
}

async function copyDiagnosticsReport(): Promise<void> {
  const rows = [...debugOverlay.querySelectorAll<HTMLElement>(".debug-rows div")].map((line) => ({
    label: line.querySelector("dt")?.textContent ?? "",
    value: line.querySelector("dd")?.textContent ?? "",
  }));
  const text = diagnosticsReportText(rows, { capturedAt: new Date().toISOString(), userAgent: navigator.userAgent });
  const feedback = requiredElement<HTMLElement>("debug-feedback");
  feedback.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    feedback.textContent = "Diagnostics copied to the clipboard.";
  } catch (error) {
    feedback.textContent = "The browser refused clipboard access; the report was logged to the console instead.";
    console.info(text, error);
  }
}

function pauseMenuAvailable(): boolean {
  return canOpenPauseMenu({
    hasInstall: playUiActive,
    raceActive: !!peachRaceCoordinator,
    dialogueActive: !!activeDialogue,
    interiorActive: !!qFactorySession || !!shopInteriorSession || !!shopInteriorPreviewInteraction || qFactoryLoading || shopInteriorPreviewLoading,
    importActive: !importCard.hidden,
    captureMode: app.dataset.captureMode === "true",
  });
}

function openPauseMenu(): void {
  if (pauseMenuOpen || !pauseMenuAvailable()) return;
  pauseMenuOpen = true;
  pauseReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  drivingGame?.setPaused(true);
  worldSimulation?.setPaused(true);
  pauseStopDriving.hidden = !isDriving;
  pauseOverlay.hidden = false;
  pauseResume.focus();
}

function closePauseMenu(): void {
  if (!pauseMenuOpen) return;
  pauseMenuOpen = false;
  pauseOverlay.hidden = true;
  worldSimulation?.setPaused(false);
  if (isDriving) drivingGame?.setPaused(false);
  pauseReturnFocus?.focus();
  pauseReturnFocus = undefined;
}

async function loadDialogueCatalogue(executableBytes: Uint8Array): Promise<void> {
  const { fallbackDialogueGreeting, readDialogueEntity } = await import("./formats/dialogue");
  residentGreetings = new Map();
  for (const name of ["James", "Klien", "Barthou", "Pillow", "Kevin", "Newman"] as const) {
    const entity = readDialogueEntity(executableBytes, 1, name);
    residentGreetings.set(name.toLowerCase(), fallbackDialogueGreeting(entity));
  }
  qFactoryDialogueEntity = readDialogueEntity(executableBytes, 1, "Q's Factory");
  if (!playerDialogueState) throw new Error("Recovered dialogue state was not loaded before the executable catalogue.");
  playerDialogueState.currentAreaIndex = 1;
  console.info(`PAL dialogue: ${residentGreetings.size} Peach roaming greetings and ${qFactoryDialogueEntity.variants.length} Q's Factory streams decoded from SLES_513.56.`);
}

function handleShellKey(event: KeyboardEvent): void {
  if (event.repeat) return;
  if (event.code === "F3") {
    if (!playUiActive) return;
    event.preventDefault();
    setDebugOverlayVisible(!debugOverlayVisible);
    return;
  }
  if (event.code !== "Escape") return;
  if (pauseMenuOpen) {
    event.preventDefault();
    closePauseMenu();
    return;
  }
  if (!pauseMenuAvailable()) return;
  event.preventDefault();
  openPauseMenu();
}

function handleDialogueKey(event: KeyboardEvent): void {
  if (event.repeat) return;
  if (shopInteriorSession) {
    if (quickPicPhotoSession) {
      if (["KeyE", "Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        keepQuickPicPhoto();
      } else if (event.code === "Escape") {
        event.preventDefault();
        cancelQuickPicPhoto();
      }
      return;
    }
    if (paintShopSession) {
      if (["ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        movePaintShopCursor(-1);
      } else if (["ArrowDown", "KeyS"].includes(event.code)) {
        event.preventDefault();
        movePaintShopCursor(1);
      } else if (["ArrowLeft", "KeyA"].includes(event.code)) {
        event.preventDefault();
        stepPaintShopChannel(-1);
      } else if (["ArrowRight", "KeyD"].includes(event.code)) {
        event.preventDefault();
        stepPaintShopChannel(1);
      } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        purchaseSelectedPaint();
      } else if (event.code === "Escape") {
        event.preventDefault();
        finishPaintShopSelector(false);
      }
      return;
    }
    if (partsShopSession) {
      if (["ArrowLeft", "KeyA"].includes(event.code)) {
        event.preventDefault();
        partsShopSession.moveCategory(-1);
        renderPartsShopCatalogue();
      } else if (["ArrowRight", "KeyD"].includes(event.code)) {
        event.preventDefault();
        partsShopSession.moveCategory(1);
        renderPartsShopCatalogue();
      } else if (["ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        partsShopSession.moveItem(-1);
        renderPartsShopCatalogue();
      } else if (["ArrowDown", "KeyS"].includes(event.code)) {
        event.preventDefault();
        partsShopSession.moveItem(1);
        renderPartsShopCatalogue();
      } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        purchaseSelectedPart();
      } else if (event.code === "Escape") {
        event.preventDefault();
        finishPartsShopCatalogue();
      }
      return;
    }
    if (bodyShopSession) {
      if (["ArrowLeft", "ArrowUp", "KeyA", "KeyW"].includes(event.code)) {
        event.preventDefault();
        bodyShopSession.moveItem(-1);
        renderBodyShopCatalogue();
      } else if (["ArrowRight", "ArrowDown", "KeyD", "KeyS"].includes(event.code)) {
        event.preventDefault();
        bodyShopSession.moveItem(1);
        renderBodyShopCatalogue();
      } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        purchaseSelectedBody();
      } else if (event.code === "Escape") {
        event.preventDefault();
        finishBodyShopCatalogue();
      }
      return;
    }
    if (shopNumericChoiceSession) {
      if (["ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        moveShopNumericChoice(1);
      } else if (["ArrowDown", "KeyS"].includes(event.code)) {
        event.preventDefault();
        moveShopNumericChoice(-1);
      } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        finishShopNumericChoice();
      } else if (event.code === "Escape") {
        event.preventDefault();
        endShopInteriorPreview();
      }
      return;
    }
    const choices = shopInteriorSession.flow.currentChoices;
    if (["ArrowUp", "KeyW"].includes(event.code) && choices.length) {
      event.preventDefault();
      shopInteriorSession.choiceIndex = (shopInteriorSession.choiceIndex - 1 + choices.length) % choices.length;
      renderShopInteriorDialogue();
    } else if (["ArrowDown", "KeyS"].includes(event.code) && choices.length) {
      event.preventDefault();
      shopInteriorSession.choiceIndex = (shopInteriorSession.choiceIndex + 1) % choices.length;
      renderShopInteriorDialogue();
    } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
      event.preventDefault();
      if (choices.length) chooseShopInteriorDialogue(shopInteriorSession.choiceIndex);
      else if (shopInteriorSession.flow.currentExternalAction) {
        if (isCurrentQuickPicPhotoAction()) void captureCurrentQuickPicPhoto();
        else returnFromShopInteriorHostAction();
      }
      else advanceShopInteriorDialogue();
    } else if (event.code === "Escape") {
      event.preventDefault();
      endShopInteriorPreview();
    }
    return;
  }
  if (shopInteriorPreviewLoading) {
    if (event.code === "Escape") { event.preventDefault(); endShopInteriorPreview(); }
    return;
  }
  // A room whose executable stream is not decoded yet still remains a safe,
  // truthful backdrop preview instead of leaking input into the paused world.
  if (shopInteriorPreviewInteraction) {
    if (["KeyE", "Enter", "Space", "Escape"].includes(event.code)) {
      event.preventDefault();
      endShopInteriorPreview();
    }
    return;
  }
  if (qFactorySession) {
    if (changePartsSession) {
      if (["ArrowLeft", "KeyA"].includes(event.code)) {
        event.preventDefault();
        movePartsCategory(-1);
      } else if (["ArrowRight", "KeyD"].includes(event.code)) {
        event.preventDefault();
        movePartsCategory(1);
      } else if (["ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        movePartsSelection(-1);
      } else if (["ArrowDown", "KeyS"].includes(event.code)) {
        event.preventDefault();
        movePartsSelection(1);
      } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        finishChangeParts(true);
      } else if (event.code === "Escape") {
        event.preventDefault();
        finishChangeParts(false);
      }
      return;
    }
    const choices = qFactorySession.flow.currentChoices;
    if (["ArrowUp", "KeyW"].includes(event.code) && choices.length) {
      event.preventDefault();
      qFactorySession.choiceIndex = (qFactorySession.choiceIndex - 1 + choices.length) % choices.length;
      renderQFactoryDialogue();
    } else if (["ArrowDown", "KeyS"].includes(event.code) && choices.length) {
      event.preventDefault();
      qFactorySession.choiceIndex = (qFactorySession.choiceIndex + 1) % choices.length;
      renderQFactoryDialogue();
    } else if (["KeyE", "Enter", "Space"].includes(event.code)) {
      event.preventDefault();
      if (choices.length) chooseQFactoryDialogue(qFactorySession.choiceIndex);
      else if (qFactorySession.flow.currentExternalAction) activateQFactoryHostAction();
      else advanceQFactoryDialogue();
    } else if (event.code === "Escape") {
      event.preventDefault();
      if (qFactorySession.flow.currentExternalAction?.opcode === raceSelectActionOpcode) returnFromQFactoryHostAction();
      else endQFactoryInterior();
    }
    return;
  }
  if (activeDialogue) {
    if (["KeyE", "Enter", "Space"].includes(event.code)) { event.preventDefault(); advanceResidentDialogue(); }
    else if (event.code === "Escape") { event.preventDefault(); endResidentDialogue(); }
    return;
  }
  if (event.code !== "KeyE" || !isDriving || !drivingGame || Math.abs(drivingGame.controller.state.speed) > 5.6) return;
  const state = drivingGame.controller.state;
  const resident = worldSimulation?.nearest(state.fieldNumber, state.position, 5);
  if (resident) {
    const greeting = residentGreetings.get(resident.definition.name.toLowerCase());
    if (!greeting?.pages.length) return;
    event.preventDefault();
    startResidentDialogue(resident.definition.name, greeting.pages);
    return;
  }
  const interaction = findNearestFixedInteraction(overworldCatalogue?.interactions ?? [], state.fieldNumber, state.position)?.interaction;
  if (!interaction) return;
  event.preventDefault();
  if (interaction.areaIndex === 1 && interaction.localIndex === 0) {
    void startQFactoryInterior(interaction).catch((error) => showError("Q's Factory could not be opened.", error));
  } else {
    void startShopInteriorPreview(interaction).catch((error) => showError(`${interaction.name} interior atlas could not be opened.`, error));
  }
}

function startResidentDialogue(speaker: string, pages: string[]): void {
  activeDialogue = { speaker, pages, pageIndex: 0 };
  drivingGame?.setPaused(true);
  worldSimulation?.setPaused(true);
  renderResidentDialogue();
  console.info(`Dialogue start: ${speaker}; ${pages.length} original executable page${pages.length === 1 ? "" : "s"}.`);
}

function advanceResidentDialogue(): void {
  if (!activeDialogue) return;
  if (activeDialogue.pageIndex + 1 < activeDialogue.pages.length) {
    activeDialogue.pageIndex += 1;
    renderResidentDialogue();
  } else {
    endResidentDialogue();
  }
}

function renderResidentDialogue(): void {
  const overlay = requiredElement<HTMLElement>("dialogue-overlay");
  if (!activeDialogue) { overlay.hidden = true; return; }
  requiredElement<HTMLElement>("dialogue-speaker").textContent = activeDialogue.speaker;
  requiredElement<HTMLElement>("dialogue-text").textContent = activeDialogue.pages[activeDialogue.pageIndex] ?? "";
  overlay.hidden = false;
}

function endResidentDialogue(): void {
  if (!activeDialogue) return;
  const speaker = activeDialogue.speaker;
  activeDialogue = undefined;
  requiredElement<HTMLElement>("dialogue-overlay").hidden = true;
  drivingGame?.setPaused(false);
  worldSimulation?.setPaused(false);
  console.info(`Dialogue end: ${speaker}; persistent simulation resumed.`);
}

async function startShopInteriorPreview(interaction: FixedInteractionDefinition): Promise<void> {
  if (qFactorySession || qFactoryLoading || shopInteriorPreviewInteraction || shopInteriorPreviewLoading) return;
  if (!drivingGame || !activeDirectory || !activeManifest || !activeExecutableBytes || !playerDialogueState) throw new Error("The fixed-interior dependencies are not ready.");

  drivingGame.setPaused(true);
  worldSimulation?.setPaused(true);
  shopInteriorPreviewLoading = true;
  const generation = ++shopInteriorPreviewLoadGeneration;
  const root = requiredElement<HTMLElement>("factory-interior");
  root.hidden = false;
  requiredElement<HTMLElement>("factory-speaker").textContent = interaction.name;
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  const shopRoot = requiredElement<HTMLElement>("factory-shop");
  shopRoot.hidden = true;
  shopRoot.classList.remove("body-shop");
  requiredElement<HTMLElement>("factory-text").textContent = `Preparing ${interaction.name} authored interior atlas…`;
  requiredElement<HTMLElement>("factory-choices").replaceChildren();
  requiredElement<HTMLElement>("factory-host-action").hidden = true;
  requiredElement<HTMLButtonElement>("factory-continue").hidden = true;
  requiredElement<HTMLButtonElement>("factory-return").hidden = true;
  requiredElement<HTMLButtonElement>("factory-leave").textContent = "Return to town";
  sizeFactoryStage();
  sceneFade.flash();

  try {
    const { readShopInteriorBackdrop, shopInteriorPackagePath, shopInteriorSlotCount } = await import("./formats/shopInterior");
    const packagePath = shopInteriorPackagePath(interaction.areaIndex);
    const staffPath = carAssetPath(interaction.bodyId);
    const available = new Set(activeManifest.files.map((file) => file.path.toUpperCase()));
    if (!available.has(packagePath.toUpperCase())) throw new Error(`The local install does not contain ${packagePath}.`);
    const [
      { ShopInteriorRoomView: InteriorPreviewClass },
      { DialogueFlow: DialogueFlowClass, readDialogueEntityAtIndex },
      { Q62CarModel: CarModelClass },
      shopBytes,
      tireBytes,
      wheelBytes,
      playerBytes,
      staffBytes,
    ] = await Promise.all([
      import("./game/interiorView"),
      import("./formats/dialogue"),
      import("./game/carView"),
      readBytes(activeDirectory, `game/${packagePath}`),
      readBytes(activeDirectory, "game/CARS/TIRE.BIN"),
      readOptionalInstalledWheelBytes(activeDirectory),
      readBytes(activeDirectory, "game/CAR2/Q62.BIN"),
      readBytes(activeDirectory, `game/${staffPath}`),
    ]);
    if (generation !== shopInteriorPreviewLoadGeneration) return;
    shopInteriorPlayerBytes = playerBytes;
    shopInteriorTireBytes = tireBytes;
    shopInteriorWheelBytes = wheelBytes;
    bodyShopPreviewBodyId = 62;
    const slotCount = shopInteriorSlotCount(shopBytes);
    if (interaction.localIndex >= slotCount) {
      throw new Error(`${packagePath} contains ${slotCount} fixed slots; interaction ${interaction.localIndex} lies outside the package.`);
    }
    const backdrop = readShopInteriorBackdrop(shopBytes, interaction.localIndex);
    const playerModel = new CarModelClass(playerBytes, tireBytes, { name: "Q62 interior player", ...currentPlayerCarOptions(wheelBytes) });
    playerModel.setPartsAppearance(aggregatePartsAppearance(equippedParts));
    const staffModel = new CarModelClass(staffBytes, tireBytes, {
      name: `${interaction.name} Q${interaction.bodyId}`,
      primaryPaint: [interaction.paint.primary.r, interaction.paint.primary.g, interaction.paint.primary.b],
      secondaryPaint: [interaction.paint.secondary.r, interaction.paint.secondary.g, interaction.paint.secondary.b],
    });
    shopInteriorPreviewView = new InteriorPreviewClass(
      requiredElement<HTMLElement>("factory-canvas-host"),
      backdrop,
      interaction.name,
      { playerCar: playerModel, staffCar: staffModel },
    );
    shopInteriorPreviewInteraction = interaction;
    try {
      const entity = readDialogueEntityAtIndex(activeExecutableBytes, interaction.areaIndex, interaction.localIndex);
      const state = playerDialogueState;
      state.currentAreaIndex = interaction.areaIndex;
      const parameters = new URLSearchParams(location.search);
      const requestedProbeSlot = parameters.has("interiorProbe") ? Number.parseInt(parameters.get("interiorSlot") ?? "", 10) : Number.NaN;
      const probeSlot = Number.isInteger(requestedProbeSlot) && entity.variants.some((variant) => variant.pointerTableSlot === requestedProbeSlot)
        ? requestedProbeSlot
        : undefined;
      const flow = new DialogueFlowClass(entity, state, probeSlot ?? fixedInteriorStartSlot(entity));
      shopInteriorSession = { flow, choiceIndex: defaultChoiceIndex(flow.currentChoices), interaction, entity };
      queueRecoveredProgressSave();
      requiredElement<HTMLElement>("factory-speaker").textContent = entity.name;
      renderShopInteriorDialogue();
      console.info(`${interaction.name} fixed interior start: ${packagePath} slot ${interaction.localIndex}, dialogue '${entity.name}' entity ${entity.entityIndex}${probeSlot ? ` probe slot 0x${probeSlot.toString(16).padStart(2, "0")}` : ""}, ${backdrop.width}x${backdrop.height}, ${backdrop.dmaPacketCount} DMA packets; outdoor state paused.`);
    } catch (error) {
      shopInteriorSession = undefined;
      const reason = error instanceof Error ? error.message : String(error);
      requiredElement<HTMLElement>("factory-text").textContent = "This authored room is available, but its original interaction stream has not been reconstructed yet.";
      requiredElement<HTMLElement>("factory-key-hint").textContent = "E / Enter / Esc · return to town";
      requiredElement<HTMLButtonElement>("factory-continue").hidden = true;
      requiredElement<HTMLButtonElement>("factory-return").hidden = true;
      console.warn(`${interaction.name} fixed interior opened without dialogue: ${reason}`);
    }
  } catch (error) {
    if (generation !== shopInteriorPreviewLoadGeneration) return;
    shopInteriorPreviewView?.dispose();
    shopInteriorPreviewView = undefined;
    shopInteriorPreviewInteraction = undefined;
    shopInteriorSession = undefined;
    root.hidden = true;
    drivingGame.setPaused(false);
    worldSimulation?.setPaused(false);
    throw error;
  } finally {
    if (generation === shopInteriorPreviewLoadGeneration) shopInteriorPreviewLoading = false;
  }
}

function endShopInteriorPreview(): void {
  if (!shopInteriorPreviewInteraction && !shopInteriorPreviewView && !shopInteriorPreviewLoading) return;
  shopInteriorPreviewLoadGeneration += 1;
  shopInteriorPreviewLoading = false;
  const name = shopInteriorPreviewInteraction?.name ?? "Interior";
  shopInteriorPreviewView?.dispose();
  shopInteriorPreviewView = undefined;
  shopInteriorPreviewInteraction = undefined;
  shopInteriorSession = undefined;
  shopNumericChoiceSession = undefined;
  shopAdvertisingRewardSession = undefined;
  partsShopSession = undefined;
  secondHandShopActive = false;
  bodyShopSession = undefined;
  paintShopSession = undefined;
  closeQuickPicPhoto();
  requiredElement<HTMLElement>("factory-paint-selector").hidden = true;
  requiredElement<HTMLElement>("factory-dialogue").classList.remove("paint-active");
  bodyShopPreviewGeneration += 1;
  bodyShopPreviewBodyId = 62;
  shopInteriorPlayerBytes = undefined;
  shopInteriorTireBytes = undefined;
  shopInteriorWheelBytes = undefined;
  requiredElement<HTMLElement>("factory-canvas-host").replaceChildren();
  const root = requiredElement<HTMLElement>("factory-interior");
  root.hidden = true;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  const shopRoot = requiredElement<HTMLElement>("factory-shop");
  shopRoot.hidden = true;
  shopRoot.classList.remove("body-shop");
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  requiredElement<HTMLElement>("factory-speaker").textContent = "Q's Factory";
  delete root.dataset.dialogueSlot;
  drivingGame?.setPaused(false);
  worldSimulation?.setPaused(false);
  sceneFade.flash();
  console.info(`${name} fixed interior closed; outdoor state resumed.`);
}

function advanceShopInteriorDialogue(): void {
  const session = shopInteriorSession;
  if (!session || session.flow.currentChoices.length || session.flow.currentExternalAction) return;
  session.flow.advance();
  if (session.flow.ended) endShopInteriorPreview();
  else renderShopInteriorDialogue();
}

function chooseShopInteriorDialogue(index: number): void {
  const session = shopInteriorSession;
  if (!session) return;
  const selected = session.flow.currentChoices[index];
  if (!selected) return;
  console.info(`${session.entity.name} dialogue: slot 0x${session.flow.currentSlot.toString(16).padStart(2, "0")} '${selected.text}' -> 0x${selected.targetSlot.toString(16).padStart(2, "0")}.`);
  session.flow.choose(index);
  queueRecoveredProgressSave();
  if (session.flow.ended) { endShopInteriorPreview(); return; }
  session.choiceIndex = defaultChoiceIndex(session.flow.currentChoices);
  renderShopInteriorDialogue();
}

function returnFromShopInteriorHostAction(): void {
  const session = shopInteriorSession;
  const action = session?.flow.currentExternalAction;
  if (!session || !action) return;
  const presentation = describeFixedInteriorHostAction(session.entity.name, action);
  if (!presentation.returnSlot) { endShopInteriorPreview(); return; }
  console.info(`${session.entity.name} host action ${presentation.title} returned to slot 0x${presentation.returnSlot.toString(16).padStart(2, "0")}.`);
  session.flow.returnFromExternalAction(presentation.returnSlot);
  queueRecoveredProgressSave();
  if (session.flow.ended) { endShopInteriorPreview(); return; }
  session.choiceIndex = defaultChoiceIndex(session.flow.currentChoices);
  renderShopInteriorDialogue();
}

function isQuickPicPhotoAction(entityName: string, action: DialogueActionToken | undefined): action is DialogueActionToken {
  const photoNumber = action?.operands[0] ?? 0;
  return /^Quick-Pic Shop No[.,]\s*\d+$/i.test(entityName)
    && action?.opcode === quickPicPhotoActionOpcode
    && isQuickPicPhotoNumber(photoNumber)
    && (action.operands[1] ?? 0) > 0;
}

function isCurrentQuickPicPhotoAction(): boolean {
  const session = shopInteriorSession;
  return !!session && isQuickPicPhotoAction(session.entity.name, session.flow.currentExternalAction);
}

async function captureCurrentQuickPicPhoto(): Promise<void> {
  const session = shopInteriorSession;
  const view = shopInteriorPreviewView;
  const action = session?.flow.currentExternalAction;
  if (!session || !view || !isQuickPicPhotoAction(session.entity.name, action) || quickPicPhotoSession) return;
  const photoNumber = action.operands[0] ?? 0;
  const returnButton = requiredElement<HTMLButtonElement>("factory-return");
  returnButton.disabled = true;
  returnButton.textContent = "Taking picture…";
  try {
    const png = await view.capturePng({ width: 1280, height: 960 });
    if (shopInteriorSession !== session || session.flow.currentExternalAction !== action) return;
    const objectUrl = URL.createObjectURL(png);
    quickPicPhotoSession = { action, photoNumber, objectUrl };
    requiredElement<HTMLElement>("factory-dialogue").hidden = true;
    requiredElement<HTMLElement>("quick-pic-title").textContent = `Quick-Pic No. ${photoNumber}`;
    requiredElement<HTMLImageElement>("quick-pic-image").src = objectUrl;
    const download = requiredElement<HTMLAnchorElement>("quick-pic-download");
    download.href = objectUrl;
    download.download = `rta-quick-pic-${photoNumber.toString().padStart(2, "0")}.png`;
    requiredElement<HTMLElement>("quick-pic-photo").hidden = false;
    console.info(`${session.entity.name} captured a 1280x960 PNG; progress remains unchanged until the picture is kept.`);
  } catch (error) {
    console.error(`${session.entity.name} could not capture its Quick-Pic PNG.`, error);
    requiredElement<HTMLElement>("factory-action-detail").textContent = "The browser could not capture this picture. You can retry or return to town.";
  } finally {
    returnButton.disabled = false;
    if (!quickPicPhotoSession) returnButton.textContent = "Take picture";
  }
}

function closeQuickPicPhoto(): void {
  if (quickPicPhotoSession) URL.revokeObjectURL(quickPicPhotoSession.objectUrl);
  quickPicPhotoSession = undefined;
  requiredElement<HTMLElement>("quick-pic-photo").hidden = true;
  requiredElement<HTMLImageElement>("quick-pic-image").removeAttribute("src");
  requiredElement<HTMLAnchorElement>("quick-pic-download").removeAttribute("href");
}

function cancelQuickPicPhoto(): void {
  if (!quickPicPhotoSession) return;
  closeQuickPicPhoto();
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  renderShopInteriorDialogue();
}

function keepQuickPicPhoto(): void {
  const photo = quickPicPhotoSession;
  const session = shopInteriorSession;
  if (!photo || !session || session.flow.currentExternalAction !== photo.action || !playerDialogueState) return;
  const changed = applyRecoveredDialogueHostAction(playerDialogueState, photo.action);
  if (changed) {
    queueRecoveredProgressSave();
    console.info(`${session.entity.name} original Quick-Pic completion bit ${photo.photoNumber} stored in the browser install.`);
  }
  closeQuickPicPhoto();
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  returnFromShopInteriorHostAction();
}

function moveShopNumericChoice(direction: -1 | 1): void {
  const session = shopNumericChoiceSession;
  if (!session) return;
  session.value = stepNativeNumericChoice(session.value, direction);
  renderShopNumericChoice();
}

function renderShopNumericChoice(): void {
  const session = shopNumericChoiceSession;
  const root = requiredElement<HTMLElement>("factory-numeric-choice");
  root.hidden = !session;
  if (!session) return;
  requiredElement<HTMLOutputElement>("factory-numeric-value").value = session.value.toString().padStart(2, "0");
  requiredElement<HTMLButtonElement>("factory-numeric-decrement").disabled = session.value === 0;
  requiredElement<HTMLButtonElement>("factory-numeric-increment").disabled = session.value === 99;
}

function finishShopNumericChoice(): void {
  const interior = shopInteriorSession;
  const numeric = shopNumericChoiceSession;
  if (!interior || !numeric || interior.flow.currentExternalAction !== numeric.action) return;
  const target = nativeNumericChoiceTarget(numeric.action, numeric.value);
  console.info(`${interior.entity.name} numeric selection ${numeric.value} returned to slot 0x${target.toString(16).padStart(2, "0")}.`);
  shopNumericChoiceSession = undefined;
  renderShopNumericChoice();
  if (target <= 0) {
    endShopInteriorPreview();
    return;
  }
  interior.flow.returnFromExternalAction(target);
  queueRecoveredProgressSave();
  if (interior.flow.ended) { endShopInteriorPreview(); return; }
  interior.choiceIndex = defaultChoiceIndex(interior.flow.currentChoices);
  renderShopInteriorDialogue();
}

function startPartsShopCatalogue(): boolean {
  const interaction = shopInteriorSession?.interaction;
  if (!interaction || !/^Parts Shop(?: Staff)?$/i.test(interaction.name)) return false;
  const stock = reconstructedPartsShopStock(interaction.areaIndex);
  if (!stock || !playerDialogueState || !playerCommerceState) return false;
  partsShopSession = new PartsShopCatalogueSession(stock);
  secondHandShopActive = false;
  requiredElement<HTMLElement>("factory-dialogue").hidden = true;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  const shopRoot = requiredElement<HTMLElement>("factory-shop");
  shopRoot.hidden = false;
  shopRoot.classList.remove("body-shop");
  requiredElement<HTMLElement>("shop-categories").hidden = false;
  requiredElement<HTMLElement>("shop-title").textContent = interaction.name.replace(/ Staff$/i, "");
  requiredElement<HTMLElement>("shop-subtitle").textContent = "Original local stock";
  requiredElement<HTMLElement>("shop-location").textContent = "Peach Town";
  requiredElement<HTMLElement>("shop-balance").textContent = `${(playerCommerceState?.cake ?? 0).toLocaleString("en-US")} Cake`;
  requiredElement<HTMLButtonElement>("shop-purchase").hidden = false;
  requiredElement<HTMLElement>("shop-limitation").textContent = "Purchases use the original indexed ownership categories, five-copy equipment capacity and base prices. Native direct purchase does not equip; teammate trade remains deferred.";
  requiredElement<HTMLElement>("shop-key-hint").textContent = "← / → category · ↑ / ↓ item · E buy · Esc return";
  renderPartsShopCatalogue();
  console.info(`${interaction.name}: opened reconstructed Peach catalogue with ${stock.length} original stock entries.`);
  return true;
}

function startSecondHandShopCatalogue(): boolean {
  const session = shopInteriorSession;
  if (!session || !/^Second-hand shop$/i.test(session.entity.name) || !playerDialogueState || !playerCommerceState) return false;
  const stock = reconstructedSecondHandInventory(playerDialogueState);
  if (stock.length === 0) return false;
  partsShopSession = new PartsShopCatalogueSession(stock);
  secondHandShopActive = true;
  requiredElement<HTMLElement>("factory-dialogue").hidden = true;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  const shopRoot = requiredElement<HTMLElement>("factory-shop");
  shopRoot.hidden = false;
  shopRoot.classList.remove("body-shop");
  requiredElement<HTMLElement>("shop-categories").hidden = false;
  requiredElement<HTMLElement>("shop-title").textContent = "Second-hand shop";
  requiredElement<HTMLElement>("shop-subtitle").textContent = "Owned original parts";
  requiredElement<HTMLElement>("shop-location").textContent = "Cloud Hill";
  requiredElement<HTMLButtonElement>("shop-purchase").hidden = false;
  requiredElement<HTMLElement>("shop-limitation").textContent = "PAL removes one owned copy, keeps the fitted selector unchanged, and credits half the original base price rounded down.";
  requiredElement<HTMLElement>("shop-key-hint").textContent = "← / → category · ↑ / ↓ part · E sell · Esc return";
  renderPartsShopCatalogue();
  console.info(`Second-hand shop: opened ${stock.length} owned, exactly priced native part entries.`);
  return true;
}

function renderPartsShopCatalogue(): void {
  const session = partsShopSession;
  const ownership = playerDialogueState;
  const commerce = playerCommerceState;
  if (!session || !ownership || !commerce) return;
  const categoryHost = requiredElement<HTMLElement>("shop-categories");
  categoryHost.replaceChildren();
  session.categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = shopPartCategoryLabels[category];
    button.classList.toggle("selected", category === session.category);
    button.setAttribute("aria-current", category === session.category ? "true" : "false");
    button.addEventListener("click", () => {
      if (!partsShopSession) return;
      partsShopSession.selectCategory(category);
      renderPartsShopCatalogue();
    });
    categoryHost.append(button);
  });

  const stockHost = requiredElement<HTMLElement>("shop-stock");
  stockHost.replaceChildren();
  session.items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === session.itemIndex ? "true" : "false");
    button.classList.toggle("selected", index === session.itemIndex);
    const name = document.createElement("span");
    name.textContent = item.name;
    const price = document.createElement("small");
    const count = ownership.indexedFlagCount(item.nativeCategory, item.nativeItemIndex);
    price.textContent = secondHandShopActive
      ? `${Math.trunc(item.priceCake / 2).toLocaleString("en-US")} Cake offer · ${count} owned`
      : count >= 5
        ? "Full · 5/5"
        : `${item.priceCake.toLocaleString("en-US")} Cake${count > 0 ? ` · ${count}/5` : ""}`;
    button.append(name, price);
    button.addEventListener("click", () => {
      if (!partsShopSession) return;
      partsShopSession.selectItem(index);
      renderPartsShopCatalogue();
    });
    stockHost.append(button);
  });

  const selected = session.selectedItem;
  const count = ownership.indexedFlagCount(selected.nativeCategory, selected.nativeItemIndex);
  const full = count >= 5;
  const saleValue = Math.trunc(selected.priceCake / 2);
  const purchaseButton = requiredElement<HTMLButtonElement>("shop-purchase");
  requiredElement<HTMLElement>("shop-balance").textContent = `${commerce.cake.toLocaleString("en-US")} Cake`;
  requiredElement<HTMLElement>("shop-detail-category").textContent = shopPartCategoryLabels[selected.category];
  requiredElement<HTMLElement>("shop-detail-name").textContent = selected.name;
  requiredElement<HTMLElement>("shop-detail-price").textContent = secondHandShopActive
    ? `${saleValue.toLocaleString("en-US")} Cake offer · owned ${count}/5`
    : full
      ? "Inventory full · 5/5"
      : `${selected.priceCake.toLocaleString("en-US")} Cake · owned ${count}/5`;
  requiredElement<HTMLElement>("shop-detail-description").textContent = selected.description;
  purchaseButton.disabled = secondHandShopActive ? count <= 0 : full;
  purchaseButton.textContent = secondHandShopActive
    ? count <= 0 ? "No copies left" : `Sell for ${saleValue.toLocaleString("en-US")} Cake`
    : full ? "Inventory full" : `Buy for ${selected.priceCake.toLocaleString("en-US")} Cake`;
}

function purchaseSelectedPart(): void {
  const session = partsShopSession;
  const ownership = playerDialogueState;
  const commerce = playerCommerceState;
  if (!session || !ownership || !commerce) return;
  const selected = session.selectedItem;
  if (secondHandShopActive) {
    const result = sellIndexedPart(ownership, commerce, selected.nativeCategory, selected.nativeItemIndex, selected.priceCake);
    renderPartsShopCatalogue();
    const limitation = requiredElement<HTMLElement>("shop-limitation");
    if (result.status === "sold") {
      limitation.textContent = `${selected.name} was sold for ${result.saleValueCake.toLocaleString("en-US")} Cake. ${result.ownedAfter}/5 copies remain; balance ${result.cakeAfter.toLocaleString("en-US")} Cake. The fitted selector was not changed.`;
      queueRecoveredProgressSave();
      console.info(`Second-hand shop: sold category ${selected.nativeCategory}, item ${selected.nativeItemIndex} for ${result.saleValueCake} Cake; ${result.cakeAfter} Cake remains.`);
    } else {
      limitation.textContent = `${selected.name} is no longer owned. No Cake was credited.`;
    }
    return;
  }
  const result = purchaseIndexedItem(
    ownership,
    commerce,
    selected.nativeCategory,
    selected.nativeItemIndex,
    selected.priceCake,
  );
  renderPartsShopCatalogue();
  const limitation = requiredElement<HTMLElement>("shop-limitation");
  if (result.status === "purchased") {
    const count = ownership.indexedFlagCount(selected.nativeCategory, selected.nativeItemIndex);
    limitation.textContent = `${selected.name} was added (${count}/5 owned). ${selected.priceCake.toLocaleString("en-US")} Cake was debited; ${result.cakeAfter.toLocaleString("en-US")} Cake remains. The part was not auto-equipped.`;
    queueRecoveredProgressSave();
    console.info(`Parts Shop: bought category ${selected.nativeCategory}, item ${selected.nativeItemIndex} for ${selected.priceCake} Cake; ${result.cakeAfter} Cake remains.`);
  } else if (result.status === "insufficient-funds") {
    limitation.textContent = `${selected.name} costs ${selected.priceCake.toLocaleString("en-US")} Cake; the current balance is ${result.cakeBefore.toLocaleString("en-US")} Cake. Nothing was changed.`;
  } else if (result.status === "inventory-full") {
    limitation.textContent = `${selected.name} is already at the original five-copy capacity. No Cake was debited and the equipped part was not changed.`;
  } else {
    limitation.textContent = `${selected.name} is already owned. No Cake was debited and the equipped part was not changed.`;
  }
}

function finishPartsShopCatalogue(): void {
  if (!partsShopSession) return;
  partsShopSession = undefined;
  secondHandShopActive = false;
  requiredElement<HTMLElement>("factory-shop").hidden = true;
  requiredElement<HTMLButtonElement>("shop-purchase").hidden = true;
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  returnFromShopInteriorHostAction();
}

function startBodyShopCatalogue(): boolean {
  const interaction = shopInteriorSession?.interaction;
  if (!interaction || !/^Body Shop(?: Staff)?$/i.test(interaction.name)) return false;
  if (!playerDialogueState || !playerCommerceState) return false;
  const stock = reconstructedBodyShopStock(interaction.areaIndex);
  if (!stock) return false;
  bodyShopSession = new BodyShopCatalogueSession(stock);
  requiredElement<HTMLElement>("factory-dialogue").hidden = true;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  const shopRoot = requiredElement<HTMLElement>("factory-shop");
  shopRoot.hidden = false;
  shopRoot.classList.add("body-shop");
  requiredElement<HTMLElement>("shop-categories").hidden = true;
  requiredElement<HTMLElement>("shop-title").textContent = "Body Shop";
  requiredElement<HTMLElement>("shop-subtitle").textContent = "Original local stock";
  requiredElement<HTMLElement>("shop-location").textContent = interaction.areaIndex === 1 ? "Peach Town" : "Fuji City";
  requiredElement<HTMLButtonElement>("shop-purchase").hidden = false;
  requiredElement<HTMLElement>("shop-limitation").textContent = "A purchase records original namespace-0 ownership and debits 500 Cake. The native direct-purchase path does not equip the previewed body.";
  requiredElement<HTMLElement>("shop-key-hint").textContent = "← / → / ↑ / ↓ body · E buy · Esc return";
  renderBodyShopCatalogue();
  console.info(`${interaction.name}: opened reconstructed ${interaction.areaIndex === 1 ? "Peach" : "Fuji"} catalogue with ${stock.length} original bodies.`);
  return true;
}

function renderBodyShopCatalogue(): void {
  const session = bodyShopSession;
  const ownership = playerDialogueState;
  const commerce = playerCommerceState;
  if (!session || !ownership || !commerce) return;
  const stockHost = requiredElement<HTMLElement>("shop-stock");
  stockHost.replaceChildren();
  session.stockItems.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === session.itemIndex ? "true" : "false");
    button.classList.toggle("selected", index === session.itemIndex);
    const name = document.createElement("span");
    name.textContent = item.name;
    const id = document.createElement("small");
    id.textContent = ownership.hasIndexedFlag(0, item.bodyId)
      ? `Q${item.bodyId.toString().padStart(3, "0")} · Owned`
      : `Q${item.bodyId.toString().padStart(3, "0")} · ${item.priceCake} Cake`;
    button.append(name, id);
    button.addEventListener("click", () => {
      if (!bodyShopSession) return;
      bodyShopSession.selectItem(index);
      renderBodyShopCatalogue();
    });
    stockHost.append(button);
  });
  const selected = session.selectedItem;
  const owned = ownership.hasIndexedFlag(0, selected.bodyId);
  const purchaseButton = requiredElement<HTMLButtonElement>("shop-purchase");
  requiredElement<HTMLElement>("shop-balance").textContent = `${commerce.cake.toLocaleString("en-US")} Cake`;
  requiredElement<HTMLElement>("shop-detail-category").textContent = `Body Q${selected.bodyId.toString().padStart(3, "0")}`;
  requiredElement<HTMLElement>("shop-detail-name").textContent = selected.name;
  requiredElement<HTMLElement>("shop-detail-price").textContent = owned ? "Owned" : `${selected.priceCake} Cake`;
  requiredElement<HTMLElement>("shop-detail-description").textContent = "Original local Body Shop stock. The foreground player car previews this decoded body while retaining the current paint and equipped parts.";
  purchaseButton.disabled = owned;
  purchaseButton.textContent = owned ? "Owned" : `Buy for ${selected.priceCake} Cake`;
  void previewBodyShopBody(selected.bodyId);
}

function purchaseSelectedBody(): void {
  const session = bodyShopSession;
  const ownership = playerDialogueState;
  const commerce = playerCommerceState;
  if (!session || !ownership || !commerce) return;
  const selected = session.selectedItem;
  const result = purchaseIndexedItem(ownership, commerce, 0, selected.bodyId, selected.priceCake);
  renderBodyShopCatalogue();
  const limitation = requiredElement<HTMLElement>("shop-limitation");
  if (result.status === "purchased") {
    limitation.textContent = `${selected.name} is now owned. ${selected.priceCake} Cake was debited; ${result.cakeAfter.toLocaleString("en-US")} Cake remains. The preview is intentionally not auto-equipped.`;
    queueRecoveredProgressSave();
    console.info(`Body Shop: bought body ${selected.bodyId} for ${selected.priceCake} Cake; ${result.cakeAfter} Cake remains.`);
  } else if (result.status === "insufficient-funds") {
    limitation.textContent = `${selected.name} costs ${selected.priceCake} Cake; the current balance is ${result.cakeBefore.toLocaleString("en-US")} Cake. Nothing was changed.`;
  } else {
    limitation.textContent = `${selected.name} is already owned. No Cake was debited and the equipped body was not changed.`;
  }
}

function finishBodyShopCatalogue(): void {
  if (!bodyShopSession) return;
  bodyShopSession = undefined;
  requiredElement<HTMLElement>("factory-shop").hidden = true;
  requiredElement<HTMLButtonElement>("shop-purchase").hidden = true;
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  void previewBodyShopBody(62, true);
  returnFromShopInteriorHostAction();
}

async function previewBodyShopBody(bodyId: number, force = false): Promise<void> {
  const view = shopInteriorPreviewView;
  const tireBytes = shopInteriorTireBytes;
  const wheelBytes = shopInteriorWheelBytes;
  const directory = activeDirectory;
  if (!view || !tireBytes || !directory || (!force && bodyShopPreviewBodyId === bodyId)) return;
  const generation = ++bodyShopPreviewGeneration;
  try {
    const [{ Q62CarModel: CarModelClass }, bodyBytes] = await Promise.all([
      import("./game/carView"),
      bodyId === 62 && shopInteriorPlayerBytes
        ? Promise.resolve(shopInteriorPlayerBytes)
        : readBytes(directory, `game/${carAssetPath(bodyId)}`),
    ]);
    if (generation !== bodyShopPreviewGeneration || view !== shopInteriorPreviewView) return;
    const model = new CarModelClass(bodyBytes, tireBytes, { name: `Body Shop Q${bodyId.toString().padStart(3, "0")} preview`, ...currentPlayerCarOptions(wheelBytes) });
    model.setPartsAppearance(aggregatePartsAppearance(equippedParts));
    view.setPlayerCar(model);
    bodyShopPreviewBodyId = bodyId;
  } catch (error) {
    console.warn(`Body Shop Q${bodyId} preview failed:`, error);
  }
}

function isPaintShopHostAction(): boolean {
  const session = shopInteriorSession;
  const action = session?.flow.currentExternalAction;
  return !!session && !!action && /^Paint Shop(?: Staff)?$/i.test(session.entity.name)
    && action.opcode === paintShopActionOpcode && (action.operands[0] ?? 0) === 0;
}

function startPaintShopSelector(): void {
  if (!isPaintShopHostAction() || !playerEquipmentState || !playerCommerceState) return;
  if (!paintShopSession) {
    paintShopSession = new PaintShopSession(playerEquipmentState.paintWord ?? browserCompatibilityPaintWord);
    paintShopCursor = { kind: "body", tone: 0, channel: 0 };
    console.info("Paint Shop: opened the recovered two-tone RGB444 body selector plus native 12-step wheel-colour selector.");
  }
  requiredElement<HTMLElement>("factory-paint-selector").hidden = false;
  requiredElement<HTMLElement>("factory-dialogue").classList.add("paint-active");
  renderPaintShopSelector();
  previewPaintShopWord(paintShopSession.draftWord);
}

function renderPaintShopSelector(message?: string): void {
  const session = paintShopSession;
  const commerce = playerCommerceState;
  if (!session || !commerce) return;
  const paints = decodeNativeBodyPaint(session.draftWord);
  requiredElement<HTMLElement>("paint-primary-swatch").style.backgroundColor = `rgb(${paints.primary.join(",")})`;
  requiredElement<HTMLElement>("paint-secondary-swatch").style.backgroundColor = `rgb(${paints.secondary.join(",")})`;
  const grid = requiredElement<HTMLElement>("paint-channel-grid");
  grid.replaceChildren();
  const toneNames = ["Primary", "Secondary"] as const;
  const channelNames = ["R", "G", "B"] as const;
  for (const tone of [0, 1] as const) {
    for (const channel of [0, 1, 2] as const) {
      const row = document.createElement("div");
      row.className = "paint-channel-row";
      row.classList.toggle("selected", paintShopCursor.kind === "body" && paintShopCursor.tone === tone && paintShopCursor.channel === channel);
      const label = document.createElement("button");
      label.type = "button";
      label.textContent = `${toneNames[tone]} ${channelNames[channel]}`;
      label.addEventListener("click", () => {
        paintShopCursor = { kind: "body", tone, channel };
        renderPaintShopSelector();
      });
      const decrement = document.createElement("button");
      decrement.type = "button";
      decrement.textContent = "−";
      decrement.disabled = nativePaintChannel(session.draftWord, tone, channel) === 0;
      decrement.addEventListener("click", () => {
        paintShopCursor = { kind: "body", tone, channel };
        stepPaintShopChannel(-1);
      });
      const value = document.createElement("output");
      value.value = nativePaintChannel(session.draftWord, tone, channel).toString(16).toUpperCase();
      const increment = document.createElement("button");
      increment.type = "button";
      increment.textContent = "+";
      increment.disabled = nativePaintChannel(session.draftWord, tone, channel) === 15;
      increment.addEventListener("click", () => {
        paintShopCursor = { kind: "body", tone, channel };
        stepPaintShopChannel(1);
      });
      row.append(label, decrement, value, increment);
      grid.append(row);
    }
  }
  const wheelIndex = nativeWheelPaintIndex(session.draftWord);
  const wheelColor = nativeWheelPaintColor(session.draftWord);
  requiredElement<HTMLElement>("paint-wheel-swatch").style.backgroundColor = `rgb(${wheelColor.join(",")})`;
  const wheelRow = document.createElement("div");
  wheelRow.className = "paint-channel-row";
  wheelRow.classList.toggle("selected", paintShopCursor.kind === "wheel");
  const wheelLabel = document.createElement("button");
  wheelLabel.type = "button";
  wheelLabel.textContent = "Wheel colour";
  wheelLabel.addEventListener("click", () => { paintShopCursor = { kind: "wheel" }; renderPaintShopSelector(); });
  const wheelDecrement = document.createElement("button");
  wheelDecrement.type = "button";
  wheelDecrement.textContent = "−";
  wheelDecrement.disabled = wheelIndex === 0;
  wheelDecrement.addEventListener("click", () => { paintShopCursor = { kind: "wheel" }; stepPaintShopChannel(-1); });
  const wheelValue = document.createElement("output");
  wheelValue.value = `${wheelIndex.toString().padStart(2, "0")} / ${nativeWheelPaintCount - 1}`;
  const wheelIncrement = document.createElement("button");
  wheelIncrement.type = "button";
  wheelIncrement.textContent = "+";
  wheelIncrement.disabled = wheelIndex === nativeWheelPaintCount - 1;
  wheelIncrement.addEventListener("click", () => { paintShopCursor = { kind: "wheel" }; stepPaintShopChannel(1); });
  wheelRow.append(wheelLabel, wheelDecrement, wheelValue, wheelIncrement);
  grid.append(wheelRow);

  const price = session.priceCake;
  const bodyPrice = session.bodyPriceCake;
  const wheelPrice = session.wheelPriceCake;
  requiredElement<HTMLElement>("paint-feedback").textContent = message
    ?? (price === 0
      ? `No paint change · ${commerce.cake.toLocaleString("en-US")} Cake available`
      : `Original price · body ${bodyPrice} + wheels ${wheelPrice} = ${price} Cake · ${commerce.cake.toLocaleString("en-US")} Cake available`);
  const apply = requiredElement<HTMLButtonElement>("paint-apply");
  apply.textContent = price === 0 ? "Keep current paint" : `Paint for ${price} Cake`;
}

function movePaintShopCursor(direction: -1 | 1): void {
  const index = paintShopCursor.kind === "wheel" ? 6 : paintShopCursor.tone * 3 + paintShopCursor.channel;
  const next = (index + direction + 7) % 7;
  paintShopCursor = next === 6
    ? { kind: "wheel" }
    : { kind: "body", tone: Math.floor(next / 3) as NativePaintTone, channel: (next % 3) as NativePaintChannel };
  renderPaintShopSelector();
}

function stepPaintShopChannel(direction: -1 | 1): void {
  const session = paintShopSession;
  if (!session) return;
  if (paintShopCursor.kind === "wheel") session.stepWheelPaint(direction);
  else session.stepChannel(paintShopCursor.tone, paintShopCursor.channel, direction);
  renderPaintShopSelector();
  previewPaintShopWord(session.draftWord);
}

function purchaseSelectedPaint(): void {
  const session = paintShopSession;
  const equipment = playerEquipmentState;
  const commerce = playerCommerceState;
  if (!session || !equipment || !commerce) return;
  const result = purchasePaint(equipment, commerce, session.draftWord);
  if (result.status === "insufficient-funds") {
    renderPaintShopSelector(`Paint costs ${result.priceCake} Cake; only ${result.cakeBefore.toLocaleString("en-US")} Cake is available. Nothing was changed.`);
    return;
  }
  if (result.status === "painted") {
    const paints = decodeNativeBodyPaint(session.draftWord);
    playerCar?.setPaints(paints.primary, paints.secondary);
    playerCar?.setNativeWheelColor(nativeWheelPaintColor(session.draftWord), nativeWheelPaintIndex(session.draftWord));
    queueRecoveredProgressSave();
    console.info(`Paint Shop: stored packed paint word 0x${session.draftWord.toString(16).padStart(8, "0")} (wheel index ${nativeWheelPaintIndex(session.draftWord)}) and debited ${result.priceCake} Cake; ${result.cakeAfter} remains.`);
  } else {
    console.info("Paint Shop: confirmed unchanged body/wheel colours; no Cake was debited.");
  }
  finishPaintShopSelector(true);
}

function finishPaintShopSelector(keepDraft: boolean): void {
  if (!paintShopSession) return;
  paintShopSession = undefined;
  requiredElement<HTMLElement>("factory-paint-selector").hidden = true;
  requiredElement<HTMLElement>("factory-dialogue").classList.remove("paint-active");
  if (!keepDraft) void previewCurrentPlayerPaint();
  returnFromShopInteriorHostAction();
}

function previewPaintShopWord(word: number): void {
  const view = shopInteriorPreviewView;
  if (!view || !paintShopSession) return;
  const paints = decodeNativeBodyPaint(word);
  view.setPlayerPaints(paints.primary, paints.secondary);
  view.setPlayerWheelColor(nativeWheelPaintColor(word), nativeWheelPaintIndex(word));
}

async function previewCurrentPlayerPaint(): Promise<void> {
  const view = shopInteriorPreviewView;
  const playerBytes = shopInteriorPlayerBytes;
  const tireBytes = shopInteriorTireBytes;
  const wheelBytes = shopInteriorWheelBytes;
  if (!view || !playerBytes || !tireBytes) return;
  const generation = ++bodyShopPreviewGeneration;
  const { Q62CarModel: CarModelClass } = await import("./game/carView");
  if (generation !== bodyShopPreviewGeneration || view !== shopInteriorPreviewView) return;
  const model = new CarModelClass(playerBytes, tireBytes, { name: "Q62 interior player", ...currentPlayerCarOptions(wheelBytes) });
  model.setPartsAppearance(aggregatePartsAppearance(equippedParts));
  view.setPlayerCar(model, "Q62 interior player");
}

function renderShopInteriorDialogue(): void {
  const session = shopInteriorSession;
  if (!session) return;
  const flow = session.flow;
  if (flow.currentExternalAction?.opcode === shopOrServiceActionOpcode) {
    if (startPartsShopCatalogue() || startBodyShopCatalogue() || startSecondHandShopCatalogue()) return;
  }
  if (isPaintShopHostAction()) startPaintShopSelector();
  const root = requiredElement<HTMLElement>("factory-interior");
  root.dataset.dialogueSlot = `0x${flow.currentSlot.toString(16).padStart(2, "0")}`;
  requiredElement<HTMLElement>("factory-text").textContent = flow.currentPage ?? "";
  const choicesHost = requiredElement<HTMLElement>("factory-choices");
  choicesHost.replaceChildren();
  flow.currentChoices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.text;
    button.classList.toggle("selected", index === session.choiceIndex);
    button.setAttribute("aria-current", index === session.choiceIndex ? "true" : "false");
    button.addEventListener("mouseenter", () => {
      if (!shopInteriorSession || shopInteriorSession.choiceIndex === index) return;
      shopInteriorSession.choiceIndex = index;
      renderShopInteriorDialogue();
    });
    button.addEventListener("click", () => chooseShopInteriorDialogue(index));
    choicesHost.append(button);
  });

  const external = flow.currentExternalAction;
  const hostAction = requiredElement<HTMLElement>("factory-host-action");
  const continueButton = requiredElement<HTMLButtonElement>("factory-continue");
  const returnButton = requiredElement<HTMLButtonElement>("factory-return");
  if (external) {
    const quickPicPhoto = isQuickPicPhotoAction(session.entity.name, external);
    const dialogueChanged = !quickPicPhoto && playerDialogueState && applyRecoveredDialogueHostAction(playerDialogueState, external);
    const equipmentChanged = playerEquipmentState && applyRecoveredEquipmentHostAction(playerEquipmentState, external);
    if (equipmentChanged) {
      const definition = knownNativePart(external.operands[0] ?? -1, external.operands[1] ?? -1);
      if (definition) {
        equippedParts = equipPart(equippedParts, definition.category, definition.id);
        applyEquippedParts();
        if (activeDirectory) {
          void writeJson(activeDirectory, "save/development-parts.json", createDevelopmentPartsSave(equippedParts))
            .then(() => console.info(`Native ${definition.name} appearance bridge saved in the current browser install.`))
            .catch((error) => console.error("The native equipment appearance bridge could not be saved.", error));
        }
      }
    }
    if (dialogueChanged || equipmentChanged) {
      queueRecoveredProgressSave();
      if (external.opcode === 0x07) {
        console.info(`${session.entity.name} original indexed progress [${external.operands[0] ?? 0},${external.operands[1] ?? 0}] stored in the browser install.`);
      } else if (external.opcode === 0x0d) {
        console.info(`${session.entity.name} original stamp award [${[...external.operands].join(",")}] stored in the browser install.`);
      } else if (external.opcode === 0x15) {
        console.info(`${session.entity.name} fitted original equipment category ${external.operands[0] ?? 0}, item ${external.operands[1] ?? 0}; the selector is stored in the browser install.`);
      }
    }
    const advertisingReward = applyAdvertisingRewardAction(external);
    const presentation = describeFixedInteriorHostAction(session.entity.name, external);
    if (external.opcode === numericChoiceActionOpcode) {
      if (shopNumericChoiceSession?.action !== external) {
        shopNumericChoiceSession = { action: external, value: nativeNumericChoiceInitialValue };
      }
    } else {
      shopNumericChoiceSession = undefined;
    }
    renderShopNumericChoice();
    requiredElement<HTMLElement>("factory-action-title").textContent = presentation.title;
    requiredElement<HTMLElement>("factory-action-detail").textContent = advertisingReward
      ? describeAdvertisingReward(advertisingReward)
      : presentation.detail;
    hostAction.hidden = false;
    returnButton.textContent = quickPicPhoto
      ? "Take picture"
      : shopNumericChoiceSession
      ? "Confirm number"
      : presentation.returnSlot ? `Return to ${session.entity.name}` : (presentation.leaveLabel ?? "Return to town");
    returnButton.hidden = !!paintShopSession;
  } else {
    shopNumericChoiceSession = undefined;
    shopAdvertisingRewardSession = undefined;
    renderShopNumericChoice();
    hostAction.hidden = true;
    returnButton.hidden = true;
  }
  continueButton.hidden = flow.currentChoices.length > 0 || !!external;
  requiredElement<HTMLElement>("factory-key-hint").textContent = flow.currentChoices.length
    ? "↑ / ↓ · E select"
    : external
      ? paintShopSession
        ? "↑ / ↓ channel · ← / → value · E confirm · Esc cancel"
        : shopNumericChoiceSession ? "↑ / ↓ · choose number · E confirm" : "E · continue"
      : "E / Enter · continue";
}

function applyAdvertisingRewardAction(action: DialogueActionToken): AdvertisingRedemptionResult | undefined {
  if (action.opcode !== advertisingRewardActionOpcode || !playerCommerceState) {
    shopAdvertisingRewardSession = undefined;
    return undefined;
  }
  if (shopAdvertisingRewardSession?.action === action) return shopAdvertisingRewardSession.result;
  const sponsorIndex = action.operands[0] ?? -1;
  if (sponsorIndex < 0 || sponsorIndex >= advertisingSponsorCount) return undefined;
  const result = playerCommerceState.redeemAdvertisingCake(sponsorIndex);
  shopAdvertisingRewardSession = { action, result };
  if (result.status === "credited") {
    queueRecoveredProgressSave();
    console.info(`${shopInteriorSession?.entity.name ?? "Advertising sponsor"} redeemed ${result.redeemedBlocks} distance block${result.redeemedBlocks === 1 ? "" : "s"} for ${result.cakeAwarded} Cake; ${result.distanceAfter} distance units retained.`);
  }
  return result;
}

function describeAdvertisingReward(result: AdvertisingRedemptionResult): string {
  if (result.status === "below-threshold") {
    return `${result.distanceBefore.toLocaleString("en-US")} of 1,000 fitted-sign distance units recorded. Keep driving with this sponsor's sign fitted.`;
  }
  return `${result.redeemedBlocks.toLocaleString("en-US")} complete distance block${result.redeemedBlocks === 1 ? "" : "s"} redeemed for ${result.cakeAwarded.toLocaleString("en-US")} Cake. ${result.distanceAfter.toLocaleString("en-US")} distance units remain; balance ${result.cakeAfter.toLocaleString("en-US")} Cake.`;
}

function endActiveInterior(): void {
  if (shopInteriorPreviewInteraction || shopInteriorPreviewView || shopInteriorPreviewLoading) endShopInteriorPreview();
  else endQFactoryInterior();
}

async function startQFactoryInterior(interaction: FixedInteractionDefinition): Promise<void> {
  if (qFactorySession || qFactoryLoading || shopInteriorPreviewInteraction || shopInteriorPreviewLoading) return;
  if (!drivingGame || !activeDirectory || !activeManifest || !qFactoryDialogueEntity || !playerDialogueState) {
    throw new Error("The Q's Factory scene dependencies are not ready.");
  }
  const staffPath = carAssetPath(interaction.bodyId);
  const available = new Set(activeManifest.files.map((file) => file.path.toUpperCase()));
  if (!available.has(staffPath.toUpperCase())) throw new Error(`The local install does not contain ${staffPath}.`);

  drivingGame.setPaused(true);
  worldSimulation?.setPaused(true);
  qFactoryLoading = true;
  const generation = ++qFactoryLoadGeneration;
  const root = requiredElement<HTMLElement>("factory-interior");
  root.hidden = false;
  requiredElement<HTMLElement>("factory-speaker").textContent = "Q's Factory";
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  requiredElement<HTMLElement>("factory-shop").hidden = true;
  requiredElement<HTMLElement>("factory-text").textContent = "Preparing Q's Factory…";
  requiredElement<HTMLElement>("factory-choices").replaceChildren();
  requiredElement<HTMLElement>("factory-host-action").hidden = true;
  requiredElement<HTMLButtonElement>("factory-continue").hidden = true;
  requiredElement<HTMLButtonElement>("factory-return").hidden = true;
  sizeFactoryStage();
  sceneFade.flash();
  try {
    const [{ readShopInteriorBackdrop }, { DialogueFlow: DialogueFlowClass }, { QFactoryInteriorView: InteriorViewClass }, { Q62CarModel: CarModelClass }, shopBytes, tireBytes, wheelBytes, playerBytes, staffBytes] = await Promise.all([
      import("./formats/shopInterior"),
      import("./formats/dialogue"),
      import("./game/interiorView"),
      import("./game/carView"),
      readBytes(activeDirectory, "game/SHOP/T00.BIN"),
      readBytes(activeDirectory, "game/CARS/TIRE.BIN"),
      readOptionalInstalledWheelBytes(activeDirectory),
      readBytes(activeDirectory, "game/CAR2/Q62.BIN"),
      readBytes(activeDirectory, `game/${staffPath}`),
    ]);
    if (generation !== qFactoryLoadGeneration) return;
    const backdrop = readShopInteriorBackdrop(shopBytes, interaction.localIndex);
    const playerModel = new CarModelClass(playerBytes, tireBytes, { name: "Q62 factory player", ...currentPlayerCarOptions(wheelBytes) });
    playerModel.setPartsAppearance(aggregatePartsAppearance(equippedParts));
    const staffModel = new CarModelClass(staffBytes, tireBytes, {
      name: `${interaction.name} Q${interaction.bodyId}`,
      primaryPaint: [interaction.paint.primary.r, interaction.paint.primary.g, interaction.paint.primary.b],
      secondaryPaint: [interaction.paint.secondary.r, interaction.paint.secondary.g, interaction.paint.secondary.b],
    });
    qFactoryInteriorView = new InteriorViewClass(
      requiredElement<HTMLElement>("factory-canvas-host"),
      backdrop,
      playerModel,
      staffModel,
    );
    playerDialogueState.currentAreaIndex = interaction.areaIndex;
    const flow = new DialogueFlowClass(qFactoryDialogueEntity, playerDialogueState, 0x04);
    qFactorySession = { flow, choiceIndex: defaultChoiceIndex(flow.currentChoices), interaction, raceOptionIndex: 0 };
    renderQFactoryDialogue();
    console.info(`Q's Factory start: SHOP/T00 slot ${interaction.localIndex}, ${backdrop.width}x${backdrop.height}, ${backdrop.dmaPacketCount} DMA packets; outdoor state paused.`);
  } catch (error) {
    if (generation !== qFactoryLoadGeneration) return;
    qFactoryInteriorView?.dispose();
    qFactoryInteriorView = undefined;
    qFactorySession = undefined;
    root.hidden = true;
    drivingGame.setPaused(false);
    worldSimulation?.setPaused(false);
    throw error;
  } finally {
    if (generation === qFactoryLoadGeneration) qFactoryLoading = false;
  }
}

function advanceQFactoryDialogue(): void {
  const session = qFactorySession;
  if (!session || session.flow.currentChoices.length || session.flow.currentExternalAction) return;
  session.flow.advance();
  if (session.flow.ended) endQFactoryInterior();
  else renderQFactoryDialogue();
}

function chooseQFactoryDialogue(index: number): void {
  const session = qFactorySession;
  if (!session) return;
  const selected = session.flow.currentChoices[index];
  if (!selected) return;
  console.info(`Q's Factory dialogue: slot 0x${session.flow.currentSlot.toString(16).padStart(2, "0")} '${selected.text}' -> 0x${selected.targetSlot.toString(16).padStart(2, "0")}.`);
  session.flow.choose(index);
  if (session.flow.ended) { endQFactoryInterior(); return; }
  session.choiceIndex = defaultChoiceIndex(session.flow.currentChoices);
  renderQFactoryDialogue();
}

function returnFromQFactoryHostAction(): void {
  const session = qFactorySession;
  const action = session?.flow.currentExternalAction;
  if (!session || !action) return;
  const presentation = describeInteriorHostAction(action);
  if (!presentation.returnSlot) { endQFactoryInterior(); return; }
  console.info(`Q's Factory host action ${presentation.title} returned to slot 0x${presentation.returnSlot.toString(16).padStart(2, "0")}.`);
  session.flow.returnFromExternalAction(presentation.returnSlot);
  if (session.flow.ended) { endQFactoryInterior(); return; }
  session.choiceIndex = defaultChoiceIndex(session.flow.currentChoices);
  renderQFactoryDialogue();
}

function startChangeParts(): void {
  const action = qFactorySession?.flow.currentExternalAction;
  const ownership = playerDialogueState;
  const equipment = playerEquipmentState;
  if (!qFactorySession || action?.opcode !== selectTeamCarActionOpcode || changePartsSession || !ownership || !equipment) return;
  const originalSelectors = [...(equipment.selectorEntries()[0] ?? [])];
  const catalogue = nativeFittingCatalogue(ownership, originalSelectors);
  if (!catalogue.length) {
    console.warn("Q's Factory has no executable-mapped fitting choices for the current save state.");
    returnFromQFactoryHostAction();
    return;
  }
  const draft = createPartLoadout(equippedParts);
  changePartsSession = {
    original: equippedParts,
    draft,
    originalSelectors,
    draftSelectors: [...originalSelectors],
    catalogue,
    categoryIndex: 0,
    partIndex: selectedNativeFittingPartIndex(catalogue[0]!, originalSelectors),
  };
  requiredElement<HTMLElement>("factory-dialogue").hidden = true;
  requiredElement<HTMLElement>("factory-parts").hidden = false;
  qFactoryInteriorView?.setPlayerPartsAppearance(aggregatePartsAppearance(draft));
  renderChangeParts();
  const choiceCount = catalogue.reduce((total, category) => total + category.parts.length, 0);
  console.info(`Q's Factory change-parts selector opened with ${choiceCount} executable-mapped baseline/owned fitting choices across ${catalogue.length} categories.`);
}

function movePartsCategory(direction: number): void {
  const session = changePartsSession;
  if (!session) return;
  session.categoryIndex = wrapIndex(session.categoryIndex + direction, session.catalogue.length);
  session.partIndex = selectedNativeFittingPartIndex(session.catalogue[session.categoryIndex]!, session.draftSelectors);
  renderChangeParts();
}

function movePartsSelection(direction: number): void {
  const session = changePartsSession;
  if (!session) return;
  const category = session.catalogue[session.categoryIndex]!;
  session.partIndex = wrapIndex(session.partIndex + direction, category.parts.length);
  previewPartSelection(session.partIndex);
}

function previewPartSelection(partIndex: number): void {
  const session = changePartsSession;
  if (!session) return;
  const category = session.catalogue[session.categoryIndex]!;
  const part = category.parts[partIndex];
  if (!part) return;
  session.partIndex = partIndex;
  session.draftSelectors[part.nativeCategory] = part.nativeItemIndex;
  session.draft = equipPart(session.draft, category.category, part.definition.id);
  qFactoryInteriorView?.setPlayerPartsAppearance(aggregatePartsAppearance(session.draft));
  qFactoryInteriorView?.setPlayerNativeTyreAppearance(session.draftSelectors[1] ?? 0);
  renderChangeParts();
}

function renderChangeParts(): void {
  const session = changePartsSession;
  if (!session) return;
  const category = session.catalogue[session.categoryIndex]!;
  const categoryHost = requiredElement<HTMLElement>("parts-categories");
  categoryHost.replaceChildren();
  session.catalogue.forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = partCategoryLabels[candidate.category];
    button.classList.toggle("selected", candidate === category);
    button.classList.toggle("changed", session.draftSelectors[candidate.nativeCategory] !== session.originalSelectors[candidate.nativeCategory]);
    button.setAttribute("aria-current", candidate === category ? "true" : "false");
    button.addEventListener("click", () => {
      if (!changePartsSession) return;
      changePartsSession.categoryIndex = index;
      changePartsSession.partIndex = selectedNativeFittingPartIndex(candidate, changePartsSession.draftSelectors);
      renderChangeParts();
    });
    categoryHost.append(button);
  });

  const list = category.parts;
  const listHost = requiredElement<HTMLElement>("parts-list");
  listHost.replaceChildren();
  list.forEach((part, index) => {
    const fitted = session.draftSelectors[part.nativeCategory] === part.nativeItemIndex;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === session.partIndex ? "true" : "false");
    button.classList.toggle("selected", index === session.partIndex);
    button.classList.toggle("equipped", fitted);
    const name = document.createElement("span");
    name.textContent = part.definition.name;
    const available = document.createElement("small");
    available.textContent = fitted
      ? (part.ownedCount > 0 ? `Fitted · ${part.ownedCount} owned` : "Fitted · standard")
      : `${part.ownedCount} owned`;
    button.append(name, available);
    button.addEventListener("click", () => previewPartSelection(index));
    listHost.append(button);
  });
  listHost.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" });

  const selected = list[session.partIndex] ?? list[0]!;
  const definition = selected.definition;
  requiredElement<HTMLElement>("parts-detail-category").textContent = partCategoryLabels[category.category];
  requiredElement<HTMLElement>("parts-detail-name").textContent = definition.name;
  requiredElement<HTMLElement>("parts-detail-description").textContent = `${definition.description} Native selector ${selected.nativeCategory}:${selected.nativeItemIndex}; ${selected.nativeItemIndex === 0 ? "standard baseline" : `${selected.ownedCount} owned`}.`;
  const statHost = requiredElement<HTMLElement>("parts-stats");
  statHost.replaceChildren();
  const performance = aggregatePartPerformance(session.draft);
  const nativeTyreSelector = session.draftSelectors[1] ?? 0;
  const stats = [
    ["Acceleration", performance.acceleration],
    ["Top speed", performance.topSpeed],
    ["Steering", performance.steering],
    ["Braking", performance.braking],
    ["Road grip", performance.pavedGrip * nativeTyreGripMultiplier(nativeTyreSelector, "paved-road")],
    ["Dirt grip", performance.offroadGrip * nativeTyreGripMultiplier(nativeTyreSelector, "dirt")],
    ["Grass grip", performance.offroadGrip * nativeTyreGripMultiplier(nativeTyreSelector, "grass")],
  ] as const;
  for (const [label, value] of stats) {
    const row = document.createElement("div");
    row.className = "parts-stat";
    row.dataset.tone = value > 1.001 ? "up" : value < 0.999 ? "down" : "standard";
    const caption = document.createElement("span");
    caption.textContent = label;
    const track = document.createElement("i");
    const fill = document.createElement("b");
    fill.style.width = `${Math.max(8, Math.min(100, value / 1.65 * 100))}%`;
    track.append(fill);
    const amount = document.createElement("strong");
    amount.textContent = `${Math.round(value * 100)}%`;
    row.append(caption, track, amount);
    statHost.append(row);
  }
}

function finishChangeParts(apply: boolean): void {
  const session = changePartsSession;
  if (!session) return;
  if (apply) {
    const ownership = playerDialogueState;
    const equipment = playerEquipmentState;
    if (!ownership || !equipment) return;
    const planned = session.catalogue.filter((category) =>
      session.draftSelectors[category.nativeCategory] !== session.originalSelectors[category.nativeCategory]);
    for (const category of planned) {
      const item = session.draftSelectors[category.nativeCategory] ?? 0;
      const choice = category.parts.find((part) => part.nativeItemIndex === item);
      if (!choice || (item !== 0 && ownership.indexedFlagCount(category.nativeCategory, item) <= 0)) {
        console.warn(`Q's Factory refused unowned/unmapped fitting category ${category.nativeCategory}, item ${item}.`);
        renderChangeParts();
        return;
      }
    }

    let fittedCount = 0;
    for (const category of planned) {
      const item = session.draftSelectors[category.nativeCategory] ?? 0;
      const status = fitOwnedNativeEquipmentPart(ownership, equipment, 0, category.nativeCategory, item);
      if (status === "fitted") fittedCount += 1;
      else if (status !== "already-fitted") throw new Error(`Q's Factory fitting unexpectedly failed with status ${status}.`);
    }

    equippedParts = createPartLoadout(session.draft);
    applyEquippedParts();
    if (fittedCount > 0) queueRecoveredProgressSave();
    if (activeDirectory) {
      // Compatibility mirror for the older descriptive appearance layer. Native
      // selectors above are the authoritative recovered fitting state.
      void writeJson(activeDirectory, "save/development-parts.json", createDevelopmentPartsSave(equippedParts))
        .then(() => console.info("Q's Factory compatibility appearance loadout saved in the current browser install."))
        .catch((error) => console.error("The Q's Factory compatibility appearance loadout could not be saved.", error));
    }
    console.info(`Q62 native parts applied: ${fittedCount} selector change${fittedCount === 1 ? "" : "s"}; ${partCategoryOrder.filter((partCategory) => equippedParts[partCategory] !== defaultPartLoadout[partCategory]).length} visible non-standard selections.`);
  } else {
    qFactoryInteriorView?.setPlayerPartsAppearance(aggregatePartsAppearance(session.original));
    qFactoryInteriorView?.setPlayerNativeTyreAppearance(session.originalSelectors[1] ?? 0);
    console.info("Q62 parts preview cancelled; native selectors and saved loadout were not changed.");
  }
  changePartsSession = undefined;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  returnFromQFactoryHostAction();
}

function selectedNativeFittingPartIndex(category: NativeFittingCategory, selectors: readonly number[]): number {
  const selectedItem = selectors[category.nativeCategory] ?? 0;
  return Math.max(0, category.parts.findIndex((part) => part.nativeItemIndex === selectedItem));
}

function applyEquippedParts(): void {
  const appearance = aggregatePartsAppearance(equippedParts);
  const performance = aggregatePartPerformance(equippedParts);
  const nativeTyreSelector = playerEquipmentState?.selectedItem(0, 1) ?? 0;
  const nativeBrakeSelector = playerEquipmentState?.selectedItem(0, 6) ?? 0;
  qFactoryInteriorView?.setPlayerPartsAppearance(appearance);
  qFactoryInteriorView?.setPlayerNativeTyreAppearance(nativeTyreSelector);
  shopInteriorPreviewView?.setPlayerPartsAppearance(appearance);
  shopInteriorPreviewView?.setPlayerNativeTyreAppearance(nativeTyreSelector);
  playerCar?.setPartsAppearance(appearance);
  playerCar?.setNativeTyreAppearance(nativeTyreSelector);
  drivingGame?.setPartPerformance(performance);
  drivingGame?.setNativeTyreSelector(nativeTyreSelector);
  drivingGame?.setNativeBrakeSelector(nativeBrakeSelector);
}

function qFactoryRaceChoices() {
  const session = qFactorySession;
  if (!session || !activeExecutableBytes || !playerRaceState) return [];
  return qFactoryRaceOptions(readRaceCatalogue(activeExecutableBytes), playerRaceState, session.interaction.areaIndex);
}

function renderQFactoryRaceChoices(host: HTMLElement): void {
  const session = qFactorySession;
  if (!session) return;
  const options = qFactoryRaceChoices();
  if (!options[session.raceOptionIndex]?.launchSupported) session.raceOptionIndex = Math.max(0, options.findIndex((option) => option.launchSupported));
  options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = !option.launchSupported;
    button.textContent = option.activity.name + (option.unlocked ? option.launchSupported ? "" : " · not validated yet" : " · licence locked");
    button.classList.toggle("selected", index === session.raceOptionIndex);
    button.setAttribute("aria-current", index === session.raceOptionIndex ? "true" : "false");
    button.addEventListener("mouseenter", () => { if (option.launchSupported && qFactorySession) { qFactorySession.raceOptionIndex = index; renderQFactoryDialogue(); } });
    button.addEventListener("click", () => selectQFactoryRace(index));
    host.append(button);
  });
}

function selectQFactoryRace(index: number): void {
  const session = qFactorySession;
  const action = session?.flow.currentExternalAction;
  if (!session || !action || action.opcode !== raceSelectActionOpcode) return;
  const option = qFactoryRaceChoices()[index];
  if (!option?.launchSupported) return;
  session.raceOptionIndex = index;
  session.selectedRaceActivityId = option.activity.activityId;
  const { selectedTarget } = qFactoryRaceSelectionTargets(action);
  session.flow.returnFromExternalAction(selectedTarget);
  session.choiceIndex = defaultChoiceIndex(session.flow.currentChoices);
  renderQFactoryDialogue();
}

function activateQFactoryHostAction(): void {
  const session = qFactorySession;
  const action = session?.flow.currentExternalAction;
  if (!session || !action) return;
  if (action.opcode === raceSelectActionOpcode) { selectQFactoryRace(session.raceOptionIndex); return; }
  if (action.opcode === startRaceActionOpcode) { launchQFactoryRace(action); return; }
  returnFromQFactoryHostAction();
}

function launchQFactoryRace(action: DialogueActionToken): void {
  const session = qFactorySession;
  if (!session || !playerEquipmentState) return;
  const activityId = qFactoryRaceLaunchActivityId(action, session.selectedRaceActivityId);
  if (activityId !== 0) {
    console.warn(`Q's Factory activity ${activityId} remains outside the validated Peach Raceway launch boundary.`);
    return;
  }
  const selectors = playerEquipmentState.selectorEntries()[0] ?? Array(15).fill(0);
  console.info(`Q's Factory launching executable-selected activity ${activityId} with recovered Q62 equipment selectors.`);
  void startPeachRace(true, selectors, activityId, true).catch((error) => {
    stopPeachRace();
    showError("Peach Raceway could not start from Q's Factory.", error);
  });
}

function renderQFactoryDialogue(): void {
  const session = qFactorySession;
  if (!session) return;
  const flow = session.flow;
  const external = flow.currentExternalAction;
  if (flow.currentExternalAction?.opcode === selectTeamCarActionOpcode) {
    startChangeParts();
    return;
  }
  const root = requiredElement<HTMLElement>("factory-interior");
  root.dataset.dialogueSlot = `0x${flow.currentSlot.toString(16).padStart(2, "0")}`;
  const selectedRace = session.selectedRaceActivityId === undefined ? undefined : qFactoryRaceChoices().find((option) => option.activity.activityId === session.selectedRaceActivityId)?.activity;
  requiredElement<HTMLElement>("factory-text").textContent = (flow.currentPage ?? "").replace("$R", selectedRace?.name ?? "$R");
  const choicesHost = requiredElement<HTMLElement>("factory-choices");
  choicesHost.replaceChildren();
  flow.currentChoices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.text;
    button.classList.toggle("selected", index === session.choiceIndex);
    button.setAttribute("aria-current", index === session.choiceIndex ? "true" : "false");
    button.addEventListener("mouseenter", () => {
      if (!qFactorySession || qFactorySession.choiceIndex === index) return;
      qFactorySession.choiceIndex = index;
      renderQFactoryDialogue();
    });
    button.addEventListener("click", () => chooseQFactoryDialogue(index));
    choicesHost.append(button);
  });

  if (external?.opcode === raceSelectActionOpcode) renderQFactoryRaceChoices(choicesHost);

  const hostAction = requiredElement<HTMLElement>("factory-host-action");
  const continueButton = requiredElement<HTMLButtonElement>("factory-continue");
  const returnButton = requiredElement<HTMLButtonElement>("factory-return");
  if (external) {
    const presentation = describeInteriorHostAction(external);
    const raceSelection = external.opcode === raceSelectActionOpcode;
    const peachLaunch = external.opcode === startRaceActionOpcode && session.selectedRaceActivityId === 0;
    requiredElement<HTMLElement>("factory-action-title").textContent = raceSelection ? "Race selector" : presentation.title;
    requiredElement<HTMLElement>("factory-action-detail").textContent = raceSelection
      ? "Peach Town's executable selector exposes its authored race range. Only independently validated Peach Raceway can launch in this milestone."
      : peachLaunch ? "Launch the selected Peach Raceway session with Q62's recovered fitted equipment." : presentation.detail;
    hostAction.hidden = false;
    returnButton.textContent = raceSelection ? "Cancel race selection" : peachLaunch ? "Start Peach Raceway"
      : presentation.returnSlot ? "Return to Q's Factory" : (presentation.leaveLabel ?? "Return to town");
    returnButton.hidden = false;
  } else {
    hostAction.hidden = true;
    returnButton.hidden = true;
  }
  continueButton.hidden = flow.currentChoices.length > 0 || !!external;
  requiredElement<HTMLElement>("factory-key-hint").textContent = flow.currentChoices.length
    ? "↑ / ↓ · E select"
    : external
      ? external.opcode === raceSelectActionOpcode ? "E · select supported race · Esc cancel"
        : external.opcode === startRaceActionOpcode && session.selectedRaceActivityId === 0 ? "E · start race" : "E · return"
      : "E / Enter · continue";
}

function endQFactoryInterior(): void {
  if (!qFactorySession && !qFactoryInteriorView && !qFactoryLoading) return;
  qFactoryLoadGeneration += 1;
  qFactoryLoading = false;
  const name = qFactorySession?.interaction.name ?? "Q's Factory";
  qFactoryInteriorView?.dispose();
  qFactoryInteriorView = undefined;
  qFactorySession = undefined;
  changePartsSession = undefined;
  const canvasHost = requiredElement<HTMLElement>("factory-canvas-host");
  canvasHost.replaceChildren();
  const root = requiredElement<HTMLElement>("factory-interior");
  root.hidden = true;
  requiredElement<HTMLElement>("factory-parts").hidden = true;
  requiredElement<HTMLElement>("factory-dialogue").hidden = false;
  delete root.dataset.dialogueSlot;
  drivingGame?.setPaused(false);
  worldSimulation?.setPaused(false);
  sceneFade.flash();
  console.info(`Q's Factory end: ${name}; outdoor player and resident state resumed.`);
}

function sizeFactoryStage(): void {
  const root = requiredElement<HTMLElement>("factory-interior");
  const stage = requiredElement<HTMLElement>("factory-stage");
  const width = Math.max(1, root.clientWidth), height = Math.max(1, root.clientHeight);
  const stageWidth = Math.min(width, height * 4 / 3);
  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${stageWidth * 3 / 4}px`;
}

async function ensurePlayerCarModel(): Promise<Q62CarModel> {
  if (playerCar) return playerCar;
  if (!activeDirectory) throw new Error("The installed game data is unavailable for Q62 capture.");
  const [{ Q62CarModel: Q62CarModelClass }, carBytes, tireBytes, wheelBytes] = await Promise.all([
    import("./game/carView"),
    readBytes(activeDirectory, "game/CAR2/Q62.BIN"),
    readBytes(activeDirectory, "game/CARS/TIRE.BIN"),
    readOptionalInstalledWheelBytes(activeDirectory),
  ]);
  playerCar = new Q62CarModelClass(carBytes, tireBytes, currentPlayerCarOptions(wheelBytes));
  playerCar.setPartsAppearance(aggregatePartsAppearance(equippedParts));
  return playerCar;
}

async function captureCarVisual(scene: CarVisualCaptureScene): Promise<Blob> {
  if (!worldView) throw new Error("The world renderer is unavailable for car visual capture.");
  const model = await ensurePlayerCarModel();
  return worldView.captureCarPng(scene, model);
}

async function captureOutdoor(scene: WorldOverviewCaptureScene | FieldOverviewCaptureScene): Promise<Blob> {
  if (!worldView) throw new Error("The world renderer is unavailable for outdoor capture.");
  return worldView.capturePng(scene);
}

async function captureQFactory(scene: QFactoryCaptureScene): Promise<Blob> {
  if (!overworldCatalogue) throw new Error("The overworld interaction catalogue is unavailable for Q's Factory capture.");
  if (!isDriving) await toggleDriving();
  const factory = overworldCatalogue.interactions.find((interaction) => interaction.areaIndex === 1 && interaction.localIndex === 0);
  if (!factory) throw new Error("The Peach Town Q's Factory interaction is unavailable.");
  const sourceX = factory.corners.reduce((sum, corner) => sum + corner[0], 0) / factory.corners.length;
  const sourceZ = factory.corners.reduce((sum, corner) => sum + corner[1], 0) / factory.corners.length;
  drivingGame?.controller.teleport(factory.fieldNumber, { x: 1600 - sourceX, y: 31, z: sourceZ }, 0);
  await startQFactoryInterior(factory);
  if (!qFactoryInteriorView) throw new Error("Q's Factory renderer did not initialise for deterministic capture.");
  return qFactoryInteriorView.capturePng(scene.size, scene.animationTimeMs);
}

function queueResidentModelLoad(
  manifest: ImportManifest,
  directory: FileSystemDirectoryHandle,
  simulation: BrowserWorldSimulation,
  generation: number,
): Promise<void> {
  const task = residentModelLoadChain.catch(() => undefined).then(() => loadResidentModels(manifest, directory, simulation, generation));
  residentModelLoadChain = task;
  return task;
}

async function loadResidentModels(
  manifest: ImportManifest,
  directory: FileSystemDirectoryHandle,
  simulation: BrowserWorldSimulation,
  generation: number,
): Promise<void> {
  const available = new Set(manifest.files.map((file) => file.path.toUpperCase()));
  const residents = [...simulation.residents].sort((a, b) => {
    const aPriority = a.state.fieldNumber === 223 ? 0 : 1;
    const bPriority = b.state.fieldNumber === 223 ? 0 : 1;
    return aPriority - bPriority || a.state.fieldNumber - b.state.fieldNumber || a.state.id.localeCompare(b.state.id);
  });
  const tireBytes = await readBytes(directory, "game/CARS/TIRE.BIN");
  const carBytesByBody = new Map<number, Uint8Array>();
  const { Q62CarModel: CarModelClass } = await import("./game/carView");
  let loaded = simulation.modelCount;
  for (const resident of residents) {
    if (generation !== residentModelLoadGeneration) return;
    if (simulation.hasModel(resident.state.id)) continue;
    const definition = resident.state.definition;
    const path = carAssetPath(definition.bodyId);
    if (!available.has(path.toUpperCase())) continue;
    let carBytes = carBytesByBody.get(definition.bodyId);
    if (!carBytes) {
      carBytes = await readBytes(directory, `game/${path}`);
      carBytesByBody.set(definition.bodyId, carBytes);
    }
    const model = new CarModelClass(carBytes, tireBytes, {
      name: `${definition.name} Q${definition.bodyId}`,
      primaryPaint: [definition.paint.primary.r, definition.paint.primary.g, definition.paint.primary.b],
      secondaryPaint: [definition.paint.secondary.r, definition.paint.secondary.g, definition.paint.secondary.b],
    });
    if (generation !== residentModelLoadGeneration) { model.dispose(); return; }
    simulation.attachModel(resident.state.id, model);
    loaded += 1;
    requiredElement<HTMLElement>("resident-count").textContent = `${loaded}/${residents.length}`;
    if ((loaded & 1) === 0) await nextFrame();
  }
  requiredElement<HTMLElement>("resident-count").textContent = loaded === residents.length ? String(loaded) : `${loaded}/${residents.length}`;
  console.info(`Persistent residents: ${residents.length} executable definitions, ${residents.filter((resident) => resident.state.speed > 0).length} moving routes, ${loaded} original car bodies available in this install.`);
}

function stopWorldSimulation(): void {
  residentModelLoadGeneration += 1;
  residentModelLoadChain = Promise.resolve();
  endQFactoryInterior();
  endResidentDialogue();
  worldSimulation?.stop();
  worldSimulation = undefined;
  overworldCatalogue = undefined;
  residentGreetings.clear();
  qFactoryDialogueEntity = undefined;
  playerDialogueState = undefined;
  playerEquipmentState = undefined;
  playerCommerceState = undefined;
  playerRaceState = undefined;
  recoveredProgressStore = undefined;
}

async function ensureWholeWorldCache(
  manifest: ImportManifest,
  onProgress: (completed: number, total: number) => void,
): Promise<ImportManifest> {
  const { compiledFieldCacheVersion } = await import("./formats/fieldGeometry");
  const existing = new Map(manifest.compiledFields.filter((field) => field.cacheVersion === compiledFieldCacheVersion).map((field) => [field.fieldNumber, field]));
  const collisions = new Map((manifest.collisionFields ?? []).map((field) => [field.fieldNumber, field]));
  const fields = [...manifest.fields].sort((a, b) => a.fieldNumber - b.fieldNumber);
  if (manifest.installStage !== "bootstrap" && !manifest.devPartialFields && fields.length !== 64) throw new Error(`Expected 64 cached FLDs; found ${fields.length}.`);
  if (fields.every((field) => existing.has(field.fieldNumber) && collisions.has(field.fieldNumber))) return manifest;

  const directory = await currentImportDirectory(manifest);
  const { compileFieldVertexColorMesh, serializeCompiledField } = await import("./formats/fieldGeometry");
  const { compileFieldCollision, serializeCompiledCollision } = await import("./formats/fieldCollision");
  let completed = fields.filter((field) => existing.has(field.fieldNumber) && collisions.has(field.fieldNumber)).length;
  onProgress(completed, fields.length);
  for (const field of fields) {
    if (existing.has(field.fieldNumber) && collisions.has(field.fieldNumber)) continue;
    const sourceBytes = await readBytes(directory, `game/${field.path}`);
    if (!existing.has(field.fieldNumber)) {
      const mesh = compileFieldVertexColorMesh(sourceBytes);
      const compiledPath = `compiled/field-${field.fieldNumber.toString().padStart(3, "0")}.mesh`;
      await writeBytes(directory, compiledPath, serializeCompiledField(mesh));
      existing.set(field.fieldNumber, {
        fieldNumber: field.fieldNumber,
        path: compiledPath,
        cacheVersion: compiledFieldCacheVersion,
        vertexCount: mesh.vertexCount,
        triangleCount: mesh.triangleCount,
        primitiveCount: mesh.primitiveCount,
      });
    }
    if (!collisions.has(field.fieldNumber)) {
      const collision = compileFieldCollision(sourceBytes);
      const collisionPath = `compiled/collision-${field.fieldNumber.toString().padStart(3, "0")}.bin`;
      await writeBytes(directory, collisionPath, serializeCompiledCollision(collision));
      collisions.set(field.fieldNumber, {
        fieldNumber: field.fieldNumber,
        path: collisionPath,
        triangleCount: collision.triangleCount,
      });
    }
    completed += 1;
    onProgress(completed, fields.length);
    await nextFrame();
  }

  const upgraded: ImportManifest = {
    ...manifest,
    compiledFields: [...existing.values()].sort((a, b) => a.fieldNumber - b.fieldNumber),
    collisionFields: [...collisions.values()].sort((a, b) => a.fieldNumber - b.fieldNumber),
  };
  await writeJson(directory, "manifest.json", upgraded);
  return upgraded;
}

async function loadDevelopmentParts(directory: FileSystemDirectoryHandle): Promise<PartLoadout> {
  try {
    const loadout = readDevelopmentPartsSave(await readJson<unknown>(directory, "save/development-parts.json"));
    console.info(`Development parts loadout restored: ${partCategoryOrder.filter((category) => loadout[category] !== defaultPartLoadout[category]).length} non-standard selections.`);
    return loadout;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return defaultPartLoadout;
    console.warn("The saved development parts loadout was invalid or unreadable; standard parts will be used.", error);
    return defaultPartLoadout;
  }
}

function queueRecoveredProgressSave(): void {
  recoveredProgressStore?.queueSave();
}

function selectedPartIndex(loadout: PartLoadout, category: PartCategory): number {
  return Math.max(0, developmentPartCatalogue[category].findIndex((definition) => definition.id === loadout[category]));
}

async function readOptionalInstalledWheelBytes(directory: FileSystemDirectoryHandle): Promise<Uint8Array | undefined> {
  const cached = activeManifest?.files.some((file) => file.path.toUpperCase() === "CARS/WHEEL.BIN");
  if (cached === false) return undefined;
  try {
    return await readBytes(directory, "game/CARS/WHEEL.BIN");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
    throw error;
  }
}

function currentPlayerCarOptions(wheelBytes?: Uint8Array): {
  primaryPaint?: readonly [number, number, number];
  secondaryPaint?: readonly [number, number, number];
  wheelBytes?: Uint8Array;
  nativeTyreSelector?: number;
  nativeWheelSelector?: number;
  wheelColor?: readonly [number, number, number];
  wheelColorIndex?: number;
} {
  const word = playerEquipmentState?.paintWord ?? browserCompatibilityPaintWord;
  const paints = decodeNativeBodyPaint(word);
  return {
    primaryPaint: paints.primary,
    secondaryPaint: paints.secondary,
    ...(wheelBytes ? { wheelBytes } : {}),
    nativeTyreSelector: playerEquipmentState?.selectedItem(0, 1) ?? 0,
    nativeWheelSelector: playerEquipmentState?.selectedItem(0, 7) ?? 0,
    wheelColor: nativeWheelPaintColor(word),
    wheelColorIndex: nativeWheelPaintIndex(word),
  };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function showEmpty(): void {
  stopPeachRace();
  stopDrivingSession();
  stopWorldSimulation();
  hidePlayUi();
  importCard.hidden = true;
  errorCard.hidden = true;
  viewerHost.hidden = true;
  emptyState.hidden = false;
  fileInput.value = "";
}

function showImport(): void {
  stopPeachRace();
  stopDrivingSession();
  stopWorldSimulation();
  hidePlayUi();
  emptyState.hidden = true;
  errorCard.hidden = true;
  viewerHost.hidden = true;
  importCard.hidden = false;
  updateProgress("prepare", "Opening game image locally", 0, 1);
}

/** Leaves the world for the landing, import or error card. */
function hidePlayUi(): void {
  closePauseMenu();
  setDebugOverlayVisible(false);
  playUiActive = false;
  installedPanel.hidden = true;
  gameHud.hidden = true;
}

function updateProgress(phase: string, detail: string, completed: number, total: number): void {
  importPhase.textContent = phaseLabel(phase);
  importDetail.textContent = detail;
  const ratio = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  progressBar.style.width = `${(ratio * 100).toFixed(1)}%`;
  progressLabel.textContent = total > 1 ? `${formatBytes(completed)} / ${formatBytes(total)}` : "";
}

function showError(title: string, error: unknown): void {
  showImportProblem({ title, detail: error instanceof Error ? error.message : String(error), hint: "" });
}

function showImportProblem(problem: ImportProblem): void {
  importCard.hidden = true;
  hidePlayUi();
  viewerHost.hidden = true;
  emptyState.hidden = true;
  errorCard.hidden = false;
  requiredElement<HTMLElement>("error-title").textContent = problem.title;
  errorDetail.textContent = problem.detail;
  const hint = requiredElement<HTMLElement>("error-hint");
  hint.textContent = problem.hint;
  hint.hidden = problem.hint.length === 0;
}

/** Rejects an unusable selection before starting the long local import. */
function beginImport(files: File[]): void {
  const selection = classifyImportSelection(files.map((file) => ({ name: file.name, size: file.size })));
  if (selection.kind === "rejected") {
    showImportProblem(selection.problem);
    return;
  }
  void importController.start(files);
}

function phaseLabel(phase: string): string {
  return ({
    prepare: "Preparing local import",
    archive: "Opening archive",
    validate: "Validating PAL game disc",
    cache: "Installing game data locally",
    compile: "Compiling Three.js geometry",
    complete: "Local install complete",
  } as Record<string, string>)[phase] ?? phase;
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KiB`;
  return `${value} B`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
