import { describe, expect, test } from "vitest";
import {
  fieldTriangleStripIndices,
  reflectFieldRenderPosition,
  type Vec3,
} from "./fieldGeometry";

function normalY(vertices: readonly Vec3[], indices: readonly [number, number, number]): number {
  const [a, b, c] = indices.map((index) => vertices[index]!) as [Vec3, Vec3, Vec3];
  const ux = b.x - a.x;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vz = c.z - a.z;
  return uz * vx - ux * vz;
}

describe("PAL field strip winding", () => {
  test("alternating strip parity keeps adjacent source triangles consistently wound", () => {
    const vertices: readonly Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ];
    expect(fieldTriangleStripIndices(0)).toEqual([0, 1, 2]);
    expect(fieldTriangleStripIndices(1)).toEqual([2, 1, 3]);
    expect(normalY(vertices, fieldTriangleStripIndices(0))).toBeGreaterThan(0);
    expect(normalY(vertices, fieldTriangleStripIndices(1))).toBeGreaterThan(0);
  });

  test("the PAL-to-browser X reflection flips winding exactly once", () => {
    const source: readonly Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ];
    const reflected = source.map(reflectFieldRenderPosition);
    for (const index of [0, 1]) {
      const triangle = fieldTriangleStripIndices(index);
      expect(Math.sign(normalY(reflected, triangle))).toBe(-Math.sign(normalY(source, triangle)));
    }
  });

  test("strip parity advances across degenerate triples instead of restarting", () => {
    expect(fieldTriangleStripIndices(2)).toEqual([2, 3, 4]);
    expect(fieldTriangleStripIndices(3)).toEqual([4, 3, 5]);
    expect(() => fieldTriangleStripIndices(-1)).toThrow(RangeError);
  });
});
