import { describe, expect, test } from "vitest";
import { createNativeChaseCameraState } from "./nativeChaseCamera";
import {
  advanceNativeCameraWorldTransform,
  rotateNativeCameraXZ,
} from "./nativeCameraWorldTransform";
import type { NativeRaceMathData } from "./nativeRaceMath";

const math: NativeRaceMathData = {
  rotationCoefficients: [
    Math.fround(1 / 362_880),
    Math.fround(-1 / 5_040),
    Math.fround(1 / 120),
    Math.fround(-1 / 6),
  ],
  normalYThreshold: 0.5,
  normalYIncrement: 0.1,
};

describe("native camera world transform", () => {
  test("matches the helper's manual X/Z signed-angle convention", () => {
    const quarter = rotateNativeCameraXZ([1, 2, 0, 0], 0x4000);
    expect(quarter[0]).toBeCloseTo(0, 6);
    expect(quarter[1]).toBe(2);
    expect(quarter[2]).toBeCloseTo(1, 6);
  });

  test("preset mode zero advances only the +0x08/+0x0C lag pair", () => {
    let state = createNativeChaseCameraState(0);
    const input = {
      sourceVector: [0, 1, 0.005, 0] as const,
      offset50: 0,
      offset58: 99,
      nativeYaw: 0,
    };
    for (let tick = 0; tick < 3; tick += 1) {
      const result = advanceNativeCameraWorldTransform(state, input, math);
      state = result.controller;
      expect(result.orientationMatrix).toHaveLength(16);
      expect(result.auxiliaryMatrix).toHaveLength(16);
    }
    expect(state.lagX).toEqual({ value: 0, velocity: 0 });
    expect(state.lagZ.value).toBeCloseTo(Math.fround(0.005), 9);
  });

  test("preset mode one advances both recovered lag pairs", () => {
    const state = createNativeChaseCameraState(1);
    const result = advanceNativeCameraWorldTransform(state, {
      sourceVector: [0.005, 1, -0.005, 0],
      offset50: 0.25,
      offset58: -0.5,
      nativeYaw: 0,
    }, math);
    expect(result.controller.lagX).toEqual({
      value: Math.fround(0.001),
      velocity: Math.fround(0.001),
    });
    expect(result.controller.lagZ).toEqual({
      value: Math.fround(-0.001),
      velocity: Math.fround(-0.001),
    });
  });
});
