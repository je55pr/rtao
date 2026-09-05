import { describe, expect, test } from "vitest";
import {
  nativeBrakeCurveValue,
  nativeBrakeForceFraction,
  nativeBrakeForceUnits,
  nativeBrakeHoldUpdates,
  nativeBrakeProfile,
} from "./nativeBrakePerformance";

describe("native PAL brake hold curves", () => {
  test("preserves the four executable records and metadata", () => {
    expect(nativeBrakeHoldUpdates).toBe(32);
    expect(nativeBrakeProfile(0)).toMatchObject({ name: "Normal Pad", description: "Standard", price: 500 });
    expect(nativeBrakeProfile(1)).toMatchObject({ name: "Soft Pad", description: "Good for quick braking", price: 1_000 });
    expect(nativeBrakeProfile(2)).toMatchObject({ name: "Hard Pad", description: "Helps for all around cornering", price: 1_500 });
    expect(nativeBrakeProfile(3)).toMatchObject({ name: "Metal Pad", description: "Stops on a dime", price: 2_000 });
    expect(nativeBrakeProfile(0).curve).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
    expect(nativeBrakeProfile(1).curve.slice(0, 4)).toEqual([4, 7, 10, 12]);
    expect(nativeBrakeProfile(2).curve.slice(0, 4)).toEqual([0, 1, 1, 1]);
    expect(nativeBrakeProfile(3).curve.slice(12, 17)).toEqual([8, 10, 13, 16, 20]);
  });

  test("reads after increment and saturates on the 32nd sample", () => {
    expect(nativeBrakeCurveValue(1, 1)).toBe(4);
    expect(nativeBrakeCurveValue(1, 32)).toBe(32);
    expect(nativeBrakeCurveValue(1, 100)).toBe(32);
    expect(nativeBrakeForceUnits(0, 1)).toBe(312);
    expect(nativeBrakeForceUnits(1, 1)).toBe(1_250);
    expect(nativeBrakeForceFraction(3, 16)).toBe(0.5);
  });

  test("rejects impossible selectors and inactive hold counts", () => {
    expect(() => nativeBrakeProfile(-1)).toThrow(RangeError);
    expect(() => nativeBrakeProfile(4)).toThrow(RangeError);
    expect(() => nativeBrakeCurveValue(0, 0)).toThrow(RangeError);
    expect(() => nativeBrakeCurveValue(0, 1.5)).toThrow(RangeError);
  });
});
