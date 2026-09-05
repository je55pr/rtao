import { describe, expect, test } from "vitest";
import {
  nativeTyreGripMultiplier,
  nativeTyreGripProfile,
  nativeTyreRelativeGrip,
} from "./nativeTyrePerformance";

describe("native PAL tyre grip table", () => {
  test("preserves executable catalogue coefficients", () => {
    expect(nativeTyreGripProfile(0)).toMatchObject({ name: "Normal", dry: 196, offroad: 168, wet: 128, grass: 168, snow: 96, ice: 64 });
    expect(nativeTyreGripProfile(1)).toMatchObject({ name: "Sports", dry: 240, offroad: 196, wet: 154, grass: 160, snow: 96, ice: 64 });
    expect(nativeTyreGripProfile(7)).toMatchObject({ name: "Off Road", dry: 196, offroad: 196, wet: 160, grass: 160, snow: 128, ice: 64 });
    expect(nativeTyreGripProfile(11)).toMatchObject({ name: "Big", dry: 240, offroad: 240, wet: 230, grass: 210, snow: 196, ice: 96 });
    expect(nativeTyreGripProfile(12)).toMatchObject({ name: "Devil", dry: 65280, offroad: 65280, wet: 65280, grass: 65280, snow: 65280, ice: 65280 });
  });

  test("computes relative handling coefficients for all recovered native surfaces", () => {
    expect(nativeTyreRelativeGrip(0, "dry")).toBe(1);
    expect(nativeTyreRelativeGrip(1, "dry")).toBeCloseTo(240 / 196);
    expect(nativeTyreRelativeGrip(1, "offroad")).toBeCloseTo(196 / 168);
    expect(nativeTyreRelativeGrip(7, "dry")).toBe(1);
    expect(nativeTyreRelativeGrip(7, "offroad")).toBeCloseTo(196 / 168);
    expect(nativeTyreRelativeGrip(11, "grass")).toBeCloseTo(210 / 168);

    expect(nativeTyreGripMultiplier(1, "paved-road")).toBeCloseTo(240 / 196);
    expect(nativeTyreGripMultiplier(7, "dirt")).toBeCloseTo(196 / 168);
    expect(nativeTyreGripMultiplier(6, "wet")).toBeCloseTo(240 / 128);
    expect(nativeTyreGripMultiplier(7, "grass")).toBeCloseTo(160 / 168);
    expect(nativeTyreGripMultiplier(9, "snow")).toBeCloseTo(168 / 96);
    expect(nativeTyreGripMultiplier(9, "ice")).toBeCloseTo(196 / 64);
    expect(nativeTyreGripMultiplier(11, "other")).toBe(1);
  });

  test("rejects selectors outside the executable tyre catalogue", () => {
    expect(() => nativeTyreGripProfile(-1)).toThrow(RangeError);
    expect(() => nativeTyreGripProfile(13)).toThrow(RangeError);
    expect(() => nativeTyreGripProfile(1.5)).toThrow(RangeError);
  });
});
