import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  advanceNativeRaceVehicleCollisions,
  readNativeRaceVehicleCollisionData,
} from "../src/game/nativeRaceVehicleCollision";
import {
  inverseNativeRaceMatrix,
  nativeRaceYawMatrix,
  transformNativeRaceVector,
  type NativeRaceVector,
} from "../src/game/nativeRaceMath";
import { createNativeRaceVehicleState } from "../src/game/nativeRaceVehicle";
import {
  readNativeRaceFrameData,
  type NativeRaceFrameState,
} from "../src/game/nativeRaceFrame";
import { palRaceVehicleCollisionOracle } from "../test-support/palRaceVehicleCollisionOracle";

const executablePath = process.env.RTA_PAL_EXECUTABLE;

function makeState(
  x: number,
  z: number,
  velocity: NativeRaceVector,
  carFlags: number,
  yaw: number,
  frameData: ReturnType<typeof readNativeRaceFrameData>,
): NativeRaceFrameState {
  const matrix = nativeRaceYawMatrix(
    Math.fround(Math.fround((yaw << 16 >> 16) * Math.PI) / 32768),
    frameData.math,
  );
  const fixed = (value: number) => Math.round(Math.fround(value * 32768)) | 0;
  const coordinates = [Math.fround(x), 0, Math.fround(z), 1] as const;
  const collisionHardpoints = frameData.contact.probes.slice(3, 7).map((probe) => {
    const transformed = transformNativeRaceVector(matrix, probe);
    return transformed.map((value, lane) =>
      Math.fround(value + coordinates[lane]!)) as unknown as NativeRaceVector;
  });
  return {
    vehicle: createNativeRaceVehicleState(yaw),
    contact: {
      position: [fixed(x), 0, fixed(z)],
      referenceY: 0,
      support: [4096, 4096, 4096],
      supportDelta: [0, 0, 0],
      impulses: [0, 0, 0],
      unsupportedTicks: 0,
      runtimeFlags: 0,
      specialState: 0,
      yaw,
    },
    velocity,
    previousVelocity: [0, 0, 0, 0],
    matrix,
    inverse: inverseNativeRaceMatrix(matrix),
    bodyMatrix: [...matrix],
    coordinates,
    collisionHardpoints,
    surfaces: Array(7).fill(0),
    carFlags,
    positionIndex: 0,
    distance: 0,
    countdownByte: 0,
    countdownHalf: 0,
    equipmentBoostState: 0,
    verticalControl: 0,
    shiftScheduleFlag: 0,
  };
}

describe.skipIf(!executablePath)("PAL dynamic race vehicle collisions", () => {
  test("pair admission and physical response match 0x218888 across deterministic randomized poses", () => {
    const executable = new Uint8Array(readFileSync(executablePath!));
    const data = readNativeRaceVehicleCollisionData(executable);
    const frameData = readNativeRaceFrameData(executable);
    const oracle = palRaceVehicleCollisionOracle(executable);
    let seed = 0x218888;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };

    for (let caseIndex = 0; caseIndex < 256; caseIndex += 1) {
      const x = Math.fround(((random() % 3201) - 1600) / 1000);
      const z = Math.fround(((random() % 3201) - 1600) / 1000);
      const first = makeState(0, 0, [
        random() % 20001 - 10000, random() % 2001 - 1000,
        random() % 20001 - 10000, random() | 0,
      ], 2, random() & 0xffff, frameData);
      const second = makeState(x, z, [
        random() % 20001 - 10000, random() % 2001 - 1000,
        random() % 20001 - 10000, random() | 0,
      ], 0x80, random() & 0xffff, frameData);
      const browser = advanceNativeRaceVehicleCollisions([
        { carIndex: 0, state: first },
        { carIndex: 1, state: second },
      ], 0, data);
      const native = oracle.run([
        {
          carIndex: 0,
          carFlags: first.carFlags,
          position: first.contact.position,
          velocity: first.velocity,
          coordinates: first.coordinates,
          inverse: first.inverse,
          hardpoints: first.collisionHardpoints,
        },
        {
          carIndex: 1,
          carFlags: second.carFlags,
          position: second.contact.position,
          velocity: second.velocity,
          coordinates: second.coordinates,
          inverse: second.inverse,
          hardpoints: second.collisionHardpoints,
        },
      ]);

      expect(
        browser.contacts.map((contact) => [contact.firstCarIndex, contact.secondCarIndex]),
        `case ${caseIndex} admission`,
      ).toEqual(native.eventPairs);
      for (const expected of native.cars) {
        const actual = browser.cars.find((car) => car.carIndex === expected.carIndex)!;
        expect(actual.state.contact.position, `case ${caseIndex} car ${expected.carIndex} position`)
          .toEqual(expected.position);
        expect(actual.state.velocity, `case ${caseIndex} car ${expected.carIndex} velocity`)
          .toEqual(expected.velocity);
      }
    }
  }, 60_000);

  test("retail constants retain the recovered broadphase, OBB and separation values", () => {
    const data = readNativeRaceVehicleCollisionData(new Uint8Array(readFileSync(executablePath!)));
    expect(data).toEqual({
      lateralMinimum: Math.fround(-0.9),
      lateralMaximum: Math.fround(0.9),
      forwardMinimum: -1.5,
      forwardMaximum: 1.5,
      broadphaseDistance: Math.fround(1.8),
      directSeparationDistance: Math.fround(0.9),
      minimumSeparationScale: Math.fround(0.01),
    });
  });
});
