import { carAssetPath } from "../formats/carPath";
import { compileFieldCollision } from "../formats/fieldCollision";
import { readCollisionChunkDirectory, readFieldHeader, readRenderChunkDirectory } from "../formats/field";
import { compileFieldVertexColorMesh } from "../formats/fieldGeometry";
import { nativeRaceStartSeed, ordinaryRaceEntrants, readRaceCatalogue, readRaceFinishGateSets, readRaceNavigationCourses, readRaceStartAnchors } from "../formats/raceCatalogue";
import { Q62CarModel } from "../game/carView";
import { browserCompatibilityPaintWord, decodeNativeBodyPaint, nativeWheelPaintColor, nativeWheelPaintIndex } from "../game/paintShop";
import { readOrdinaryRaceSpeedProfiles, stepOrdinaryRaceAi } from "../game/raceAi";
import { RaceCourseGridSampler } from "../game/raceCourseGrid";
import { WorldView } from "../game/worldView";
import { openDirectImportSource } from "../importer/directSource";
import type { SandboxRaceCatalogueSummary, SandboxRaceCourseSummary, SandboxRaceGridCapture } from "./api";
import { blobDataUrl, ensureHost, sha256Hex } from "./browserHelpers";
import { readSupportedIdentity } from "./source";

function racePaintOptions(paintWord: number) {
  const paints = decodeNativeBodyPaint(paintWord);
  return {
    primaryPaint: paints.primary,
    secondaryPaint: paints.secondary,
    wheelColor: nativeWheelPaintColor(paintWord),
    wheelColorIndex: nativeWheelPaintIndex(paintWord),
  };
}

export async function inspectRaceCatalogue(files: readonly File[]): Promise<SandboxRaceCatalogueSummary> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const catalogue = readRaceCatalogue(executableBytes);
    const startAnchors = readRaceStartAnchors(executableBytes);
    const navigationCourses = readRaceNavigationCourses(executableBytes);
    return {
      selectorRanges: catalogue.selectorRanges,
      finishGates: readRaceFinishGateSets(executableBytes),
      startAnchors: startAnchors.map((anchor) => ({
        ...anchor,
        firstSixSeeds: Array.from({ length: 6 }, (_, startIndex) => nativeRaceStartSeed(anchor, startIndex)),
      })),
      navigationCourses: navigationCourses.map((course) => ({
        courseId: course.courseId,
        gateTableAddress: course.gateTableAddress,
        recordTableAddress: course.recordTableAddress,
        gateCount: course.gates.length,
        recordCount: course.records.length,
        firstForwardBoundaryGateIndex: course.records[0]!.forwardBoundaryGateIndex,
      })),
      activities: catalogue.activities.map((activity) => ({
        ...activity,
        rawSettings: [...activity.rawSettings],
        soloEntrants: activity.ordinaryRace
          ? ordinaryRaceEntrants(activity, startAnchors[activity.sceneId]!).map((entrant) => ({
              kind: entrant.kind,
              carIndex: entrant.carIndex,
              configPointerIndex: entrant.configPointerIndex,
              participantIndex: entrant.kind === "opponent" ? entrant.participantIndex : undefined,
              startIndex: entrant.startIndex,
              packedCreationFlags: entrant.packedCreationFlags,
              controlSource: entrant.controlSource,
              controllerIndex: entrant.controllerIndex,
              seed: entrant.seed,
            }))
          : undefined,
      })),
    };
  } finally {
    await source.cleanup();
  }
}

export async function inspectRaceCourse(courseId: number, files: readonly File[]): Promise<SandboxRaceCourseSummary> {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  if (!Number.isInteger(courseId) || courseId < 0 || courseId > 99) {
    throw new RangeError("Race course inspection requires an integer course ID from 0 through 99.");
  }
  const source = await openDirectImportSource([...files]);
  try {
    const identity = await readSupportedIdentity(source);
    const path = `COURSE/C${courseId.toString().padStart(2, "0")}.BIN`;
    const bytes = await source.disc.readFile(path);
    const executableBytes = await source.disc.readFile(identity.bootExecutable);
    const header = readFieldHeader(bytes);
    const render = readRenderChunkDirectory(bytes, header);
    const collision = readCollisionChunkDirectory(bytes, header);
    const mesh = compileFieldVertexColorMesh(bytes);
    const compiledCollision = compileFieldCollision(bytes);
    const anchor = readRaceStartAnchors(executableBytes)[courseId];
    if (!anchor) throw new Error(`PAL executable has no ordinary-race start anchor for C${courseId.toString().padStart(2, "0")}.`);
    const navigation = readRaceNavigationCourses(executableBytes)[courseId];
    if (!navigation) throw new Error(`PAL executable has no ordinary-race navigation table for C${courseId.toString().padStart(2, "0")}.`);
    const grid = new RaceCourseGridSampler(compiledCollision);
    return {
      courseId,
      path,
      byteLength: bytes.byteLength,
      sectionOffsets: header.offsets,
      renderChunkCount: render.totalChunkCount,
      populatedRenderChunkCount: render.chunks.filter((chunk) => chunk.declaredPacketCount > 0).length,
      collisionChunkCount: collision.totalChunkCount,
      populatedCollisionChunkCount: collision.chunks.filter((chunk) => chunk.declaredPacketCount > 0).length,
      vertexCount: mesh.vertexCount,
      triangleCount: mesh.triangleCount,
      primitiveCount: mesh.primitiveCount,
      textureCount: mesh.textures.length,
      batchCount: mesh.batches.length,
      collisionTriangleCount: compiledCollision.triangleCount,
      navigation: {
        gateTableAddress: navigation.gateTableAddress,
        recordTableAddress: navigation.recordTableAddress,
        gates: navigation.gates,
        records: navigation.records,
      },
      groundedStartGrid: Array.from({ length: 24 }, (_, startIndex) => grid.ground(nativeRaceStartSeed(anchor, startIndex))),
    };
  } finally {
    await source.cleanup();
  }
}

export async function captureRaceCourseOverviewFromBrowserFiles(courseId: number, files: readonly File[]) {
  if (files.length === 0) throw new Error("Provide an ISO, BIN, or BIN/CUE pair.");
  if (!Number.isInteger(courseId) || courseId < 0 || courseId > 99) throw new RangeError("Race course overview requires an integer course ID from 0 through 99.");
  const source = await openDirectImportSource([...files]);
  let world: WorldView | undefined;
  try {
    const bytes = await source.disc.readFile(`COURSE/C${courseId.toString().padStart(2, "0")}.BIN`);
    const mesh = compileFieldVertexColorMesh(bytes);
    const size = { width: 1280, height: 960 } as const;
    world = new WorldView(ensureHost(size, "rta-sandbox-race-course-overview"));
    world.startWorld();
    world.addCompiledFieldMesh(223, mesh);
    world.finishWorld();
    const blob = await world.capturePng({ id: `race-course-${courseId}`, label: `C${courseId.toString().padStart(2, "0")} — whole-course inspection`,
      kind: "field-overview", fieldNumber: 223, size, visibilityMode: "unlimited" }, size);
    return { courseId, triangleCount: mesh.triangleCount, dataUrl: await blobDataUrl(blob),
      sha256: await sha256Hex(new Uint8Array(await blob.arrayBuffer())) };
  } finally {
    world?.dispose();
    document.getElementById("rta-sandbox-race-course-overview")?.remove();
    await source.cleanup();
  }
}

export async function captureRaceGridFromBrowserFiles(activityId: number, files: readonly File[]): Promise<SandboxRaceGridCapture> {
  const source = await openDirectImportSource([...files]);
  let world: WorldView | undefined;
  const models: Q62CarModel[] = [];
  try {
    const identity = await readSupportedIdentity(source);
    const executable = await source.disc.readFile(identity.bootExecutable);
    const activity = readRaceCatalogue(executable).ordinaryRaces[activityId];
    if (!activity) throw new RangeError("Race grid capture requires an ordinary activity ID 0..23.");
    const anchor = readRaceStartAnchors(executable)[activity.sceneId]!;
    const navigation = readRaceNavigationCourses(executable)[activity.sceneId]!;
    const profile = readOrdinaryRaceSpeedProfiles(executable)[activityId]!;
    const courseBytes = await source.disc.readFile(`COURSE/C${activity.sceneId.toString().padStart(2, "0")}.BIN`);
    const grid = new RaceCourseGridSampler(compileFieldCollision(courseBytes));
    const entrants = ordinaryRaceEntrants(activity, anchor);
    const size = { width: 1280, height: 960 };
    world = new WorldView(ensureHost(size, "rta-sandbox-race-grid"));
    world.startWorld();
    // Isolated render slot: no overworld topology or race scene-ID equivalence is implied.
    world.addCompiledFieldMesh(223, compileFieldVertexColorMesh(courseBytes));
    world.finishWorld();
    const tireBytes = await source.disc.readFile("CARS/TIRE.BIN");
    const wheelBytes = await source.disc.readFile("CARS/WHEEL.BIN");
    const bodyBytes = new Map<number, Uint8Array>();
    const summaries: SandboxRaceGridCapture["entrants"][number][] = [];
    for (const entrant of entrants) {
      const bodyId = entrant.kind === "opponent" ? entrant.participant.bodyId : 62;
      const name = entrant.kind === "opponent" ? entrant.participant.name : "Player Q62";
      const paintWord = entrant.kind === "opponent" ? entrant.participant.packedPaint : browserCompatibilityPaintWord;
      if (!bodyBytes.has(bodyId)) bodyBytes.set(bodyId, await source.disc.readFile(carAssetPath(bodyId)));
      const model = new Q62CarModel(bodyBytes.get(bodyId)!, tireBytes, { name, wheelBytes, ...racePaintOptions(paintWord) });
      models.push(model);
      const grounded = grid.ground(entrant.seed);
      world.addWorldActor(`race-car-${entrant.carIndex}`, model, 223, grounded.position, grounded.yaw);
      const ai = entrant.controlSource === "ordinary-ai" ? stepOrdinaryRaceAi(navigation, {
        ...entrant.seed, nativeSpeed: 0, configPointerIndex: entrant.configPointerIndex,
        currentRecordIndex: 0, steeringEnabled: true, speedLimit: 0,
      }, { sceneFlags: 4, updateSpeedFeedback: false }, { speedTargets: profile.slice(), speedFeedback: new Uint8Array(256) }) : null;
      summaries.push({ carIndex: entrant.carIndex, name, startIndex: entrant.startIndex, position: grounded.position, yaw: grounded.yaw, ai });
    }
    const player = summaries[0]!;
    const forwardX = Math.sin(player.yaw), forwardZ = Math.cos(player.yaw);
    const blob = await world.capturePng({ id: `race-grid-${activityId}`, label: `${activity.name} — native grid inspection`,
      kind: "field-overview", fieldNumber: 223, size, visibilityMode: "unlimited",
      camera: { position: [player.position.x - forwardX * 10, player.position.y + 4.8, player.position.z - forwardZ * 10],
        target: [player.position.x + forwardX * 16, player.position.y + 1, player.position.z + forwardZ * 16] },
    }, size, true);
    return { activityId, activityName: activity.name, courseId: activity.sceneId, entrants: summaries,
      dataUrl: await blobDataUrl(blob), sha256: await sha256Hex(new Uint8Array(await blob.arrayBuffer())),
      visualEquipment: "Existing neutral wheel preview; native opponent equipment configuration is not asserted by this capture." };
  } finally {
    world?.dispose();
    models.forEach((model) => model.dispose());
    document.getElementById("rta-sandbox-race-grid")?.remove();
    await source.cleanup();
  }
}
