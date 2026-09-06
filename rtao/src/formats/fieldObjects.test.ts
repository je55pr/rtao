import { describe, expect, it } from "vitest";
import { findTurbineAnchors } from "./fieldObjects";
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
