import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { readRaceStartAnchors, nativeRaceStartSeed } from "../src/formats/raceCatalogue";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { assertBrowserCameraTraceMatchesPal, assertBrowserDrivingTraceMatchesPal } from "../src/game/drivingValidation";
import { NativeDrivingMotion, readNativeDrivingMotionAuthority } from "../src/game/nativeDrivingMotion";
import { NativeRaceCollisionSampler } from "../src/game/nativeRaceCollision";
import {
  advanceNativeRaceFrame,
  readNativeRaceFrameData,
  type NativeRaceFrameInput,
  type NativeRaceFrameState,
} from "../src/game/nativeRaceFrame";
import {
  inverseNativeRaceMatrix,
  nativeRaceIdentity,
  nativeRaceYawMatrix,
  transformNativeRaceIntegerVector,
  type NativeRaceMatrix,
  type NativeRaceVector,
} from "../src/game/nativeRaceMath";
import { readNativeRaceObstaclePoints } from "../src/game/nativeRaceObstacle";
import {
  advanceNativeRaceVehicleVelocity,
  createNativeRaceVehicleState,
  nativeRaceDrag,
  readNativeRaceEquipment,
  type NativeRaceEquipment,
  type NativeRaceVehicleState,
} from "../src/game/nativeRaceVehicle";
import {
  nativeCameraObservations,
  nativeRaceFrameObservation,
  palCameraObservations,
  parsePalCameraTrace,
} from "../test-support/palDrivingValidation";
import { palRaceFrameOracle } from "../test-support/palRaceFrameOracle";
import { PalScalarMachine } from "../test-support/palScalarMachine";

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

const freeRoamEquipmentCases = [
  { label: "baseline", selectors: [0, 0, 0, 0, 0, 0, 0] },
  { label: "sports-tyre", selectors: [0, 1, 0, 0, 0, 0, 0] },
  { label: "panther-engine", selectors: [0, 0, 1, 0, 0, 0, 0] },
  { label: "hyper-chassis", selectors: [0, 0, 0, 4, 0, 0, 0] },
  { label: "speed-transmission", selectors: [0, 0, 0, 0, 3, 0, 0] },
  { label: "x3-steering", selectors: [0, 0, 0, 0, 0, 3, 0] },
  { label: "soft-brake", selectors: [0, 0, 0, 0, 0, 0, 1] },
  { label: "combined", selectors: [0, 11, 5, 4, 3, 3, 1] },
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

function palScalarMotionStep(
  machine: PalScalarMachine,
  state: NativeRaceVehicleState,
  equipment: NativeRaceEquipment,
  matrix: NativeRaceMatrix,
  localForwardSpeed: number,
  localSideSpeed: number,
  commands: number,
  contactAccelerationY: number,
): { state: NativeRaceVehicleState; worldVelocity: NativeRaceVector } {
  const v = machine.view;
  const car = 0x1000000;
  const local = 0x1001000;
  const scene = 0x1002000;
  const support = 0x1003000;
  const curve = 0x1004000;
  const runtimeEquipment = 0x1005000;
  v.setUint32(0x3dd7f0 - 16024, 0x21dcf8, true);
  v.setUint32(0x3dd7f0 - 16028, 0, true);
  machine.memory.set(equipment.brakeCurve, curve);
  v.setUint32(car + 0x200, curve, true);
  v.setUint32(car + 0x184, runtimeEquipment, true);
  v.setUint16(runtimeEquipment + 8, 0, true);
  v.setInt8(car + 0x213, 0);
  for (const [offset, value] of [
    [0x214, equipment.engineScalar], [0x218, equipment.mass], [0x23c, state.fuel],
    [0x1d8, state.steeringSpeedMemory], [0x1b8, state.nativeSpeed],
    [0x19c, 0], [0x1f8, state.runtimeFlags], [0x1dc, 4096], [0x1e0, 4096], [0x1e4, 0],
  ]) v.setInt32(car + offset!, value!, true);
  for (const [offset, value] of [
    [0x240, equipment.fuelConsumption], [0x242, equipment.steeringScalar],
    [0x1ce, state.steeringAccumulator], [0x1d0, state.engineSpeed],
    [0x1d4, state.yaw], [0x1d6, state.slipAngle], [0x1d2, state.driftRate],
  ]) v.setInt16(car + offset!, value!, true);
  equipment.surfaceGrips.forEach((value, index) => v.setInt16(car + 0x21c + index * 2, value, true));
  equipment.gearWords.forEach((value, index) => v.setInt16(car + 0x22c + index * 2, value, true));
  v.setUint8(car + 0x1ff, state.gear);
  v.setUint8(car + 0x1fe, state.brakeHold);
  v.setInt32(local, localSideSpeed, true);
  v.setInt32(local + 8, localForwardSpeed, true);
  v.setInt32(support + 4, contactAccelerationY, true);
  v.setUint32(scene + 0x28, 4, true);
  matrix.forEach((value, index) => v.setFloat32(car + index * 4, value, true));
  machine.run(0x21b1c0, [scene, car, local, commands, support], {
    0x281a58: (args) => {
      machine.memory.fill(args[1]!, args[0]!, args[0]! + args[2]!);
      return args[0]!;
    },
    0x218b18: () => 0,
  });
  return {
    state: {
      gear: v.getInt8(car + 0x1ff),
      brakeHold: v.getUint8(car + 0x1fe),
      steeringAccumulator: v.getInt16(car + 0x1ce, true),
      steeringSpeedMemory: v.getInt32(car + 0x1d8, true),
      curvature: v.getInt16(car + 0x1cc, true),
      engineSpeed: v.getInt16(car + 0x1d0, true),
      nativeSpeed: v.getInt32(car + 0x1b8, true),
      wheelSpeed: v.getInt32(car + 0x1bc, true),
      fuel: v.getInt32(car + 0x23c, true),
      yaw: v.getUint16(car + 0x1d4, true),
      slipAngle: v.getInt16(car + 0x1d6, true),
      driftRate: v.getInt16(car + 0x1d2, true),
      runtimeFlags: v.getUint32(car + 0x1f8, true),
    },
    worldVelocity: [0, 1, 2, 3].map((index) => v.getInt32(car + 0xf0 + index * 4, true)) as unknown as NativeRaceVector,
  };
}

test("camera trace schema feeds the production native chase-camera seam", () => {
  const trace = parsePalCameraTrace(JSON.stringify({
    schema: 1,
    tolerance: 1e-12,
    samples: [{
      label: "synthetic-schema-smoke",
      tick: 0,
      nativeVehicle: { position: [10, 2, 20], nativeYaw: 0, nativeSlip: 0, presetIndex: 0 },
      palCamera: { position: [10, 4, 13], target: [10, 2, 20] },
    }],
  }));
  expect(() => assertBrowserCameraTraceMatchesPal(
    nativeCameraObservations(trace),
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

  test("free-roam equipment preserves the retail PAL oracle and symmetric playable drift policy", async () => {
    const opened = await openPalDisc(binPath!);
    try {
      const executable = await opened.disc.readFile("SLES_513.56");
      const authority = readNativeDrivingMotionAuthority(executable);

      for (const equipmentCase of freeRoamEquipmentCases) {
        const equipment = authority.equipment(equipmentCase.selectors);
        const motion = new NativeDrivingMotion(authority, 0);
        for (let category = 1; category <= 6; category += 1) {
          motion.setSelector(category, equipmentCase.selectors[category]!);
        }
        const machine = new PalScalarMachine(executable);
        let retailState = createNativeRaceVehicleState(0);
        let retailVelocity: NativeRaceVector = [0, 0, 0, 0];
        let symmetricState = createNativeRaceVehicleState(0);
        let symmetricVelocity: NativeRaceVector = [0, 0, 0, 0];

        for (let tick = 0; tick < 160; tick += 1) {
          const throttle = tick < 90 ? 1 : tick < 125 ? -1 : 0;
          const steering = tick < 20 ? 0 : tick < 55 ? 1 : tick < 90 ? -1 : 0;
          const commandsFor = (state: NativeRaceVehicleState): number =>
            (throttle > 0 ? 1 : throttle < 0 ? (state.nativeSpeed > 0 ? 2 : 5) : 0)
            | (steering > 0 ? 0x2000 : steering < 0 ? 0x8000 : 0);
          const retailCommands = commandsFor(retailState);
          const retailYawRadians = Math.fround(
            Math.fround((retailState.yaw << 16 >> 16) * authority.yawScale) / 32768,
          );
          const retailMatrix = nativeRaceYawMatrix(retailYawRadians, authority.math);
          const retailInverse = inverseNativeRaceMatrix(retailMatrix);
          const retailLocalVelocity = transformNativeRaceIntegerVector(retailInverse, retailVelocity);
          const retailDrag = nativeRaceDrag(retailLocalVelocity[2], retailLocalVelocity[0], equipment.mass, 0, 0, 0);
          const pal = palScalarMotionStep(
            machine,
            retailState,
            equipment,
            retailMatrix,
            retailDrag.forward,
            retailDrag.side,
            retailCommands,
            89,
          );
          const retail = advanceNativeRaceVehicleVelocity(
            retailState,
            equipment,
            {
              localForwardSpeed: retailDrag.forward,
              localSideSpeed: retailDrag.side,
              surfaceIndex: 0,
              driveContact: true,
              contactAccelerationY: 89,
              contactAllowsYaw: true,
            },
            retailCommands,
            4,
            retailMatrix,
            true,
            "retail",
          );
          const label = `${equipmentCase.label} tick ${tick}`;
          expect(retail.state, `${label} retail vehicle state`).toEqual(pal.state);
          expect(retail.worldVelocity, `${label} retail world velocity`).toEqual(pal.worldVelocity);

          const browser = motion.step({
            throttle,
            steering,
            surfaceIndex: 0,
            contact: {
              driveContact: true,
              accelerationY: 89,
              allowsYaw: true,
              specialState: 0,
              propellerEnabled: false,
            },
          });
          const symmetricCommands = commandsFor(symmetricState);
          const symmetricYawRadians = Math.fround(
            Math.fround((symmetricState.yaw << 16 >> 16) * authority.yawScale) / 32768,
          );
          const symmetricMatrix = nativeRaceYawMatrix(symmetricYawRadians, authority.math);
          const symmetricInverse = inverseNativeRaceMatrix(symmetricMatrix);
          const symmetricLocalVelocity = transformNativeRaceIntegerVector(symmetricInverse, symmetricVelocity);
          const symmetricDrag = nativeRaceDrag(
            symmetricLocalVelocity[2],
            symmetricLocalVelocity[0],
            equipment.mass,
            0,
            0,
            0,
          );
          const symmetric = advanceNativeRaceVehicleVelocity(
            symmetricState,
            equipment,
            {
              localForwardSpeed: symmetricDrag.forward,
              localSideSpeed: symmetricDrag.side,
              surfaceIndex: 0,
              driveContact: true,
              contactAccelerationY: 89,
              contactAllowsYaw: true,
            },
            symmetricCommands,
            4,
            symmetricMatrix,
            true,
            "symmetric",
          );
          expect(browser.commands, `${label} playable commands`).toBe(symmetricCommands);
          expect(browser.nativeVehicle, `${label} playable vehicle state`).toEqual(symmetric.state);
          expect(browser.nativeVelocity, `${label} playable world velocity`).toEqual(symmetric.worldVelocity);
          if (equipmentCase.label === "x3-steering" && tick === 62) {
            expect({
              driftRate: pal.state.driftRate,
              slipAngle: pal.state.slipAngle,
              yaw: pal.state.yaw,
            }).toEqual({ driftRate: -5, slipAngle: -45, yaw: 5320 });
            expect({
              driftRate: browser.nativeVehicle.driftRate,
              slipAngle: browser.nativeVehicle.slipAngle,
              yaw: browser.nativeVehicle.yaw,
            }).toEqual({ driftRate: -1, slipAngle: -8, yaw: 5357 });
          }
          retailState = pal.state;
          retailVelocity = pal.worldVelocity;
          symmetricState = symmetric.state;
          symmetricVelocity = symmetric.worldVelocity;
        }
      }
    } finally {
      opened.close();
    }
  }, 120_000);
});

describe.skipIf(!cameraTracePath)("PAL chase-camera observations", () => {
  test("native chase runtime is compared against the optional measured PAL camera trace", () => {
    const trace = parsePalCameraTrace(readFileSync(cameraTracePath!, "utf8"));
    expect(() => assertBrowserCameraTraceMatchesPal(
      nativeCameraObservations(trace),
      palCameraObservations(trace),
      trace.tolerance,
    )).not.toThrow();
  });
});
