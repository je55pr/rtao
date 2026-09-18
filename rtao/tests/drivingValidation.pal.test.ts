import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { readRaceStartAnchors, nativeRaceStartSeed } from "../src/formats/raceCatalogue";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { assertBrowserCameraTraceMatchesPal, assertBrowserDrivingTraceMatchesPal } from "../src/game/drivingValidation";
import { NativeRaceCollisionSampler } from "../src/game/nativeRaceCollision";
import {
  advanceNativeRaceFrame,
  readNativeRaceFrameData,
  type NativeRaceFrameInput,
  type NativeRaceFrameState,
} from "../src/game/nativeRaceFrame";
import { inverseNativeRaceMatrix, nativeRaceIdentity, nativeRaceYawMatrix } from "../src/game/nativeRaceMath";
import { readNativeRaceObstaclePoints } from "../src/game/nativeRaceObstacle";
import { createNativeRaceVehicleState, readNativeRaceEquipment } from "../src/game/nativeRaceVehicle";
import {
  browserCameraObservations,
  nativeRaceFrameObservation,
  palCameraObservations,
  parsePalCameraTrace,
} from "../test-support/palDrivingValidation";
import { palRaceFrameOracle } from "../test-support/palRaceFrameOracle";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const binPath = process.env.RTA_PAL_BIN;
const cameraTracePath = process.env.RTA_PAL_CAMERA_TRACE;

function blankState(): NativeRaceFrameState {
  return {
    vehicle: createNativeRaceVehicleState(0),
    contact: {
      position: [0, 0, 0],
      referenceY: 0,
      support: [4096, 4096, 4096],
      supportDelta: [0, 0, 0],
      impulses: [0, 0, 0],
      unsupportedTicks: 0,
      runtimeFlags: 0,
      specialState: 0,
      yaw: 0,
    },
    velocity: [0, 0, 0, 0],
    previousVelocity: [0, 0, 0, 0],
    matrix: nativeRaceIdentity(),
    inverse: nativeRaceIdentity(),
    bodyMatrix: nativeRaceIdentity(),
    coordinates: [0, 0, 0, 1],
    surfaces: Array(7).fill(0),
    carFlags: 2,
    positionIndex: 0,
    distance: 0,
    countdownByte: 0,
    countdownHalf: 0,
    equipmentBoostState: 0,
    verticalControl: 0,
    shiftScheduleFlag: 0,
  };
}

const scenarios = [
  {
    label: "straight-coast",
    equipmentFlags: 0,
    commands: (tick: number) => tick < 60 ? 1 : 0,
  },
  {
    label: "turn-command",
    equipmentFlags: 0,
    commands: (tick: number) => tick < 30 ? 1 : tick < 75 ? 0x2001 : 1,
  },
  {
    label: "0x1000-control",
    equipmentFlags: 0x1000,
    commands: (tick: number) => tick < 30 ? 0x21 : tick < 60 ? 0x2001 : tick < 90 ? 0x8001 : 1,
  },
  {
    label: "0x2000-boost",
    equipmentFlags: 0x2000,
    commands: (tick: number) => tick < 75 ? 9 : 1,
  },
  {
    label: "0x3000-combined",
    equipmentFlags: 0x3000,
    commands: (tick: number) => tick < 45 ? 0x2009 : tick < 90 ? 0x8009 : 1,
  },
] as const;

async function openPalDisc(path: string): Promise<{ disc: Iso9660Disc; close(): void }> {
  const handle = openSync(path, "r");
  const source = new RawMode2SectorSource({
    size: fstatSync(handle).size,
    label: "local PAL BIN",
    async read(offset, length) {
      const bytes = new Uint8Array(length);
      if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
      return bytes;
    },
  });
  try {
    return { disc: await Iso9660Disc.open(source), close: () => closeSync(handle) };
  } catch (error) {
    closeSync(handle);
    throw error;
  }
}

test("camera trace schema feeds the production chase-camera seam", () => {
  const trace = parsePalCameraTrace(JSON.stringify({
    schema: 1,
    tolerance: 1e-12,
    samples: [{
      label: "synthetic-schema-smoke",
      tick: 0,
      browserPose: { position: [10, 2, 20], yaw: 0, cameraLift: 4.2, snap: true },
      palCamera: { position: [10, 6.2, 12.2], target: [10, 2.7199999999999998, 20] },
    }],
  }));
  expect(() => assertBrowserCameraTraceMatchesPal(
    browserCameraObservations(trace),
    palCameraObservations(trace),
    trace.tolerance,
  )).not.toThrow();
});

describe.skipIf(!binPath)("PAL driving validation sequences", () => {
  test("representative controls and equipment retain pose, velocity and contact parity on COURSE/C00", async () => {
    const opened = await openPalDisc(binPath!);
    try {
      const discExecutable = await opened.disc.readFile("SLES_513.56");
      const executable = executablePath
        ? new Uint8Array(readFileSync(executablePath))
        : discExecutable;
      if (executablePath) {
        expect(createHash("sha256").update(discExecutable).digest("hex"))
          .toBe(createHash("sha256").update(executable).digest("hex"));
      }
      const courseBytes = await opened.disc.readFile("COURSE/C00.BIN");
      const collision = new NativeRaceCollisionSampler(courseBytes);
      const obstaclePoints = readNativeRaceObstaclePoints(courseBytes);
      const frameData = readNativeRaceFrameData(executable);
      const anchor = readRaceStartAnchors(executable)[0];
      expect(anchor).toBeDefined();
      const start = nativeRaceStartSeed(anchor!, 0);
      const equipment = readNativeRaceEquipment(executable, [0, 0, 0, 0, 0, 0, 0]);

      for (const scenario of scenarios) {
        const base = blankState();
        const matrix = nativeRaceYawMatrix(
          Math.fround(Math.fround((start.nativeYaw << 16 >> 16) * frameData.contact.yawScale) / 32768),
          frameData.math,
        );
        const seeded: NativeRaceFrameState = {
          ...base,
          vehicle: createNativeRaceVehicleState(start.nativeYaw),
          contact: {
            ...base.contact,
            position: [start.nativeX, start.nativeY, start.nativeZ]
              .map((value) => Math.trunc(Math.fround(value * frameData.contact.positionDivisor))) as [number, number, number],
            referenceY: start.nativeY,
            yaw: start.nativeYaw,
          },
          coordinates: [start.nativeX, start.nativeY, start.nativeZ, 1],
          matrix,
          inverse: inverseNativeRaceMatrix(matrix),
        };
        const oracle = palRaceFrameOracle(executable);
        oracle.loadCourse(courseBytes);
        let browserState = seeded;
        let palState = seeded;
        let browserSceneFlags = 4;
        let palSceneFlags = 4;

        for (let tick = 0; tick < 120; tick += 1) {
          const commands = scenario.commands(tick);
          const common = {
            equipment,
            equipmentFlags: scenario.equipmentFlags,
            globalEquipmentFlags: 0,
            sceneKind: 0,
            sceneByte0B: 0,
            sceneTime: tick,
            raceModeByte: 0,
            commands,
            highShiftSchedule: true,
            obstaclePoints,
          };
          const browserInput: NativeRaceFrameInput = { ...common, state: browserState, sceneFlags: browserSceneFlags };
          const palInput: NativeRaceFrameInput = { ...common, state: palState, sceneFlags: palSceneFlags };
          const browserResult = advanceNativeRaceFrame(browserInput, frameData, (point) => collision.query(point));
          const palResult = oracle.run(palInput);

          expect(() => assertBrowserDrivingTraceMatchesPal(
            [nativeRaceFrameObservation(scenario.label, tick, browserInput, browserResult)],
            [nativeRaceFrameObservation(scenario.label, tick, palInput, palResult)],
          ), `${scenario.label} tick ${tick}`).not.toThrow();

          browserState = browserResult.state;
          palState = palResult.state;
          browserSceneFlags = browserResult.sceneFlags;
          palSceneFlags = palResult.sceneFlags;
        }
      }
    } finally {
      opened.close();
    }
  }, 120_000);
});

describe.skipIf(!cameraTracePath)("PAL chase-camera observations", () => {
  test("current browser chase policy is compared against the local recovered camera trace", () => {
    const trace = parsePalCameraTrace(readFileSync(cameraTracePath!, "utf8"));
    expect(() => assertBrowserCameraTraceMatchesPal(
      browserCameraObservations(trace),
      palCameraObservations(trace),
      trace.tolerance,
    )).not.toThrow();
  });
});
