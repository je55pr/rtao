import * as THREE from "three";
import { describe, expect, test } from "vitest";
import {
  applyNativeBodyMatrixToObject,
  nativeBodyMatrixToRenderSpace,
  nativeBigTyreBodyLift,
  nativeTyreBodyLift,
} from "./carView";
import { nativeRaceBodyMatrix } from "./nativeRaceBody";

describe("native tyre ride height", () => {
  test("applies the PAL +0.85 chassis lift only to Big Tyre selector 11", () => {
    expect(nativeBigTyreBodyLift).toBeCloseTo(0.85, 8);
    expect(nativeTyreBodyLift(11)).toBeCloseTo(0.85, 8);
    for (const selector of [0, 1, 7, 10, 12]) expect(nativeTyreBodyLift(selector)).toBe(0);
    expect(() => nativeTyreBodyLift(255)).toThrow(RangeError);
    expect(() => nativeTyreBodyLift(-1)).toThrow(RangeError);
  });

  test("projects the recovered local body matrix into the rendered chassis transform", () => {
    const matrix = nativeRaceBodyMatrix([4608, 3584, 4352], 0x400, {
      bodySideDivisor: 32768,
      bodyForwardDivisor: 32768,
      bigTyreLift: Math.fround(0.85),
    });
    const chassis = new THREE.Group();
    applyNativeBodyMatrixToObject(chassis, matrix);
    chassis.updateMatrix();
    const renderMatrix = nativeBodyMatrixToRenderSpace(matrix);
    for (let lane = 0; lane < 16; lane += 1) {
      expect(chassis.matrix.elements[lane]).toBeCloseTo(renderMatrix[lane]!, 6);
    }
    expect(chassis.position.y).toBeCloseTo(matrix[13]!, 7);
    expect(renderMatrix[4]).toBeCloseTo(-matrix[4]!, 8);
    expect(renderMatrix[6]).toBeCloseTo(matrix[6]!, 8);
  });

  test("rejects malformed presentation matrices", () => {
    expect(() => applyNativeBodyMatrixToObject(new THREE.Group(), [1, 0, 0])).toThrow(RangeError);
  });
});
