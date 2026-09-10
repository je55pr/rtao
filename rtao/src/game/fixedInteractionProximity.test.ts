import { describe, expect, test } from "vitest";
import type { FixedInteractionDefinition } from "../formats/overworld";
import { distanceToPolygon, findNearestFixedInteraction } from "./fixedInteractionProximity";

const square = [[10, 10], [20, 10], [20, 20], [10, 20]] as const;

describe("fixed interaction proximity", () => {
  test("returns zero inside a convex authored interaction zone", () => {
    expect(distanceToPolygon([15, 15], square)).toBe(0);
  });

  test("measures the shortest distance to the polygon edge", () => {
    expect(distanceToPolygon([23, 15], square)).toBeCloseTo(3);
    expect(distanceToPolygon([23, 23], square)).toBeCloseTo(Math.sqrt(18));
  });

  test("converts browser X back to native source X and chooses the nearest zone", () => {
    const interactions = [interaction("far", 223, [[30, 10], [40, 10], [40, 20], [30, 20]]), interaction("near", 223, square)];
    const found = findNearestFixedInteraction(interactions, 223, { x: 1582, z: 15 }, 5);
    expect(found?.interaction.name).toBe("near");
    expect(found?.distance).toBe(0);
  });

  test("ignores other fields and sentinel interaction corners", () => {
    const interactions = [
      interaction("other field", 113, square),
      interaction("sentinel", 223, [[-1, -1], [20, 10], [20, 20], [10, 20]]),
    ];
    expect(findNearestFixedInteraction(interactions, 223, { x: 1585, z: 15 }, 10)).toBeUndefined();
  });
});

function interaction(
  name: string,
  fieldNumber: number,
  corners: ReadonlyArray<readonly [number, number]>,
): FixedInteractionDefinition {
  return {
    areaIndex: 1,
    fieldNumber,
    localIndex: 0,
    name,
    bodyId: 62,
    paint: { primary: { r: 0, g: 0, b: 0 }, secondary: { r: 0, g: 0, b: 0 } },
    corners,
  };
}
