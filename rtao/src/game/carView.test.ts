import { describe, expect, test } from "vitest";
import { nativeBigTyreBodyLift, nativeTyreBodyLift } from "./carView";

describe("native tyre ride height", () => {
  test("applies the PAL +0.85 chassis lift only to Big Tyre selector 11", () => {
    expect(nativeBigTyreBodyLift).toBeCloseTo(0.85, 8);
    expect(nativeTyreBodyLift(11)).toBeCloseTo(0.85, 8);
    for (const selector of [0, 1, 7, 10, 12]) expect(nativeTyreBodyLift(selector)).toBe(0);
    expect(() => nativeTyreBodyLift(255)).toThrow(RangeError);
    expect(() => nativeTyreBodyLift(-1)).toThrow(RangeError);
  });
});
