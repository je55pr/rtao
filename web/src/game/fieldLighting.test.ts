import { describe, expect, it } from "vitest";
import {
  fieldAlphaSourceFactor,
  fieldAtmosphereSourceFactor,
  fieldFogSourceFactor,
  authenticFieldVisibilityProfile,
  hg2DayUnits,
  hg2TimeUnits,
  outdoorFogColor,
  outdoorLightingWeights,
  visibilityProfile,
} from "./fieldLighting";

describe("HG2 outdoor lighting", () => {
  it("uses the recovered 216000-unit clock", () => {
    expect(hg2DayUnits).toBe(216_000);
    expect(hg2TimeUnits(1)).toBe(9_000);
    expect(hg2TimeUnits(24)).toBe(0);
  });

  it("uses the executable's 1.1 stable field-light endpoints", () => {
    expect(outdoorLightingWeights(hg2TimeUnits(3))).toEqual({ day: 0, warm: 0, night: 1.1 });
    expect(outdoorLightingWeights(hg2TimeUnits(12))).toEqual({ day: 1.1, warm: 0, night: 0 });
    expect(outdoorLightingWeights(hg2TimeUnits(20))).toEqual({ day: 0, warm: 0, night: 1.1 });
  });

  it("keeps the executable's 0.1 overlap through dawn, sunset and dusk", () => {
    const dawn = outdoorLightingWeights(hg2TimeUnits(6));
    expect(dawn.day).toBeCloseTo(0.5);
    expect(dawn.warm).toBe(0);
    expect(dawn.night).toBeCloseTo(0.6);

    const sunset = outdoorLightingWeights(hg2TimeUnits(17, 30));
    expect(sunset.day).toBeCloseTo(0.6);
    expect(sunset.warm).toBeCloseTo(0.5);
    expect(sunset.night).toBe(0);

    const duskStart = outdoorLightingWeights(hg2TimeUnits(18));
    expect(duskStart.day).toBe(0);
    expect(duskStart.warm).toBeCloseTo(1.0);
    expect(duskStart.night).toBeCloseTo(0.1);

    const dusk = outdoorLightingWeights(hg2TimeUnits(18, 15));
    expect(dusk.day).toBe(0);
    expect(dusk.warm).toBeCloseTo(0.5);
    expect(dusk.night).toBeCloseTo(0.6);
  });

  it("uses recovered FOGCOL endpoints and dawn blue ramp", () => {
    expect(outdoorFogColor(hg2TimeUnits(3))).toEqual({ r: 0, g: 0, b: 8 });
    expect(outdoorFogColor(hg2TimeUnits(6))).toEqual({ r: 128, g: 128, b: 255 });
    expect(outdoorFogColor(hg2TimeUnits(12))).toEqual({ r: 255, g: 255, b: 255 });
    expect(outdoorFogColor(hg2TimeUnits(18))).toEqual({ r: 255, g: 161, b: 127 });
    expect(outdoorFogColor(hg2TimeUnits(18, 15))).toEqual({ r: 128, g: 80, b: 64 });
  });

  it("keeps authentic visibility optional", () => {
    expect(visibilityProfile("authentic")).toEqual({ mode: "authentic", fogFullDistance: 290, alphaFullDistance: 544, farDistance: 800 });
    expect(visibilityProfile("extended").farDistance).toBeGreaterThan(800);
    expect(visibilityProfile("unlimited")).toEqual({ mode: "unlimited", fogFullDistance: null, alphaFullDistance: null, farDistance: null });
  });

  it("matches the recovered stable memory-21 VU fog and alpha ramps", () => {
    const authentic = authenticFieldVisibilityProfile(hg2TimeUnits(12), true);
    expect(fieldFogSourceFactor(290, authentic)).toBe(1);
    expect(fieldFogSourceFactor(544, authentic)).toBeCloseTo(256 / 510, 6);
    expect(fieldFogSourceFactor(800, authentic)).toBe(0);
    expect(fieldAlphaSourceFactor(544, authentic)).toBe(1);
    expect(fieldAlphaSourceFactor(672, authentic)).toBeCloseTo(0.5, 6);
    expect(fieldAlphaSourceFactor(800, authentic)).toBe(0);
    expect(fieldAtmosphereSourceFactor(672, authentic)).toBeCloseTo((128 / 510) * 0.5, 6);
  });

  it("uses the recovered deep-night memory-20 range", () => {
    expect(authenticFieldVisibilityProfile(hg2TimeUnits(22), false)).toEqual({
      mode: "authentic",
      fogFullDistance: 45,
      alphaFullDistance: 172,
      farDistance: 300,
    });
  });

  it("interpolates memory-20 through the dusk overlap while memory-21 stays long", () => {
    const dynamic = authenticFieldVisibilityProfile(hg2TimeUnits(18), false);
    expect(dynamic.farDistance).toBeCloseTo(754.5454545, 6);
    expect(dynamic.fogFullDistance).toBeCloseTo(287.0454545, 6);
    expect(dynamic.alphaFullDistance).toBeCloseTo(519.8787879, 6);
    expect(authenticFieldVisibilityProfile(hg2TimeUnits(18), true)).toEqual({
      mode: "authentic", fogFullDistance: 290, alphaFullDistance: 544, farDistance: 800,
    });
  });
});
