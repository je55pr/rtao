import { describe, expect, test } from "vitest";
import type {
  OrdinaryRaceEntrant,
  RaceActivityDescriptor,
  RaceCatalogue,
  RaceFinishGateSet,
} from "../../formats/raceCatalogue";
import { RecoveredCommerceState } from "../commerceProgress";
import {
  advanceNativeRaceFrame,
  type NativeRaceFrameData,
  type NativeRaceFrameInput,
} from "../nativeRaceFrame";
import { nativeRaceIdentity } from "../nativeRaceMath";
import { createNativeRaceVehicleState } from "../nativeRaceVehicle";
import { RecoveredRaceState } from "../raceProgress";
import { OrdinaryRaceSession, type OrdinaryRaceSessionConfig } from "./raceSession";

const finishGates: RaceFinishGateSet = {
  courseId: 0,
  strips: [
    { minimumX: 0, minimumZ: 0, maximumX: 2, maximumZ: 10 },
    { minimumX: 2, minimumZ: 0, maximumX: 4, maximumZ: 10 },
    { minimumX: 4, minimumZ: 0, maximumX: 6, maximumZ: 10 },
  ],
};const frameData: NativeRaceFrameData = {
  contact: {
    probes: [[0, 0, 0, 0], [-1, 0, 1, 0], [1, 0, 1, 0], [-1, 0, 0, 0], [1, 0, 0, 0], [-1, 0, -1, 0], [1, 0, -1, 0]],
    positionDivisor: 32768,
    bigTyreThreshold: 1,
    yawScale: Math.fround(Math.PI),
  },
  math: { rotationCoefficients: [0, 0, 0, -0.1], normalYThreshold: 0.5, normalYIncrement: 0.1 },
  obstacle: { minimumX: -1, maximumX: 1 },
  bodySideDivisor: 32768,
  bodyForwardDivisor: 32768,
  bigTyreLift: 1,
  obstacleYawScale: Math.fround(Math.PI),
};

const query: Parameters<typeof advanceNativeRaceFrame>[2] = (point) => ({
  point: [point[0], 0, point[2], 0],
  flags: 3,
  ceilingY: 10000,
});

const frameAdvance = ((input: NativeRaceFrameInput) => ({
  state: { ...input.state, coordinates: [input.commands, 0, 5, 1] },
  sceneFlags: input.sceneFlags >>> 0,
  contactFlags: 0,
  obstacleFlags: 0,
  diagnosticRequested: false,
  impactRequests: [],
  soundRequests: [],
  skipped: false,
})) as typeof advanceNativeRaceFrame;function activity(carCount: number): RaceActivityDescriptor {
  return {
    activityId: 0,
    name: "Peach Raceway",
    ordinaryRace: true,
    descriptorAddress: 0,
    sceneId: 0,
    rawParameter1: carCount,
    rawParameter2: 3,
    variantId: 0,
    settingsAddress: 1,
    participantListAddress: 1,
    participants: [],
    rawSettings: new Uint8Array(20),
    handlerAAddress: 0,
    handlerBAddress: 0,
  };
}

function entrant(carIndex: number): OrdinaryRaceEntrant {
  const common = {
    carIndex,
    configPointerIndex: carIndex,
    startIndex: carIndex,
    packedCreationFlags: carIndex,
    seed: { courseId: 0, startIndex: carIndex, nativeX: 0, nativeY: 0, nativeZ: 0, nativeYaw: 0 },
  } as const;
  if (carIndex === 0) return { ...common, kind: "player", controlSource: "human-input", controllerIndex: 0 };
  return {
    ...common,
    kind: "opponent",
    controlSource: "ordinary-ai",
    controllerIndex: null,
    participantIndex: carIndex - 1,
    participant: { areaIndex: 1, residentIndex: carIndex, name: `Car ${carIndex}`, bodyId: 1, packedPaint: 0 },
  };
}function frameState(carIndex: number) {
  return {
    vehicle: createNativeRaceVehicleState(0),
    contact: {
      position: [0, 0, 0] as [number, number, number],
      referenceY: 0,
      support: [4096, 4096, 4096] as [number, number, number],
      supportDelta: [0, 0, 0] as [number, number, number],
      impulses: [0, 0, 0] as [number, number, number],
      unsupportedTicks: 0,
      runtimeFlags: 0,
      specialState: 0,
      yaw: 0,
    },
    velocity: [0, 0, 0, 0] as const,
    previousVelocity: [0, 0, 0, 0] as const,
    matrix: nativeRaceIdentity(),
    inverse: nativeRaceIdentity(),
    bodyMatrix: nativeRaceIdentity(),
    coordinates: [20, 0, 5, 1] as const,
    surfaces: Array(7).fill(0),
    carFlags: carIndex === 0 ? 2 : 0x80,
    positionIndex: carIndex,
    distance: 0,
    countdownByte: 0,
    countdownHalf: 0,
    verticalControl: 0,
    shiftScheduleFlag: 0,
  };
}function config(carCount: number, elapsedUpdates = 200): OrdinaryRaceSessionConfig {
  return {
    activity: activity(carCount),
    finishGates,
    countdown: { elapsedUpdates, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50 },
    frameData,
    query,
    sceneKind: 0,
    sceneByte0B: 0,
    raceModeByte: 0,
    globalEquipmentFlags: 0,
    entrants: Array.from({ length: carCount }, (_, carIndex) => ({
      entrant: entrant(carIndex),
      state: frameState(carIndex),
      equipment: {
        surfaceGrips: Array(6).fill(1000),
        mass: 20,
        engineScalar: 100,
        fuelConsumption: 1,
        steeringScalar: 128,
        brakeCurve: new Uint8Array(32),
        gearWords: [-128, 128, 96, 64, 32, 16, 8, 0],
      },
      equipmentFlags: 0,
      obstaclePoints: [],
      navigationOutput: 1,
      navigationDistance: carIndex,
    })),
  };
}

function session(carCount: number, elapsedUpdates = 200): OrdinaryRaceSession {
  return new OrdinaryRaceSession(config(carCount, elapsedUpdates), { advanceFrame: frameAdvance });
}describe("ordinary race session", () => {
  test("owns the evidenced countdown-to-drive boundary deterministically", () => {
    const race = session(2, 199);
    const idle = () => ({ commands: 20, navigationOutput: 1, navigationDistance: 1 });
    expect(race.phase).toBe("countdown");
    expect(race.step({ sceneTime: 0, shortFinalPhase: false, commandSource: idle })).toMatchObject({
      phase: "countdown",
      countdown: { elapsedUpdates: 199, sceneFlags: 0, completed: false },
    });
    expect(race.step({ sceneTime: 1, shortFinalPhase: false, commandSource: idle })).toMatchObject({
      phase: "racing",
      countdown: { elapsedUpdates: 200, sceneFlags: 4, completed: false },
    });
    for (let tick = 201; tick <= 300; tick += 1) {
      race.step({ sceneTime: tick, shortFinalPhase: false, commandSource: idle });
    }
    expect(race.isCountdownComplete).toBe(true);
    expect(race.currentSceneFlags).toBe(0x114);
  });

  test("awards a three-lap same-update finish in ascending native car-slot order", () => {
    const race = session(3);
    const path = [1, 3, 5, 1];
    for (let lap = 0; lap < 3; lap += 1) {
      for (const nativeX of path) {
        race.step({
          sceneTime: lap * 4 + nativeX,
          shortFinalPhase: false,
          commandSource: (car) => ({ commands: nativeX, navigationOutput: 1, navigationDistance: car.entrant.carIndex }),
        });
      }
    }
    expect(race.finalPositions()).toEqual([
      { carIndex: 0, positionIndex: 0 },
      { carIndex: 1, positionIndex: 1 },
      { carIndex: 2, positionIndex: 2 },
    ]);
    expect(race.phase).toBe("field-finished");
    expect(race.entrant(0)).toMatchObject({ completedLaps: 3, finishIndex: 0, speedLimit: 40 });
    expect(race.entrant(0).state.carFlags & 0x280).toBe(0x280);
  });
  test("gates reward handoff until the player finishes and applies it only once", () => {
    const race = session(2);
    const races = new RecoveredRaceState();
    const commerce = new RecoveredCommerceState(1_000);
    const raceActivity = activity(2);
    const catalogue: RaceCatalogue = { ordinaryRaces: [raceActivity], activities: [raceActivity], selectorRanges: [] };
    expect(race.resultHandoff()).toMatchObject({ status: "waiting-for-team-finish", waitingCarIndices: [0] });
    expect(() => race.applyResult(catalogue, races, commerce)).toThrow(/gated/);

    for (const nativeX of [...[1, 3, 5, 1], ...[1, 3, 5, 1], ...[1, 3, 5, 1]]) {
      race.step({
        sceneTime: nativeX,
        shortFinalPhase: false,
        commandSource: (car) => ({
          commands: car.entrant.carIndex === 0 ? nativeX : 20,
          navigationOutput: 1,
          navigationDistance: car.entrant.carIndex,
        }),
      });
    }
    expect(race.resultHandoff()).toEqual({
      status: "ready",
      activityId: 0,
      nativeFinishIndices: [0],
      waitingCarIndices: [],
    });
    expect(race.applyResult(catalogue, races, commerce)).toMatchObject({
      status: "completed",
      prizeCake: 800,
      cakeBefore: 1_000,
      cakeAfter: 1_800,
    });
    expect(() => race.applyResult(catalogue, races, commerce)).toThrow(/already/);
    expect(commerce.cake).toBe(1_800);
  });
});