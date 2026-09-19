import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ChoroCoinPlacement } from "../formats/choroCoins";
import { bleedTransparentTextureRgb, dynamicObjectPhaseSeed, fieldMaterialRenderPolicy, horizontalBoundsWithinDistance, nativeFourthColumnToRenderColumn, visibleChoroCoinPlacements } from "./worldView";

describe("native field-object fourth-column reflection", () => {
  it("preserves homogeneous w while reflecting native field X", () => {
    expect(nativeFourthColumnToRenderColumn([765.77, 40.63, 1207.7, 1])).toEqual([834.23, 40.63, 1207.7, 1]);
    const papayaMesh0 = nativeFourthColumnToRenderColumn([1057.65, 1010.45, 1070, 1015]);
    expect(papayaMesh0[0]).toBeCloseTo(1600 * 1015 - 1057.65);
    expect(papayaMesh0.slice(1)).toEqual([1010.45, 1070, 1015]);

    const peachMesh0 = nativeFourthColumnToRenderColumn([1053.5, 1014.0, 1054.9000244, 1015.5999756]);
    expect(peachMesh0[0]).toBeCloseTo(1600 * 1015.5999756 - 1053.5);
    expect(peachMesh0.slice(1)).toEqual([1014.0, 1054.9000244, 1015.5999756]);
  });
});

describe("field texture alpha-edge colour bleed", () => {
  it("replaces hidden transparent RGB without changing PAL alpha", () => {
    const source = new Uint8Array([
      10, 200, 20, 255,
      240, 250, 255, 0,
      250, 250, 250, 0,
    ]);
    expect([...bleedTransparentTextureRgb(source, 3, 1)]).toEqual([
      10, 200, 20, 255,
      10, 200, 20, 0,
      10, 200, 20, 0,
    ]);
    expect([...source]).toEqual([
      10, 200, 20, 255,
      240, 250, 255, 0,
      250, 250, 250, 0,
    ]);
  });

  it("treats authored partial-alpha colour as visible source data", () => {
    const source = new Uint8Array([
      80, 60, 40, 64,
      255, 255, 255, 0,
    ]);
    expect([...bleedTransparentTextureRgb(source, 2, 1)]).toEqual([
      80, 60, 40, 64,
      80, 60, 40, 0,
    ]);
  });
});

describe("authentic field render queues", () => {
  it("keeps the passing-alpha pass opaque and depth-writing", () => {
    expect(fieldMaterialRenderPolicy("authentic-depth", true)).toEqual({
      transparent: false,
      depthWrite: true,
      forceSinglePass: false,
      alphaTest: 1 / 255,
      alphaToCoverage: true,
    });
  });

  it("keeps only the RGB_ONLY fallback transparent and single-submission", () => {
    expect(fieldMaterialRenderPolicy("authentic-rgb", true)).toEqual({
      transparent: true,
      depthWrite: false,
      forceSinglePass: true,
      alphaTest: 0,
      alphaToCoverage: false,
    });
  });
});

describe("outdoor visibility culling", () => {
  const bounds = new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(1600, 1600));

  it("keeps a sector whose compiled bounds intersect the active range", () => {
    expect(horizontalBoundsWithinDistance(bounds, 1600, 0, 1500, 800, 800)).toBe(true);
  });

  it("rejects a sector wholly beyond the active range", () => {
    expect(horizontalBoundsWithinDistance(bounds, 3200, 0, 800, 800, 800)).toBe(false);
  });
});

describe("field dynamic-object animation phase", () => {
  it("keeps PAL-proven palm crown instances in sway synchrony", () => {
    const first = dynamicObjectPhaseSeed("palm-crown", { x: 12, z: 34 }, 0);
    const distant = dynamicObjectPhaseSeed("palm-crown", { x: 1383, z: 1365 }, 105);

    expect(first).toBe(0);
    expect(distant).toBe(first);
  });

  it("preserves host-derived per-instance variation for turbine rotors", () => {
    const first = dynamicObjectPhaseSeed("turbine-rotor", { x: 12, z: 34 }, 0);
    const second = dynamicObjectPhaseSeed("turbine-rotor", { x: 20, z: 40 }, 1);

    expect(first).toBeCloseTo(12 * 0.011 + 34 * 0.007);
    expect(second).toBeCloseTo(0.73 + 20 * 0.011 + 40 * 0.007);
    expect(second).not.toBe(first);
  });
});

describe("ChoroQ coin presentation selection", () => {
  const placements: ChoroCoinPlacement[] = [
    { index: 2, areaCode: 7, fieldNumber: 13, sourcePosition: { x: 100, y: 25.5, z: 48 } },
    { index: 3, areaCode: 7, fieldNumber: 13, sourcePosition: { x: 110, y: 25.5, z: 48 } },
    { index: 4, areaCode: 6, fieldNumber: 12, sourcePosition: { x: 120, y: 20.5, z: 48 } },
  ];

  it("renders only uncollected placements belonging to the loaded field", () => {
    expect(visibleChoroCoinPlacements(placements, 13, new Set([2]))).toEqual([placements[1]]);
    expect(visibleChoroCoinPlacements(placements, 12, new Set())).toEqual([placements[2]]);
  });
});
