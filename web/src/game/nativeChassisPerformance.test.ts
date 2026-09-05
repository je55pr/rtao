import { describe, expect, test } from "vitest";
import { nativeChassisForceResponseRatio, nativeChassisProfile } from "./nativeChassisPerformance";

describe("native PAL chassis weights", () => {
  test("preserves executable record names, prices and weight words", () => {
    expect(nativeChassisProfile(0)).toEqual({ selector: 0, name: "Normal Chassis", price: 200, weight: 25 });
    expect(nativeChassisProfile(1)).toEqual({ selector: 1, name: "Light Chassis", price: 500, weight: 22 });
    expect(nativeChassisProfile(2)).toEqual({ selector: 2, name: "Feather Chassis", price: 1_000, weight: 20 });
    expect(nativeChassisProfile(3)).toEqual({ selector: 3, name: "Phantom Chassis", price: 2_000, weight: 18 });
    expect(nativeChassisProfile(4)).toEqual({ selector: 4, name: "Hyper Chassis", price: 4_000, weight: 15 });
  });

  test("derives only the inverse-mass response used by the browser force bridge", () => {
    expect(nativeChassisForceResponseRatio(0)).toBe(1);
    expect(nativeChassisForceResponseRatio(1)).toBeCloseTo(25 / 22);
    expect(nativeChassisForceResponseRatio(2)).toBe(1.25);
    expect(nativeChassisForceResponseRatio(3)).toBeCloseTo(25 / 18);
    expect(nativeChassisForceResponseRatio(4)).toBeCloseTo(5 / 3);
  });

  test("rejects selectors outside the executable table", () => {
    expect(() => nativeChassisProfile(-1)).toThrow(RangeError);
    expect(() => nativeChassisProfile(5)).toThrow(RangeError);
    expect(() => nativeChassisProfile(1.5)).toThrow(RangeError);
  });
});
