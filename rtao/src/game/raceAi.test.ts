import { describe, expect, test } from "vitest";
import { nativeRaceAiCommands, nativeRaceAtan2, nativeRaceTargetAngles } from "./raceAi";
import type { NativeRaceAiCar, NativeRaceAiMemory } from "./raceAi";

const car = { nativeSpeed: 0, nativeYaw: 0, steeringEnabled: true, speedLimit: 0 };
const context = { sceneFlags: 4, updateSpeedFeedback: false };
const aligned = { low: 0, high: 0 };
const memory = (): NativeRaceAiMemory => ({ speedTargets: new Uint8Array(256), speedFeedback: new Uint8Array(256) });
const speedForBucket = (bucket: number): number => Math.ceil(bucket * 0x28000 / 216);

describe("PAL ordinary-race AI", () => {
  test("accelerates, coasts for one speed bucket, then brakes", () => {
    const buffers = memory();
    buffers.speedTargets[4] = 20;
    for (const [bucket, commandMask] of [[19, 9], [20, 9], [21, 0], [22, 2]]) {
      const result = nativeRaceAiCommands({ ...car, nativeSpeed: speedForBucket(bucket!) }, context, buffers, 4, 5, aligned);
      expect(result).toEqual({ commandMask, speedBucket: bucket, nativeYaw: 0 });
      expect(buffers.speedFeedback[4]).toBe(0x40 | bucket!);
    }
  });

  test("the finer speed limiter suppresses demand without adding acceleration", () => {
    const buffers = memory();
    buffers.speedTargets[4] = 10;
    expect(nativeRaceAiCommands({ ...car, nativeSpeed: speedForBucket(20), speedLimit: 100 }, context, buffers, 4, 5, aligned).commandMask).toBe(2);
    buffers.speedTargets[4] = 0;
    for (const [fineBucket, expected] of [[20, 9], [21, 0], [22, 0], [23, 2]]) {
      expect(nativeRaceAiCommands({ ...car, nativeSpeed: Math.ceil(fineBucket! * 0x14000 / 216), speedLimit: 20 }, context, buffers, 4, 5, aligned).commandMask).toBe(expected);
    }
  });

  test("preserves steering thresholds, wrapped yaw, and the native low-angle asymmetry", () => {
    const buffers = memory();
    const run = (low: number, high: number, override: Partial<NativeRaceAiCar> = {}) =>
      nativeRaceAiCommands({ ...car, ...override }, context, buffers, 4, 5, { low: low & 65535, high: high & 65535 });
    expect(run(16384, 17000).commandMask).toBe(0x2001);
    expect(run(16385, 17000)).toMatchObject({ commandMask: 1, nativeYaw: 256 });
    expect(run(-16384, -17000).commandMask).toBe(0x8001);
    expect(run(-16385, -17000)).toMatchObject({ commandMask: 1, nativeYaw: 65280 });
    expect(run(1, 2, { steeringEnabled: false }).commandMask).toBe(1);
    expect(run(0, 1, { nativeYaw: 65535 }).commandMask).toBe(0x2001);
  });

  test("ordinary opponents leave targets untouched while teammates adapt them", () => {
    const buffers = memory();
    buffers.speedTargets[4] = 30;
    buffers.speedFeedback[4] = 25;
    buffers.speedFeedback[5] = 0x80 | 20;
    nativeRaceAiCommands(car, context, buffers, 4, 5, aligned);
    expect(buffers.speedTargets[4]).toBe(30);
    buffers.speedFeedback[4] = 25;
    nativeRaceAiCommands(car, { ...context, updateSpeedFeedback: true }, buffers, 4, 5, aligned);
    expect(buffers.speedTargets[4]).toBe(24);
    expect(buffers.speedFeedback[5]).toBe(20);
    buffers.speedFeedback[4] = 25;
    buffers.speedFeedback[5] = 0x40 | 20;
    nativeRaceAiCommands(car, { ...context, updateSpeedFeedback: true }, buffers, 4, 5, aligned);
    expect(buffers.speedTargets[4]).toBe(26);
  });

  test("records only speed buckets 2 through 62 in the feedback byte", () => {
    for (const bucket of [0, 1, 2, 62, 63, 127]) {
      const buffers = memory();
      nativeRaceAiCommands({ ...car, nativeSpeed: speedForBucket(bucket) }, context, buffers, 0, 1, aligned);
      expect(buffers.speedFeedback[0]).toBe(0x40 | (bucket >= 2 && bucket <= 62 ? bucket : 0));
    }
  });

  test("narrows endpoint corridors by configuration low bits without changing the authored midpoint", () => {
    const gate = { gateIndex: 0, endpointA: { nativeX: -10, nativeZ: 10 }, endpointB: { nativeX: 10, nativeZ: 10 }, branchPoint: { nativeX: 0, nativeZ: 10 } };
    expect(nativeRaceTargetAngles(gate, 0, 0, 0)).toEqual({ low: 8192, high: 57344 });
    expect(nativeRaceTargetAngles(gate, 0, 0, 1)).toEqual({ low: 8192, high: 0 });
    expect(nativeRaceTargetAngles(gate, 0, 0, 2)).toEqual({ low: 0, high: 57344 });
    expect(nativeRaceTargetAngles(gate, 0, 0, 3)).toEqual(nativeRaceTargetAngles(gate, 0, 0, 0));
  });

  test("uses the executable's axis/signed-zero angles and rejects invalid native widths", () => {
    expect(nativeRaceAtan2(0, -1)).toBe(3.141592502593994);
    expect(nativeRaceAtan2(-0, -1)).toBe(-3.141592502593994);
    expect(nativeRaceAtan2(1, 0)).toBe(1.5707963705062866);
    expect(() => nativeRaceAiCommands({ ...car, nativeSpeed: 1.5 }, context, memory(), 0, 1, aligned)).toThrow(/widths/);
    expect(() => nativeRaceAiCommands(car, context, memory(), 256, 1, aligned)).toThrow(/widths/);
  });
});
