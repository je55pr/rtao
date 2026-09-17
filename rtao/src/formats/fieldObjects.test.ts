import { describe, expect, it } from "vitest";
import { fieldObjectSectionTransforms, findPalmCrownAnchors, findTurbineAnchors, nativeFieldCentreNeighbourTranslationIndex, papayaFieldObjectPlacement, papayaSectionTransforms, peachFieldObjectPlacement, staticFieldObjectPlacementForField } from "./fieldObjects";
import type { FieldRenderPrimitive } from "./fieldGeometry";

interface FakeSpec {
  center: [number, number];
  base: number;
  top: number;
  footprint: number;
  tex: number;
  billboard?: boolean;
}

function primitive(spec: FakeSpec): FieldRenderPrimitive {
  const [cx, cz] = spec.center;
  const half = spec.footprint / 2;
  const corners: [number, number][] = [
    [cx - half, cz - half], [cx + half, cz - half],
    [cx - half, cz + half], [cx + half, cz + half],
    [cx - half, cz], [cx + half, cz],
  ];
  const vertices = corners.flatMap(([x, z]) => [
    { position: { x, y: spec.base, z } },
    { position: { x, y: spec.top, z } },
  ]);
  return {
    vertices,
    placementOffset: spec.billboard ? { x: cx, y: 0, z: cz } : undefined,
    material: { tex0: { textureBasePointer: spec.tex, width: 64, height: 64, pixelStorageFormat: 20 } },
  } as unknown as FieldRenderPrimitive;
}

describe("findTurbineAnchors", () => {
  it("returns each tall narrow shaft top in the dominant family, X reflected", () => {
    const towers: FieldRenderPrimitive[] = [];
    for (let i = 0; i < 6; i += 1) {
      towers.push(primitive({ center: [400 + i * 40, 700], base: 90, top: 160, footprint: 4, tex: 13787 }));
    }
    // decoys: a short prop, a wide building, a low pole, a different-material shaft
    const decoys = [
      primitive({ center: [500, 500], base: 0, top: 12, footprint: 4, tex: 13787 }),
      primitive({ center: [600, 500], base: 40, top: 130, footprint: 40, tex: 13787 }),
      primitive({ center: [700, 500], base: 0, top: 60, footprint: 4, tex: 13787 }),
      primitive({ center: [800, 500], base: 90, top: 160, footprint: 4, tex: 99999 }),
    ];

    const anchors = findTurbineAnchors([...decoys, ...towers]);
    expect(anchors).toHaveLength(6);
    for (const anchor of anchors) {
      expect(anchor.y).toBe(160);
      expect(anchor.z).toBeCloseTo(700);
    }
    // X reflected around 1600
    const reflected = anchors.map((a) => a.x).sort((a, b) => a - b);
    expect(reflected[0]).toBeCloseTo(1600 - (400 + 5 * 40));
    expect(reflected[5]).toBeCloseTo(1600 - 400);
  });

  it("ignores fields with fewer than four matching shafts", () => {
    expect(findTurbineAnchors([
      primitive({ center: [400, 700], base: 90, top: 160, footprint: 4, tex: 13787 }),
      primitive({ center: [440, 700], base: 90, top: 160, footprint: 4, tex: 13787 }),
    ])).toHaveLength(0);
  });

  it("ignores billboard primitives", () => {
    const billboards = Array.from({ length: 6 }, (_, i) =>
      primitive({ center: [400 + i * 40, 700], base: 90, top: 160, footprint: 4, tex: 13787, billboard: true }));
    expect(findTurbineAnchors(billboards)).toHaveLength(0);
  });
});

describe("findPalmCrownAnchors", () => {
  it("returns the dominant small near-horizontal cap family, X reflected", () => {
    const caps: FieldRenderPrimitive[] = [];
    for (let i = 0; i < 8; i += 1) {
      caps.push(primitive({ center: [200 + i * 15, 550], base: 10, top: 10.05, footprint: 0.35, tex: 10737 }));
    }
    const decoys = [
      // a tall shaft, a big roof, a ground quad, a different cap material
      primitive({ center: [300, 400], base: 10, top: 90, footprint: 0.4, tex: 10737 }),
      primitive({ center: [320, 400], base: 10, top: 10.1, footprint: 6, tex: 10737 }),
      primitive({ center: [340, 400], base: 0, top: 0.1, footprint: 0.3, tex: 10737 }),
      primitive({ center: [360, 400], base: 10, top: 10.05, footprint: 0.35, tex: 42424 }),
    ];
    const anchors = findPalmCrownAnchors([...decoys, ...caps]);
    expect(anchors).toHaveLength(8);
    for (const anchor of anchors) {
      expect(anchor.y).toBeCloseTo(10.025);
      expect(anchor.z).toBeCloseTo(550);
    }
    expect(Math.min(...anchors.map((a) => a.x))).toBeCloseTo(1600 - (200 + 7 * 15));
  });

  it("returns nothing when there is no cap family", () => {
    expect(findPalmCrownAnchors([
      primitive({ center: [200, 550], base: 10, top: 90, footprint: 4, tex: 13787 }),
    ])).toHaveLength(0);
  });
});


describe("FLD/223 giant Peach placement", () => {
  it("locks the PAL-authored field, Extra[1], centre neighbour and sparse submission mapping", () => {
    expect(peachFieldObjectPlacement.fieldNumber).toBe(223);
    expect(peachFieldObjectPlacement.extraIndex).toBe(1);
    expect(peachFieldObjectPlacement.neighbourSelector).toBe(3);
    expect(peachFieldObjectPlacement.sections.map((section) => section.meshIndex)).toEqual([0, 2]);
    expect(staticFieldObjectPlacementForField(223)).toBe(peachFieldObjectPlacement);
  });

  it("preserves the exact recovered source fourth columns, including non-affine w", () => {
    expect(peachFieldObjectPlacement.sections.map((section) => section.source)).toEqual([
      [1053.5, 1014.0, 1054.9000244, 1015.5999756],
      [437.5, 30.2000008, 535.0, 1.0],
    ]);
    expect(fieldObjectSectionTransforms(peachFieldObjectPlacement)).toEqual([
      { meshIndex: 0, fourthColumn: [1053.5, 1014.0, 1054.9000244, 1015.5999756] },
      { meshIndex: 2, fourthColumn: [437.5, 30.2000008, 535.0, 1.0] },
    ]);
  });

  it("keeps sparse mesh selection while applying native neighbour translation lane-wise", () => {
    const northWest = fieldObjectSectionTransforms(peachFieldObjectPlacement, 0);
    expect(northWest.map((section) => section.meshIndex)).toEqual([0, 2]);
    expect(northWest[0]!.fourthColumn).toEqual([253.5, 1014.0, 2654.9000244, 1015.5999756]);
    expect(northWest[1]!.fourthColumn).toEqual([-362.5, 30.2000008, 2135.0, 1.0]);
  });
});


describe("FLD/233 giant Papaya placement", () => {
  it("locks the PAL-authored field, Extra[1], neighbour slot and three-mesh mapping", () => {
    expect(papayaFieldObjectPlacement.fieldNumber).toBe(233);
    expect(papayaFieldObjectPlacement.extraIndex).toBe(1);
    expect(papayaFieldObjectPlacement.neighbourSelector).toBe(3);
    expect(papayaFieldObjectPlacement.sections.map((section) => section.meshIndex)).toEqual([0, 1, 2]);
  });

  it("reconstructs the exact native fourth columns in the field-local centre copy", () => {
    expect(nativeFieldCentreNeighbourTranslationIndex).toBe(3);
    expect(papayaSectionTransforms(nativeFieldCentreNeighbourTranslationIndex)).toEqual([
      { meshIndex: 0, fourthColumn: [1057.65, 1010.45, 1070, 1015] },
      { meshIndex: 1, fourthColumn: [765.77, 40.63, 1207.7, 1] },
      { meshIndex: 2, fourthColumn: [1107.8, 40.38, 875.43, 1] },
    ]);
  });

  it("adds the recovered 0x2A2430 neighbour vector lane-wise", () => {
    const northWest = papayaSectionTransforms(0)[1]!;
    expect(northWest.meshIndex).toBe(1);
    northWest.fourthColumn.forEach((value, index) => expect(value).toBeCloseTo([-34.23, 40.63, 2807.7, 1][index]!));

    const southEast = papayaSectionTransforms(6)[2]!;
    expect(southEast.meshIndex).toBe(2);
    southEast.fourthColumn.forEach((value, index) => expect(value).toBeCloseTo([1907.8, 40.38, -724.57, 1][index]!));
  });
});
