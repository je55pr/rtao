import { carAssetPath } from "./formats/carPath";
import { DeferredObjectUrls } from "./core/deferredObjectUrls";
import {
  compileFieldVertexColorMesh,
  compiledFieldCacheVersion,
  deserializeCompiledField,
  serializeCompiledField,
} from "./formats/fieldGeometry";
import { compileFieldCollision } from "./formats/fieldCollision";
import { readCollisionChunkDirectory, readFieldHeader, readRenderChunkDirectory } from "./formats/field";
import { expectedEuropeanExecutable } from "./formats/gameIdentity";
import { Elf32AddressSpace } from "./formats/elf32";
import { DialogueFlow, DialogueRuntimeState, inspectDialogueEntity, readDialogueEntityAtIndex, type DialogueEntity } from "./formats/dialogue";
import { readFixedInteractionAtIndex, readOverworldCatalogue, type FixedInteractionDefinition } from "./formats/overworld";
import { nativeRaceStartSeed, ordinaryRaceEntrants, readRaceCatalogue, readRaceFinishGateSets, readRaceNavigationCourses, readRaceStartAnchors } from "./formats/raceCatalogue";
import { decodeSkyTextureSet } from "./formats/skyTexture";
import { readShopInteriorBackdrop, shopInteriorPackagePath, shopInteriorSlotCount, shopInteriorSlotSize } from "./formats/shopInterior";
import { captureSceneById, type CaptureScene, type CarVisualCaptureScene, type FieldOverviewCaptureScene, type WorldOverviewCaptureScene } from "./game/captureScenes";
import { Q62CarModel } from "./game/carView";
import { RaceCourseGridSampler } from "./game/raceCourseGrid";
import { readOrdinaryRaceSpeedProfiles, stepOrdinaryRaceAi } from "./game/raceAi";
import { browserCompatibilityPaintWord, decodeNativeBodyPaint, nativeWheelPaintColor, nativeWheelPaintIndex } from "./game/paintShop";
import { aggregatePartsAppearance, applyKnownNativeEquipmentSelectors, defaultPartLoadout } from "./game/parts";
import { applyRecoveredDialogueHostAction } from "./game/dialogueProgress";
import { fixedInteriorStartSlot } from "./game/interiorFlow";
import { QFactoryInteriorView, ShopInteriorRoomView } from "./game/interiorView";
import { WorldView } from "./game/worldView";
import { openDirectImportSource } from "./importer/directSource";

declare const __RTA_DEV_FIXTURE_COMPILER_FINGERPRINT__: string;

import type { SandboxCaptureInputFile, SandboxCarVisualState, SandboxCaptureRequest, SandboxPreparedWorldInfo, SandboxFieldSurfaceSummary, SandboxDevFixtureSourceInfo, SandboxDevFixtureAssetInfo, SandboxDevFixtureManifest, SandboxCaptureResult, SandboxShopInteriorDialogueInfo, SandboxShopInteriorDialogueState, SandboxShopInteriorCensusEntry, SandboxShopInteriorDialogueEntityTrace, SandboxRaceGridCapture, SandboxRaceCatalogueSummary, SandboxRaceCourseSummary } from "./sandbox/api";
import { blobDataUrl, cloneBytes, ensureHost, sha256Hex } from "./sandbox/browserHelpers";
import { readSupportedIdentity, type DirectImportSource } from "./sandbox/source";
import { captureRaceGridFromBrowserFiles, inspectRaceCatalogue, inspectRaceCourse } from "./sandbox/raceTools";
interface PreparedOutdoorWorld extends SandboxPreparedWorldInfo {
  readonly worldView: WorldView;
}

interface PreparedCarVisualWorld extends SandboxPreparedWorldInfo {
  readonly worldView: WorldView;
  readonly fieldNumber: number;
  readonly carBytes: Uint8Array;
  readonly tireBytes: Uint8Array;
  readonly wheelBytes: Uint8Array;
  car: Q62CarModel;
}

interface PreparedDevFixtureSource extends SandboxDevFixtureSourceInfo {
  readonly source: DirectImportSource;
}

let preparedOutdoor: PreparedOutdoorWorld | undefined;
let preparedCarVisual: PreparedCarVisualWorld | undefined;
let preparedDevFixtureSource: PreparedDevFixtureSource | undefined;
const devFixtureDownloadUrls = new DeferredObjectUrls();

function makeBrowserFile(input: SandboxCaptureInputFile): File {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  const exact = cloneBytes(bytes);
  return new File([exact], input.name, { type: input.type ?? guessMimeType(input.name) });
}

function guessMimeType(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "cue": return "text/plain";
    case "iso": return "application/octet-stream";
    case "bin": return "application/octet-stream";
    case "zip": return "application/zip";
    default: return "application/octet-stream";
  }
}

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (uuid) return uuid();
  return `sandbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function outdoorScene(sceneId: string): WorldOverviewCaptureScene | FieldOverviewCaptureScene {
  const scene = captureSceneById(sceneId);
  if (!scene) throw new Error(`Unknown deterministic capture '${sceneId}'.`);
  if (scene.kind === "qfactory") throw new Error(`'${sceneId}' is an interior capture, not an outdoor capture.`);
  if (scene.kind === "car-visual") throw new Error(`'${sceneId}' requires the live/player Q62 model and is not a scenery-only outdoor capture.`);
  return scene;
}

function carVisualScene(sceneId: string): CarVisualCaptureScene {
  const scene = captureSceneById(sceneId);
  if (!scene) throw new Error(`Unknown deterministic capture '${sceneId}'.`);
  if (scene.kind !== "car-visual") throw new Error(`'${sceneId}' is not a car visual capture.`);
  return scene;
}

function carVisualPaintOptions(state: SandboxCarVisualState): {
  primaryPaint?: readonly [number, number, number];
  secondaryPaint?: readonly [number, number, number];
  wheelColor: readonly [number, number, number];
  wheelColorIndex: number;
} {
  const word = state.paintWord ?? browserCompatibilityPaintWord;
  const paints = decodeNativeBodyPaint(word);
  return { primaryPaint: paints.primary, secondaryPaint: paints.secondary, wheelColor: nativeWheelPaintColor(word), wheelColorIndex: nativeWheelPaintIndex(word) };
}

function createCarVisualModel(carBytes: Uint8Array, tireBytes: Uint8Array, wheelBytes: Uint8Array, state: SandboxCarVisualState): Q62CarModel {
  const nativeTyreSelector = state.equipmentSelectors?.[1] ?? 0;
  const nativeWheelSelector = state.equipmentSelectors?.[7] ?? 0;
  const car = new Q62CarModel(carBytes, tireBytes, { name: "Q62 deterministic car visual", wheelBytes, nativeTyreSelector, nativeWheelSelector, ...carVisualPaintOptions(state) });
  const loadout = applyKnownNativeEquipmentSelectors(defaultPartLoadout, state.equipmentSelectors ?? []);
  car.setPartsAppearance(aggregatePartsAppearance(loadout));
  return car;
}

async function allStandardFieldNumbers(disc: Awaited<ReturnType<typeof openDirectImportSource>>["disc"]): Promise<number[]> {
  const entries = await disc.listDirectory("FLD");
  const numbers = entries
    .filter((entry) => !entry.directory)
    .map((entry) => /^(\d{3})\.BIN$/i.exec(entry.normalizedName)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number.parseInt(value, 10))
    .sort((a, b) => a - b);
  if (numbers.length !== 64) throw new Error(`Expected 64 standard FLD sectors; found ${numbers.length}.`);
  return numbers;
}

async function captureCarVisualBlobFromBrowserFiles(
  sceneId: string,
  files: readonly File[],
  state: SandboxCarVisualState = {},
): Promise<{ blob: Blob; scene: CarVisualCaptureScene; triangleCount: number; sourceKind: string; bootExecutable: string }> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const scene = carVisualScene(sceneId);
  const source = await openDirectImportSource([...files]);
  let worldView: WorldView | undefined;
  let car: Q62CarModel | undefined;
  try {
    const identity = await readSupportedIdentity(source);
    const host = ensureHost(scene.size, "rta-sandbox-car-visual-host");
    worldView = new WorldView(host);
    worldView.startWorld();
    worldView.setSky(decodeSkyTextureSet(await source.disc.readFile("SYS/SORA.GSL")));
    const fieldPath = `FLD/${scene.fieldNumber.toString().padStart(3, "0")}.BIN`;
    const mesh = compileFieldVertexColorMesh(await source.disc.readFile(fieldPath));
    worldView.addCompiledFieldMesh(scene.fieldNumber, mesh);
    worldView.finishWorld();
    const [carBytes, tireBytes, wheelBytes] = await Promise.all([
      source.disc.readFile("CAR2/Q62.BIN"),
      source.disc.readFile("CARS/TIRE.BIN"),
      source.disc.readFile("CARS/WHEEL.BIN"),
    ]);
    car = createCarVisualModel(carBytes, tireBytes, wheelBytes, state);
    const blob = await worldView.captureCarPng(scene, car);
    return { blob, scene, triangleCount: mesh.triangleCount, sourceKind: source.kind, bootExecutable: identity.bootExecutable };
  } finally {
    car?.dispose();
    worldView?.dispose();
    document.getElementById("rta-sandbox-car-visual-host")?.remove();
    await source.cleanup();
  }
}

async function captureCarVisualFromBrowserFiles(
  sceneId: string,
  files: readonly File[],
  state: SandboxCarVisualState = {},
): Promise<SandboxCaptureResult> {
  const capture = await captureCarVisualBlobFromBrowserFiles(sceneId, files, state);
  const pngBytes = new Uint8Array(await capture.blob.arrayBuffer());
  return {
    sceneId: capture.scene.id,
    label: capture.scene.label,
    width: capture.scene.size.width,
    height: capture.scene.size.height,
    sha256: await sha256Hex(pngBytes),
    pngBytes: [...pngBytes],
    fieldNumbers: [capture.scene.fieldNumber],
    triangleCount: capture.triangleCount,
    sourceKind: capture.sourceKind,
    bootExecutable: capture.bootExecutable,
  };
}

async function captureCarVisualDataUrlFromBrowserFiles(
  sceneId: string,
  files: readonly File[],
  state: SandboxCarVisualState = {},
): Promise<string> {
  const capture = await captureCarVisualBlobFromBrowserFiles(sceneId, files, state);
  return await blobDataUrl(capture.blob);
}

function disposePreparedCarVisual(): void {
  const prepared = preparedCarVisual;
  preparedCarVisual = undefined;
  prepared?.car.dispose();
  prepared?.worldView.dispose();
  document.getElementById("rta-sandbox-car-visual-host")?.remove();
}

async function prepareCarVisualFromBrowserFiles(
  sceneId: string,
  files: readonly File[],
  state: SandboxCarVisualState = {},
): Promise<SandboxPreparedWorldInfo> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  disposePreparedCarVisual();
  const scene = carVisualScene(sceneId);
  const source = await openDirectImportSource([...files]);
  let worldView: WorldView | undefined;
  let car: Q62CarModel | undefined;
  try {
    const identity = await readSupportedIdentity(source);
    const host = ensureHost(scene.size, "rta-sandbox-car-visual-host");
    worldView = new WorldView(host);
    worldView.startWorld();
    worldView.setSky(decodeSkyTextureSet(await source.disc.readFile("SYS/SORA.GSL")));
    const fieldPath = `FLD/${scene.fieldNumber.toString().padStart(3, "0")}.BIN`;
    const mesh = compileFieldVertexColorMesh(await source.disc.readFile(fieldPath));
    worldView.addCompiledFieldMesh(scene.fieldNumber, mesh);
    worldView.finishWorld();
    const [carBytes, tireBytes, wheelBytes] = await Promise.all([
      source.disc.readFile("CAR2/Q62.BIN"),
      source.disc.readFile("CARS/TIRE.BIN"),
      source.disc.readFile("CARS/WHEEL.BIN"),
    ]);
    car = createCarVisualModel(carBytes, tireBytes, wheelBytes, state);
    preparedCarVisual = {
      worldView,
      fieldNumber: scene.fieldNumber,
      carBytes,
      tireBytes,
      wheelBytes,
      car,
      fieldNumbers: [scene.fieldNumber],
      triangleCount: mesh.triangleCount,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
    worldView = undefined;
    car = undefined;
    return {
      fieldNumbers: [scene.fieldNumber],
      triangleCount: mesh.triangleCount,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
  } finally {
    car?.dispose();
    worldView?.dispose();
    if (worldView) document.getElementById("rta-sandbox-car-visual-host")?.remove();
    await source.cleanup();
  }
}

async function capturePreparedCarVisualDataUrl(sceneId: string, state?: SandboxCarVisualState): Promise<string> {
  const prepared = preparedCarVisual;
  if (!prepared) throw new Error("No car visual capture world is prepared.");
  const scene = carVisualScene(sceneId);
  if (scene.fieldNumber !== prepared.fieldNumber) {
    throw new Error(`Prepared car visual contains FLD/${prepared.fieldNumber.toString().padStart(3, "0")}; '${sceneId}' requires FLD/${scene.fieldNumber.toString().padStart(3, "0")}.`);
  }
  if (state) {
    prepared.car.dispose();
    prepared.car = createCarVisualModel(prepared.carBytes, prepared.tireBytes, prepared.wheelBytes, state);
  }
  const blob = await prepared.worldView.captureCarPng(scene, prepared.car);
  return await blobDataUrl(blob);
}

async function prepareOutdoorFromBrowserFiles(
  files: readonly File[],
  loadFullWorld = true,
  requestedFieldNumbers: readonly number[] = [],
): Promise<SandboxPreparedWorldInfo> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  disposePreparedOutdoor();
  const source = await openDirectImportSource([...files]);
  let worldView: WorldView | undefined;
  try {
    const identity = await readSupportedIdentity(source);
    const fieldNumbers = loadFullWorld
      ? await allStandardFieldNumbers(source.disc)
      : [...new Set(requestedFieldNumbers)].sort((a, b) => a - b);
    if (fieldNumbers.length === 0) throw new Error("No outdoor fields were requested for the prepared capture world.");

    const host = ensureHost({ width: 1280, height: 960 });
    worldView = new WorldView(host);
    worldView.startWorld();
    const skyBytes = await source.disc.readFile("SYS/SORA.GSL");
    worldView.setSky(decodeSkyTextureSet(skyBytes));
    let triangleCount = 0;
    for (const fieldNumber of fieldNumbers) {
      const path = `FLD/${fieldNumber.toString().padStart(3, "0")}.BIN`;
      const bytes = await source.disc.readFile(path);
      const mesh = compileFieldVertexColorMesh(bytes);
      triangleCount += mesh.triangleCount;
      worldView.addCompiledFieldMesh(fieldNumber, mesh);
    }
    worldView.finishWorld();
    preparedOutdoor = {
      worldView,
      fieldNumbers,
      triangleCount,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
    worldView = undefined;
    return {
      fieldNumbers,
      triangleCount,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
  } finally {
    worldView?.dispose();
    if (worldView) document.getElementById("rta-sandbox-capture-host")?.remove();
    await source.cleanup();
  }
}

async function prepareOutdoorFromFixtureBrowserFiles(files: readonly File[]): Promise<SandboxPreparedWorldInfo> {
  disposePreparedOutdoor();
  const manifestFile = files.find((file) => file.name.toLowerCase() === "fixture.json");
  if (!manifestFile) throw new Error("Derived capture fixture is missing fixture.json.");
  const manifest = JSON.parse(await manifestFile.text()) as Partial<SandboxDevFixtureManifest>;
  if (manifest.schemaVersion !== 1) throw new Error(`Derived capture fixture has unsupported schema ${String(manifest.schemaVersion)}.`);
  if (manifest.compiledFieldCacheVersion !== compiledFieldCacheVersion) {
    throw new Error(`Derived capture fixture uses field cache v${String(manifest.compiledFieldCacheVersion)}; this bundle requires v${compiledFieldCacheVersion}.`);
  }
  if (manifest.compilerFingerprint !== __RTA_DEV_FIXTURE_COMPILER_FINGERPRINT__) {
    throw new Error("Derived capture fixture is stale because the field compiler source has changed.");
  }
  if (manifest.bootExecutable !== expectedEuropeanExecutable) {
    throw new Error(`Derived capture fixture was not built from PAL ${expectedEuropeanExecutable}.`);
  }
  if (!Array.isArray(manifest.fieldNumbers) || !manifest.fieldNumbers.every(Number.isInteger)) {
    throw new Error("Derived capture fixture has an invalid field list.");
  }
  const manifestFields = new Set(manifest.fieldNumbers);
  const skyFile = files.find((file) => file.name.toUpperCase() === "SORA.GSL");
  if (!skyFile) throw new Error("Derived capture fixture is missing SORA.GSL.");

  const fieldFiles = files
    .map((file) => ({ file, match: /^field-(\d{3})\.mesh$/i.exec(file.name) }))
    .filter((entry): entry is { file: File; match: RegExpExecArray } => entry.match !== null)
    .map((entry) => ({ file: entry.file, fieldNumber: Number.parseInt(entry.match[1]!, 10) }))
    .sort((a, b) => a.fieldNumber - b.fieldNumber);
  if (fieldFiles.length === 0) throw new Error("Derived capture fixture contains no field-###.mesh files.");

  const seenFields = new Set<number>();
  for (const entry of fieldFiles) {
    if (seenFields.has(entry.fieldNumber)) throw new Error(`Derived capture fixture contains duplicate FLD/${entry.fieldNumber.toString().padStart(3, "0")}.`);
    if (!manifestFields.has(entry.fieldNumber)) throw new Error(`FLD/${entry.fieldNumber.toString().padStart(3, "0")} is not listed in fixture.json.`);
    seenFields.add(entry.fieldNumber);
  }

  const host = ensureHost({ width: 1280, height: 960 });
  let worldView: WorldView | undefined = new WorldView(host);
  try {
    worldView.startWorld();
    worldView.setSky(decodeSkyTextureSet(new Uint8Array(await skyFile.arrayBuffer())));
    let triangleCount = 0;
    for (const entry of fieldFiles) {
      const mesh = deserializeCompiledField(new Uint8Array(await entry.file.arrayBuffer()));
      triangleCount += mesh.triangleCount;
      worldView.addCompiledFieldMesh(entry.fieldNumber, mesh);
    }
    worldView.finishWorld();
    const fieldNumbers = fieldFiles.map((entry) => entry.fieldNumber);
    preparedOutdoor = {
      worldView,
      fieldNumbers,
      triangleCount,
      sourceKind: "derived-dev-fixture",
      bootExecutable: expectedEuropeanExecutable,
    };
    worldView = undefined;
    return {
      fieldNumbers,
      triangleCount,
      sourceKind: "derived-dev-fixture",
      bootExecutable: expectedEuropeanExecutable,
    };
  } finally {
    worldView?.dispose();
    if (worldView) document.getElementById("rta-sandbox-capture-host")?.remove();
  }
}

async function prepareDevFixtureSourceFromBrowserFiles(files: readonly File[]): Promise<SandboxDevFixtureSourceInfo> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  await disposePreparedDevFixtureSource();
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const fieldNumbers = await allStandardFieldNumbers(source.disc);
    preparedDevFixtureSource = {
      source,
      fieldNumbers,
      compiledFieldCacheVersion,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
    return {
      fieldNumbers,
      compiledFieldCacheVersion,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
  } catch (error) {
    await source.cleanup();
    throw error;
  }
}

function devFixtureManifest(fieldNumbers: readonly number[]): SandboxDevFixtureManifest {
  const prepared = preparedDevFixtureSource;
  if (!prepared) throw new Error("No PAL fixture source is prepared.");
  const uniqueFields = [...new Set(fieldNumbers)].sort((a, b) => a - b);
  if (uniqueFields.length === 0) throw new Error("A development fixture must contain at least one field.");
  for (const fieldNumber of uniqueFields) {
    if (!Number.isInteger(fieldNumber) || !prepared.fieldNumbers.includes(fieldNumber)) {
      throw new Error(`FLD/${String(fieldNumber).padStart(3, "0")} is not a standard field in the prepared PAL source.`);
    }
  }
  return {
    schemaVersion: 1,
    compiledFieldCacheVersion,
    compilerFingerprint: __RTA_DEV_FIXTURE_COMPILER_FINGERPRINT__,
    bootExecutable: prepared.bootExecutable,
    fieldNumbers: uniqueFields,
  };
}

async function downloadPreparedDevFixtureSky(): Promise<SandboxDevFixtureAssetInfo> {
  const prepared = preparedDevFixtureSource;
  if (!prepared) throw new Error("No PAL fixture source is prepared.");
  const bytes = await prepared.source.disc.readFile("SYS/SORA.GSL");
  return downloadFixtureBytes("SORA.GSL", bytes);
}

async function downloadPreparedDevFixtureField(fieldNumber: number): Promise<SandboxDevFixtureAssetInfo> {
  const prepared = preparedDevFixtureSource;
  if (!prepared) throw new Error("No PAL fixture source is prepared.");
  if (!Number.isInteger(fieldNumber) || !prepared.fieldNumbers.includes(fieldNumber)) {
    throw new Error(`FLD/${String(fieldNumber).padStart(3, "0")} is not a standard field in the prepared PAL source.`);
  }
  const path = `FLD/${fieldNumber.toString().padStart(3, "0")}.BIN`;
  const sourceBytes = await prepared.source.disc.readFile(path);
  const compiled = serializeCompiledField(compileFieldVertexColorMesh(sourceBytes));
  return downloadFixtureBytes(`field-${fieldNumber.toString().padStart(3, "0")}.mesh`, compiled);
}

async function downloadFixtureBytes(filename: string, bytes: Uint8Array): Promise<SandboxDevFixtureAssetInfo> {
  const blob = new Blob([cloneBytes(bytes)], { type: "application/octet-stream" });
  const url = devFixtureDownloadUrls.create(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
  }
  return { filename, byteLength: bytes.byteLength };
}

async function disposePreparedDevFixtureSource(): Promise<void> {
  const prepared = preparedDevFixtureSource;
  preparedDevFixtureSource = undefined;
  try {
    await prepared?.source.cleanup();
  } finally {
    // Playwright's download.save_as() can still be consuming a multi-megabyte
    // Blob after the anchor click. Revoke only when the fixture source session
    // is explicitly finished, never on the next browser task.
    devFixtureDownloadUrls.releaseAll();
  }
}

async function capturePreparedOutdoor(sceneId: string): Promise<SandboxCaptureResult> {
  const prepared = preparedOutdoor;
  if (!prepared) throw new Error("No outdoor capture world is prepared.");
  const scene = outdoorScene(sceneId);
  if (scene.kind === "field-overview" && !prepared.fieldNumbers.includes(scene.fieldNumber)) {
    throw new Error(`FLD/${scene.fieldNumber.toString().padStart(3, "0")} is not loaded in the prepared capture world.`);
  }
  const pngBlob = await prepared.worldView.capturePng(scene);
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  return {
    sceneId: scene.id,
    label: scene.label,
    width: scene.size.width,
    height: scene.size.height,
    sha256: await sha256Hex(pngBytes),
    pngBytes: [...pngBytes],
    fieldNumbers: prepared.fieldNumbers,
    triangleCount: prepared.triangleCount,
    sourceKind: prepared.sourceKind,
    bootExecutable: prepared.bootExecutable,
  };
}

async function capturePreparedOutdoorDataUrl(sceneId: string): Promise<string> {
  const prepared = preparedOutdoor;
  if (!prepared) throw new Error("No outdoor capture world is prepared.");
  const scene = outdoorScene(sceneId);
  if (scene.kind === "field-overview" && !prepared.fieldNumbers.includes(scene.fieldNumber)) {
    throw new Error(`FLD/${scene.fieldNumber.toString().padStart(3, "0")} is not loaded in the prepared capture world.`);
  }
  const pngBlob = await prepared.worldView.capturePng(scene);
  return await blobDataUrl(pngBlob);
}

function disposePreparedOutdoor(): void {
  preparedOutdoor?.worldView.dispose();
  preparedOutdoor = undefined;
  document.getElementById("rta-sandbox-capture-host")?.remove();
}

async function captureShopPackageContactSheetDataUrl(areaIndex: number, files: readonly File[]): Promise<string> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const catalogue = readOverworldCatalogue(executableBytes);
    const interactions = new Map(
      catalogue.interactions
        .filter((interaction) => interaction.areaIndex === areaIndex)
        .map((interaction) => [interaction.localIndex, interaction.name] as const),
    );
    const packagePath = shopInteriorPackagePath(areaIndex);
    const shopBytes = await source.disc.readFile(packagePath);
    const slotCount = shopInteriorSlotCount(shopBytes);
    if (slotCount === 0) throw new Error(`${packagePath} contains no fixed SHOP slots.`);

    const columns = Math.min(4, slotCount);
    const rows = Math.ceil(slotCount / columns);
    const thumbWidth = 256;
    const thumbHeight = Math.round(thumbWidth * 384 / 640);
    const labelHeight = 28;
    const headerHeight = 40;
    const gap = 8;
    const canvas = document.createElement("canvas");
    canvas.width = columns * thumbWidth + (columns + 1) * gap;
    canvas.height = headerHeight + rows * (thumbHeight + labelHeight) + (rows + 1) * gap;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D context is unavailable for SHOP contact sheet capture.");
    context.fillStyle = "#171917";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "16px sans-serif";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.fillText(`${packagePath} · area ${areaIndex} · ${slotCount} authored fixed slots`, gap, headerHeight / 2);

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 640;
    sourceCanvas.height = 384;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) throw new Error("Canvas 2D context is unavailable for SHOP atlas capture.");
    const image = sourceContext.createImageData(640, 384);

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const backdrop = readShopInteriorBackdrop(shopBytes, slotIndex);
      image.data.set(backdrop.rgba);
      sourceContext.putImageData(image, 0, 0);
      const column = slotIndex % columns;
      const row = Math.floor(slotIndex / columns);
      const x = gap + column * thumbWidth;
      const y = headerHeight + gap + row * (thumbHeight + labelHeight);
      context.drawImage(sourceCanvas, x, y, thumbWidth, thumbHeight);
      context.fillStyle = "rgba(0, 0, 0, 0.82)";
      context.fillRect(x, y + thumbHeight, thumbWidth, labelHeight);
      context.fillStyle = "#ffffff";
      const interactionName = interactions.get(slotIndex) ?? "unmapped fixed slot";
      const label = `${slotIndex.toString().padStart(2, "0")} · ${interactionName}`;
      context.fillText(label.length > 31 ? `${label.slice(0, 30)}…` : label, x + 8, y + thumbHeight + labelHeight / 2);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("SHOP contact sheet did not encode as PNG.")), "image/png");
    });
    return await blobDataUrl(blob);
  } finally {
    await source.cleanup();
  }
}

async function readShopInteriorSlotDataUrl(areaIndex: number, slotIndex: number, files: readonly File[]): Promise<string> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  try {
    const packagePath = shopInteriorPackagePath(areaIndex);
    const shopBytes = await source.disc.readFile(packagePath);
    const slotCount = shopInteriorSlotCount(shopBytes);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
      throw new RangeError(`${packagePath} slot ${slotIndex} lies outside its ${slotCount} authored fixed slots.`);
    }
    const start = slotIndex * shopInteriorSlotSize;
    return await blobDataUrl(new Blob([cloneBytes(shopBytes.slice(start, start + shopInteriorSlotSize))], { type: "application/octet-stream" }));
  } finally {
    await source.cleanup();
  }
}

function sandboxFixedInteraction(executableBytes: Uint8Array, areaIndex: number, slotIndex: number): FixedInteractionDefinition | undefined {
  return readOverworldCatalogue(executableBytes).interactions.find(
    (candidate) => candidate.areaIndex === areaIndex && candidate.localIndex === slotIndex,
  ) ?? readFixedInteractionAtIndex(executableBytes, areaIndex, slotIndex);
}

async function captureShopInteriorRoomDataUrl(areaIndex: number, slotIndex: number, files: readonly File[]): Promise<string> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  let interiorView: ShopInteriorRoomView | undefined;
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const interaction = sandboxFixedInteraction(executableBytes, areaIndex, slotIndex);
    if (!interaction) throw new Error(`Area ${areaIndex} slot ${slotIndex} has no executable-defined fixed interaction.`);
    const packagePath = shopInteriorPackagePath(areaIndex);
    const [shopBytes, tireBytes, wheelBytes, playerBytes, staffBytes] = await Promise.all([
      source.disc.readFile(packagePath),
      source.disc.readFile("CARS/TIRE.BIN"),
      source.disc.readFile("CARS/WHEEL.BIN"),
      source.disc.readFile("CAR2/Q62.BIN"),
      source.disc.readFile(carAssetPath(interaction.bodyId)),
    ]);
    const slotCount = shopInteriorSlotCount(shopBytes);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
      throw new RangeError(`${packagePath} slot ${slotIndex} lies outside its ${slotCount} authored fixed slots.`);
    }
    const backdrop = readShopInteriorBackdrop(shopBytes, slotIndex);
    const playerModel = new Q62CarModel(playerBytes, tireBytes, { name: "Q62 interior player", wheelBytes, wheelColor: nativeWheelPaintColor(browserCompatibilityPaintWord), wheelColorIndex: nativeWheelPaintIndex(browserCompatibilityPaintWord) });
    const staffModel = new Q62CarModel(staffBytes, tireBytes, {
      name: `${interaction.name} Q${interaction.bodyId}`,
      primaryPaint: [interaction.paint.primary.r, interaction.paint.primary.g, interaction.paint.primary.b],
      secondaryPaint: [interaction.paint.secondary.r, interaction.paint.secondary.g, interaction.paint.secondary.b],
    });
    const host = ensureHost({ width: 1280, height: 960 }, "rta-sandbox-shop-room-host");
    interiorView = new ShopInteriorRoomView(host, backdrop, `${packagePath} slot ${slotIndex}`, {
      playerCar: playerModel,
      staffCar: staffModel,
    });
    return await blobDataUrl(await interiorView.capturePng({ width: 1280, height: 960 }));
  } finally {
    interiorView?.dispose();
    document.getElementById("rta-sandbox-shop-room-host")?.remove();
    await source.cleanup();
  }
}

async function inspectShopInteriorDialogue(
  areaIndex: number,
  slotIndex: number,
  files: readonly File[],
  choicePath: readonly number[] = [],
  initialState: SandboxShopInteriorDialogueState = {},
): Promise<SandboxShopInteriorDialogueInfo> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const interaction = sandboxFixedInteraction(executableBytes, areaIndex, slotIndex);
    if (!interaction) throw new Error(`Area ${areaIndex} slot ${slotIndex} has no executable-defined fixed interaction.`);
    const entity = readDialogueEntityAtIndex(executableBytes, areaIndex, slotIndex);
    const state = new DialogueRuntimeState();
    state.currentAreaIndex = areaIndex;
    initialState.indexedFlags?.forEach(([namespace, index]) => state.setIndexedFlag(namespace, index));
    initialState.stamps?.forEach((stampId) => state.addStamp(stampId));
    initialState.quickPicPhotos?.forEach((photoNumber) => state.addQuickPicPhoto(photoNumber));
    initialState.metFixedInteractions?.forEach(([metAreaIndex, metLocalIndex]) => state.markFixedInteractionMet(metAreaIndex, metLocalIndex));
    const flow = new DialogueFlow(entity, state, initialState.startSlot ?? fixedInteriorStartSlot(entity));
    choicePath.forEach((choiceIndex, step) => {
      if (!flow.currentChoices[choiceIndex]) {
        throw new Error(`${entity.name} choice path step ${step} requests unavailable choice ${choiceIndex} at slot ${flow.currentSlot}.`);
      }
      flow.choose(choiceIndex);
    });
    const external = flow.currentExternalAction;
    if (external && initialState.applyExternalAction) applyRecoveredDialogueHostAction(state, external);
    const dependencies = dialogueDependencies(entity);
    return {
      areaIndex,
      slotIndex,
      interactionName: interaction.name,
      entityName: entity.name,
      entityIndex: entity.entityIndex,
      currentSlot: flow.currentSlot,
      pages: flow.currentVariant?.pages ?? [],
      choices: flow.currentChoices,
      externalAction: external ? { opcode: external.opcode, operands: [...external.operands] } : undefined,
      variantCount: entity.variants.length,
      remainingIndexedFlags: state.indexedFlagEntries(),
      stamps: state.stampEntries(),
      quickPicPhotos: state.quickPicPhotoEntries(),
      metFixedInteractions: state.metFixedInteractionEntries(),
      ...dependencies,
    };
  } finally {
    await source.cleanup();
  }
}

function dialogueDependencies(entity: DialogueEntity): {
  actionShapes: readonly { opcode: number; operands: readonly number[] }[];
  controlShapes: readonly { opcode: number; operands: readonly number[] }[];
  controlOpcodes: readonly number[];
} {
  const actionShapes = new Map<string, { opcode: number; operands: readonly number[] }>();
  const controlShapes = new Map<string, { opcode: number; operands: readonly number[] }>();
  const controlOpcodes = new Set<number>();
  entity.variants.forEach((variant) => variant.tokens.forEach((token) => {
    if (token.kind === "action") {
      const operands = [...token.operands];
      actionShapes.set(`${token.opcode}:${operands.join(",")}`, { opcode: token.opcode, operands });
    } else if (token.kind === "control") {
      const operands = [...token.operands];
      controlShapes.set(`${token.opcode}:${operands.join(",")}`, { opcode: token.opcode, operands });
      controlOpcodes.add(token.opcode);
    }
  }));
  return {
    actionShapes: [...actionShapes.values()].sort((left, right) => left.opcode - right.opcode || left.operands.length - right.operands.length),
    controlShapes: [...controlShapes.values()].sort((left, right) => left.opcode - right.opcode || left.operands.length - right.operands.length || compareOperands(left.operands, right.operands)),
    controlOpcodes: [...controlOpcodes].sort((left, right) => left - right),
  };
}

function compareOperands(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

async function inspectShopInteriorCensus(files: readonly File[]): Promise<readonly SandboxShopInteriorCensusEntry[]> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    return readOverworldCatalogue(executableBytes).interactions.map((interaction) => {
      const base = {
        areaIndex: interaction.areaIndex,
        fieldNumber: interaction.fieldNumber,
        slotIndex: interaction.localIndex,
        interactionName: interaction.name,
        packagePath: shopInteriorPackagePath(interaction.areaIndex),
        staffBodyId: interaction.bodyId,
      };
      try {
        const entity = readDialogueEntityAtIndex(executableBytes, interaction.areaIndex, interaction.localIndex);
        const state = new DialogueRuntimeState();
        state.currentAreaIndex = interaction.areaIndex;
        const flow = new DialogueFlow(entity, state, fixedInteriorStartSlot(entity));
        const external = flow.currentExternalAction;
        const dependencies = dialogueDependencies(entity);
        return {
          ...base,
          entityName: entity.name,
          entityIndex: entity.entityIndex,
          variantCount: entity.variants.length,
          entrySlot: flow.currentSlot,
          entryPages: flow.currentVariant?.pages ?? [],
          entryChoices: flow.currentChoices,
          entryExternalAction: external ? { opcode: external.opcode, operands: [...external.operands] } : undefined,
          ...dependencies,
        };
      } catch (error) {
        return { ...base, dialogueError: error instanceof Error ? error.message : String(error) };
      }
    });
  } finally {
    await source.cleanup();
  }
}

async function inspectShopInteriorDialogueEntities(
  requests: readonly { areaIndex: number; slotIndex: number }[],
  files: readonly File[],
): Promise<readonly SandboxShopInteriorDialogueEntityTrace[]> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const interactions = readOverworldCatalogue(executableBytes).interactions;
    return requests.map(({ areaIndex, slotIndex }) => {
      const interaction = interactions.find((candidate) => candidate.areaIndex === areaIndex && candidate.localIndex === slotIndex);
      if (!interaction) throw new Error(`Area ${areaIndex} slot ${slotIndex} has no executable-defined fixed interaction.`);
      return {
        slotIndex,
        interactionName: interaction.name,
        ...inspectDialogueEntity(readDialogueEntityAtIndex(executableBytes, areaIndex, slotIndex)),
      };
    });
  } finally {
    await source.cleanup();
  }
}

function fieldTextureAverage(
  mesh: ReturnType<typeof compileFieldVertexColorMesh>,
  textureBasePointer: number,
): { readonly averageRgb: readonly [number, number, number]; readonly visibleAlphaFraction: number } {
  const textureIndices = new Set(mesh.batches.filter((batch) => !batch.billboard && batch.textureBasePointer === textureBasePointer).map((batch) => batch.textureIndex));
  let r = 0, g = 0, b = 0, visible = 0, total = 0;
  for (const textureIndex of textureIndices) {
    const texture = mesh.textures[textureIndex];
    if (!texture) continue;
    const rgba = texture.rgba;
    for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
      total += 1;
      if ((rgba[offset + 3] ?? 0) === 0) continue;
      r += rgba[offset] ?? 0;
      g += rgba[offset + 1] ?? 0;
      b += rgba[offset + 2] ?? 0;
      visible += 1;
    }
  }
  return {
    averageRgb: visible > 0 ? [Math.round(r / visible), Math.round(g / visible), Math.round(b / visible)] : [0, 0, 0],
    visibleAlphaFraction: total > 0 ? visible / total : 0,
  };
}

function matchCollisionFlagsToRenderedTextures(
  collision: ReturnType<typeof compileFieldCollision>,
  mesh: ReturnType<typeof compileFieldVertexColorMesh>,
): { readonly counts: readonly { readonly flag: number; readonly textureBasePointer: number; readonly count: number }[]; readonly unmatched: number } {
  interface RenderTriangle { readonly textureBasePointer: number; readonly positions: Float32Array; readonly offset: number; }
  const cellSize = 100;
  const grid = new Map<string, RenderTriangle[]>();
  const key = (x: number, z: number): string => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  for (const batch of mesh.batches) {
    if (batch.billboard) continue;
    const p = batch.positions;
    for (let offset = 0; offset + 8 < p.length; offset += 9) {
      const minX = Math.min(p[offset] ?? 0, p[offset + 3] ?? 0, p[offset + 6] ?? 0);
      const maxX = Math.max(p[offset] ?? 0, p[offset + 3] ?? 0, p[offset + 6] ?? 0);
      const minZ = Math.min(p[offset + 2] ?? 0, p[offset + 5] ?? 0, p[offset + 8] ?? 0);
      const maxZ = Math.max(p[offset + 2] ?? 0, p[offset + 5] ?? 0, p[offset + 8] ?? 0);
      const triangle = { textureBasePointer: batch.textureBasePointer, positions: p, offset };
      for (let cz = Math.floor(minZ / cellSize); cz <= Math.floor(maxZ / cellSize); cz += 1) {
        for (let cx = Math.floor(minX / cellSize); cx <= Math.floor(maxX / cellSize); cx += 1) {
          const cellKey = `${cx},${cz}`;
          const list = grid.get(cellKey) ?? [];
          list.push(triangle);
          grid.set(cellKey, list);
        }
      }
    }
  }

  const counts = new Map<string, { flag: number; textureBasePointer: number; count: number }>();
  let unmatched = 0;
  const c = collision.positions;
  for (let offset = 0, triangleIndex = 0; offset + 8 < c.length; offset += 9, triangleIndex += 1) {
    const x = ((c[offset] ?? 0) + (c[offset + 3] ?? 0) + (c[offset + 6] ?? 0)) / 3;
    const y = ((c[offset + 1] ?? 0) + (c[offset + 4] ?? 0) + (c[offset + 7] ?? 0)) / 3;
    const z = ((c[offset + 2] ?? 0) + (c[offset + 5] ?? 0) + (c[offset + 8] ?? 0)) / 3;
    let best: RenderTriangle | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of grid.get(key(x, z)) ?? []) {
      const candidateY = renderedTriangleY(candidate.positions, candidate.offset, x, z);
      if (candidateY === undefined) continue;
      const distance = Math.abs(candidateY - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    // Collision and visible terrain normally coincide closely. A generous 4-unit
    // cutoff rejects roofs/bridges above the collision ground instead of cross-labelling them.
    if (!best || bestDistance > 4) {
      unmatched += 1;
      continue;
    }
    const flag = collision.surfaceFlags[triangleIndex] ?? 0;
    const compound = `${flag}:${best.textureBasePointer}`;
    const entry = counts.get(compound) ?? { flag, textureBasePointer: best.textureBasePointer, count: 0 };
    entry.count += 1;
    counts.set(compound, entry);
  }
  return {
    counts: [...counts.values()].sort((a, b) => b.count - a.count || a.flag - b.flag || a.textureBasePointer - b.textureBasePointer),
    unmatched,
  };
}

function renderedTriangleY(p: Float32Array, offset: number, x: number, z: number): number | undefined {
  const ax = p[offset] ?? 0, ay = p[offset + 1] ?? 0, az = p[offset + 2] ?? 0;
  const bx = p[offset + 3] ?? 0, by = p[offset + 4] ?? 0, bz = p[offset + 5] ?? 0;
  const cx = p[offset + 6] ?? 0, cy = p[offset + 7] ?? 0, cz = p[offset + 8] ?? 0;
  const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = x - ax, v2z = z - az;
  const determinant = v0x * v1z - v1x * v0z;
  if (Math.abs(determinant) < 0.00001) return undefined;
  const u = (v2x * v1z - v1x * v2z) / determinant, v = (v0x * v2z - v2x * v0z) / determinant;
  if (u < -0.002 || v < -0.002 || u + v > 1.002) return undefined;
  return ay + u * (by - ay) + v * (cy - ay);
}

async function inspectFieldSurfaceMetadata(
  fieldNumbers: readonly number[],
  files: readonly File[],
): Promise<readonly SandboxFieldSurfaceSummary[]> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  if (fieldNumbers.length === 0 || fieldNumbers.length > 64 || fieldNumbers.some((field) => !Number.isInteger(field) || field < 0 || field > 999)) {
    throw new RangeError("Field surface inspection requires 1..64 integer field numbers from 0 to 999.");
  }
  const source = await openDirectImportSource([...files]);
  try {
    const summaries: SandboxFieldSurfaceSummary[] = [];
    for (const fieldNumber of fieldNumbers) {
      const path = `FLD/${fieldNumber.toString().padStart(3, "0")}.BIN`;
      const bytes = await source.disc.readFile(path);
      const collision = compileFieldCollision(bytes);
      const mesh = compileFieldVertexColorMesh(bytes);
      const collisionCounts = new Map<number, number>();
      for (const flag of collision.surfaceFlags) collisionCounts.set(flag, (collisionCounts.get(flag) ?? 0) + 1);
      const nativeSurfaceCounts = new Map<number, { count: number; representative: readonly [number, number, number] }>();
      for (let triangleIndex = 0; triangleIndex < collision.triangleCount; triangleIndex += 1) {
        const code = (collision.surfaceFlags[triangleIndex] ?? 0) & 0xf;
        const existing = nativeSurfaceCounts.get(code);
        if (existing) {
          existing.count += 1;
          continue;
        }
        const offset = triangleIndex * 9;
        nativeSurfaceCounts.set(code, {
          count: 1,
          representative: [
            ((collision.positions[offset] ?? 0) + (collision.positions[offset + 3] ?? 0) + (collision.positions[offset + 6] ?? 0)) / 3,
            ((collision.positions[offset + 1] ?? 0) + (collision.positions[offset + 4] ?? 0) + (collision.positions[offset + 7] ?? 0)) / 3,
            ((collision.positions[offset + 2] ?? 0) + (collision.positions[offset + 5] ?? 0) + (collision.positions[offset + 8] ?? 0)) / 3,
          ],
        });
      }
      const textureCounts = new Map<number, number>();
      for (const batch of mesh.batches) {
        if (batch.billboard) continue;
        const triangles = Math.floor(batch.positions.length / 9);
        textureCounts.set(batch.textureBasePointer, (textureCounts.get(batch.textureBasePointer) ?? 0) + triangles);
      }
      const matched = matchCollisionFlagsToRenderedTextures(collision, mesh);
      summaries.push({
        fieldNumber,
        collisionTriangleCount: collision.triangleCount,
        collisionFlags: [...collisionCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([value, count]) => ({ value, count })),
        nativeTyreSurfaces: [...nativeSurfaceCounts].sort((a, b) => a[0] - b[0]).map(([code, value]) => ({
          code,
          name: (["dry", "offroad", "wet", "grass", "snow", "ice"] as const)[code] ?? "unknown",
          count: value.count,
          representative: value.representative,
        })),
        renderedTriangleCount: mesh.triangleCount,
        renderedTextureBasePointers: [...textureCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([value, count]) => ({ value, count, ...fieldTextureAverage(mesh, value) })),
        collisionFlagTextureMatches: matched.counts,
        unmatchedCollisionTriangles: matched.unmatched,
        roadTriangleCount: mesh.roads.triangleCount,
        pavedRoadTriangleCount: [...mesh.roads.kinds].filter((kind) => kind === 0).length,
        dirtRoadTriangleCount: [...mesh.roads.kinds].filter((kind) => kind === 1).length,
      });
    }
    return summaries;
  } finally {
    await source.cleanup();
  }
}

async function inspectExecutableVirtualBytes(
  address: number,
  byteLength: number,
  files: readonly File[],
): Promise<readonly number[]> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  if (!Number.isInteger(address) || address < 0 || !Number.isInteger(byteLength) || byteLength <= 0 || byteLength > 0x10000) {
    throw new RangeError("Executable virtual-byte inspection requires a non-negative integer address and 1..65536 bytes.");
  }
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    return [...new Elf32AddressSpace(executableBytes).bytes(address, byteLength)];
  } finally {
    await source.cleanup();
  }
}

async function captureQFactoryFromBrowserFiles(files: readonly File[]): Promise<SandboxCaptureResult> {
  const scene = captureSceneById("qfactory");
  if (!scene || scene.kind !== "qfactory") throw new Error("Q's Factory capture definition is unavailable.");
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  let interiorView: QFactoryInteriorView | undefined;
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const catalogue = readOverworldCatalogue(executableBytes);
    const interaction = catalogue.interactions.find((candidate) => candidate.areaIndex === 1 && candidate.localIndex === 0);
    if (!interaction) throw new Error("The executable-defined Q's Factory interaction is unavailable.");

    const staffPath = carAssetPath(interaction.bodyId);
    const [shopBytes, tireBytes, wheelBytes, playerBytes, staffBytes] = await Promise.all([
      source.disc.readFile("SHOP/T00.BIN"),
      source.disc.readFile("CARS/TIRE.BIN"),
      source.disc.readFile("CARS/WHEEL.BIN"),
      source.disc.readFile("CAR2/Q62.BIN"),
      source.disc.readFile(staffPath),
    ]);
    const backdrop = readShopInteriorBackdrop(shopBytes, interaction.localIndex);
    const playerModel = new Q62CarModel(playerBytes, tireBytes, { name: "Q62 factory player", wheelBytes, wheelColor: nativeWheelPaintColor(browserCompatibilityPaintWord), wheelColorIndex: nativeWheelPaintIndex(browserCompatibilityPaintWord) });
    const staffModel = new Q62CarModel(staffBytes, tireBytes, {
      name: `${interaction.name} Q${interaction.bodyId}`,
      primaryPaint: [interaction.paint.primary.r, interaction.paint.primary.g, interaction.paint.primary.b],
      secondaryPaint: [interaction.paint.secondary.r, interaction.paint.secondary.g, interaction.paint.secondary.b],
    });
    const host = ensureHost(scene.size, "rta-sandbox-interior-host");
    interiorView = new QFactoryInteriorView(host, backdrop, playerModel, staffModel);
    const pngBlob = await interiorView.capturePng(scene.size, scene.animationTimeMs);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    return {
      sceneId: scene.id,
      label: scene.label,
      width: scene.size.width,
      height: scene.size.height,
      sha256: await sha256Hex(pngBytes),
      pngBytes: [...pngBytes],
      fieldNumbers: [],
      triangleCount: playerModel.triangleCount + staffModel.triangleCount,
      sourceKind: source.kind,
      bootExecutable: identity.bootExecutable,
    };
  } finally {
    interiorView?.dispose();
    document.getElementById("rta-sandbox-interior-host")?.remove();
    await source.cleanup();
  }
}

async function runCaptureFromFiles(
  sceneId: string,
  files: readonly File[],
  loadFullWorld = true,
  carVisualState: SandboxCarVisualState = {},
): Promise<SandboxCaptureResult> {
  const scene = captureSceneById(sceneId);
  if (!scene) throw new Error(`Unknown deterministic capture '${sceneId}'.`);
  if (scene.kind === "qfactory") return captureQFactoryFromBrowserFiles(files);
  if (scene.kind === "car-visual") return captureCarVisualFromBrowserFiles(sceneId, files, carVisualState);
  try {
    await prepareOutdoorFromBrowserFiles(files, loadFullWorld, scene.kind === "field-overview" ? [scene.fieldNumber] : []);
    return await capturePreparedOutdoor(sceneId);
  } finally {
    disposePreparedOutdoor();
  }
}

async function runCapture(request: SandboxCaptureRequest): Promise<SandboxCaptureResult> {
  return runCaptureFromFiles(request.sceneId, request.files.map(makeBrowserFile), request.loadFullWorld !== false, request.carVisualState);
}

window.__rtaSandboxCapture = {
  runCapture,
  runCaptureFromBrowserFiles: runCaptureFromFiles,
  captureCarVisualFromBrowserFiles,
  captureCarVisualDataUrlFromBrowserFiles,
  prepareCarVisualFromBrowserFiles,
  capturePreparedCarVisualDataUrl,
  disposePreparedCarVisual,
  prepareOutdoorFromBrowserFiles,
  prepareOutdoorFromFixtureBrowserFiles,
  capturePreparedOutdoor,
  capturePreparedOutdoorDataUrl,
  disposePreparedOutdoor,
  prepareDevFixtureSourceFromBrowserFiles,
  devFixtureManifest,
  downloadPreparedDevFixtureSky,
  downloadPreparedDevFixtureField,
  disposePreparedDevFixtureSource,
  captureShopPackageContactSheetDataUrl,
  captureShopInteriorRoomDataUrl,
  readShopInteriorSlotDataUrl,
  inspectShopInteriorDialogue,
  inspectShopInteriorCensus,
  inspectShopInteriorDialogueEntities,
  inspectFieldSurfaceMetadata,
  inspectExecutableVirtualBytes,
  inspectRaceCatalogue,
  inspectRaceCourse,
  captureRaceGridFromBrowserFiles,
};
