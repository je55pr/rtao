import { describe, expect, test } from "vitest";
import type { NativeRaceFrameState } from "./nativeRaceFrame";
import { nativeRaceIdentity, transformNativeRaceVector } from "./nativeRaceMath";
import { createNativeRaceVehicleState } from "./nativeRaceVehicle";
import {
  advanceNativeRaceVehicleCollisions,
  type NativeRaceVehicleCollisionData,
} from "./nativeRaceVehicleCollision";

const data: NativeRaceVehicleCollisionData = {
  lateralMinimum: Math.fround(-0.9),
  lateralMaximum: Math.fround(0.9),
  forwardMinimum: -1.5,
  forwardMaximum: 1.5,
  broadphaseDistance: Math.fround(1.8),
  directSeparationDistance: Math.fround(0.9),
  minimumSeparationScale: Math.fround(0.01),
};

function state(
  x: number,
  z: number,
  velocity: readonly [number, number, number, number] = [0, 0, 0, 0],
  carFlags = 0x80,
): NativeRaceFrameState {
  const fixed = (value: number) => Math.round(value * 32768) | 0;
  const identity = nativeRaceIdentity();
  return {
    vehicle: createNativeRaceVehicleState(0),
    contact: {
      position: [fixed(x), 0, fixed(z)],
      referenceY: 0,
      support: [4096, 4096, 4096],
      supportDelta: [0, 0, 0],
      impulses: [0, 0, 0],
      unsupportedTicks: 0,
      runtimeFlags: 0,
      specialState: 0,
      yaw: 0,
    },
    velocity: [...velocity],
    previousVelocity: [0, 0, 0, 0],
    matrix: identity,
    inverse: [...identity],
    bodyMatrix: [...identity],
    coordinates: [Math.fround(x), 0, Math.fround(z), 1],
    collisionHardpoints: [
      [Math.fround(x - 0.9), 0, Math.fround(z + 1.5), 1],
      [Math.fround(x + 0.9), 0, Math.fround(z + 1.5), 1],
      [Math.fround(x - 0.9), 0, Math.fround(z - 1.5), 1],
      [Math.fround(x + 0.9), 0, Math.fround(z - 1.5), 1],
    ],
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

function quarterTurnState(x: number, z: number): NativeRaceFrameState {
  const base = state(x, z);
  const matrix = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
  const inverse = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];
  const local = [
    [-0.9, 0, 1.5, 0], [0.9, 0, 1.5, 0], [-0.9, 0, -1.5, 0], [0.9, 0, -1.5, 0],
  ] as const;
  const collisionHardpoints = local.map((point) => {
    const rotated = transformNativeRaceVector(matrix, point);
    return [
      Math.fround(rotated[0] + x), rotated[1], Math.fround(rotated[2] + z), 1,
    ] as const;
  });
  return { ...base, matrix, inverse, collisionHardpoints };
}

function run(cars: readonly { carIndex: number; state: NativeRaceFrameState }[], sceneFlags = 0) {
  return advanceNativeRaceVehicleCollisions(cars, sceneFlags, data);
}

describe("native race vehicle collision task", () => {
  test("player-to-AI contact separates fixed positions and shares X/Z velocity", () => {
    const actual = run([
      { carIndex: 0, state: state(0, 0, [1000, 10, 4000, 7], 2) },
      { carIndex: 1, state: state(1, 0, [-500, 20, -2000, 9]) },
    ]);
    expect(actual.contacts).toHaveLength(1);
    expect(actual.contacts[0]).toMatchObject({
      firstCarIndex: 0,
      secondCarIndex: 1,
      firstContainsSecondPoint: true,
    });
    expect(actual.cars[0]!.state.contact.position).toEqual([-328, 0, 0]);
    expect(actual.cars[1]!.state.contact.position).toEqual([33096, 0, 0]);
    expect(actual.cars[0]!.state.velocity).toEqual([250, 10, 1000, 7]);
    expect(actual.cars[1]!.state.velocity).toEqual([250, 20, 1000, 9]);
  });

  test("AI-to-AI contact is native and direct overlap uses the PAL separation scalar", () => {
    const actual = run([
      { carIndex: 4, state: state(0, 0, [700, 3, 0, 0]) },
      { carIndex: 9, state: state(0.5, 0, [-100, 4, 0, 0]) },
    ]);
    expect(actual.contacts.map((contact) => [contact.firstCarIndex, contact.secondCarIndex])).toEqual([[4, 9]]);
    expect(actual.cars[0]!.state.contact.position[0]).toBe(-13107);
    expect(actual.cars[1]!.state.contact.position[0]).toBe(29491);
    expect(actual.cars[0]!.state.velocity[0]).toBe(300);
    expect(actual.cars[1]!.state.velocity[0]).toBe(300);
  });

  test("inactive, coincident, broadphase-boundary and gated pairs remain untouched", () => {
    expect(run([
      { carIndex: 0, state: state(0, 0, [10, 0, 20, 0], 0) },
      { carIndex: 1, state: state(1, 0) },
    ]).contacts).toEqual([]);
    expect(run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 1, state: state(0, 0) },
    ]).contacts).toEqual([]);
    expect(run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 1, state: state(1.81, 0) },
    ]).contacts).toEqual([]);
    const gated = run([
      { carIndex: 0, state: state(0, 0, [100, 0, 200, 0], 2) },
      { carIndex: 1, state: state(1, 0, [-100, 0, -200, 0]) },
    ], 0x48000);
    expect(gated.contacts).toEqual([]);
    expect(gated.cars[0]!.state.contact.position).toEqual([0, 0, 0]);
    expect(gated.cars[0]!.state.velocity).toEqual([100, 0, 200, 0]);
  });

  test("rear-end, side-swipe and glancing admissions use the oriented footprint rather than a sphere", () => {
    const rear = run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 1, state: state(0, 1.7) },
    ]);
    expect(rear.contacts).toHaveLength(1);

    const side = run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 1, state: state(1.6, 0) },
    ]);
    expect(side.contacts).toHaveLength(1);

    const perpendicular = run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 1, state: quarterTurnState(0.1, 0) },
    ]);
    expect(perpendicular.contacts).toHaveLength(0);

    const glancing = run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 1, state: state(1.4, 1) },
    ]);
    expect(glancing.contacts).toHaveLength(1);
  });

  test("ascending pair order is deterministic in a three-car pack", () => {
    const actual = run([
      { carIndex: 2, state: state(2, 0, [900, 0, 0, 0]) },
      { carIndex: 0, state: state(0, 0, [100, 0, 0, 0], 2) },
      { carIndex: 1, state: state(1, 0, [500, 0, 0, 0]) },
    ]);
    expect(actual.contacts.map((contact) => [contact.firstCarIndex, contact.secondCarIndex])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(actual.cars.map((car) => car.carIndex)).toEqual([0, 1, 2]);
    expect(actual.cars[0]!.state.velocity[0]).toBe(300);
    expect(actual.cars[1]!.state.velocity[0]).toBe(600);
    expect(actual.cars[2]!.state.velocity[0]).toBe(600);
  });

  test("invalid slot ownership is rejected instead of silently reordering aliases", () => {
    expect(() => run([
      { carIndex: 0, state: state(0, 0) },
      { carIndex: 0, state: state(1, 0) },
    ])).toThrow(/unique car slots/);
  });
});
