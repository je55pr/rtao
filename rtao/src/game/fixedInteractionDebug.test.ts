import { describe, expect, test } from "vitest";
import type { FixedInteractionDefinition } from "../formats/overworld";
import { fixedInteractionDebugState } from "./fixedInteractionDebug";

function interaction(localIndex: number, corners: ReadonlyArray<readonly [number, number]>): FixedInteractionDefinition {
  return {
    areaIndex: 3,
    fieldNumber: 13,
    localIndex,
    name: localIndex === 2 ? "Q's Factory" : "Bakery",
    bodyId: 0,
    paint: {
      primary: { r: 25, g: 25, b: 25 },
      secondary: { r: 25, g: 25, b: 25 },
    },
    corners,
  };
}

describe("fixed interaction debug mapping", () => {
  test("reflects authored X once and exposes the recovered corners 2→3 return edge", () => {
    const state = fixedInteractionDebugState([
      interaction(2, [[100, 200], [120, 200], [120, 240], [100, 240]]),
    ], 13, { x: 1490, z: 220 });
    expect(state.polygons).toHaveLength(1);
    expect(state.polygons[0]).toMatchObject({
      id: "fixed-3-2",
      label: "A3/02 Q's Factory",
      points: [[1500, 200], [1480, 200], [1480, 240], [1500, 240]],
      returnEdge: [[1480, 240], [1500, 240]],
      nearest: true,
    });
    expect(state.nearest?.localIndex).toBe(2);
  });

  test("filters sentinels and marks only the nearest interaction", () => {
    const state = fixedInteractionDebugState([
      interaction(0, [[100, 100], [110, 100], [110, 110], [100, 110]]),
      interaction(1, [[300, 300], [310, 300], [310, 310], [300, 310]]),
      interaction(2, [[-1, -1], [-1, -1], [-1, -1], [-1, -1]]),
    ], 13, { x: 1295, z: 305 });

    expect(state.polygons.map((polygon) => polygon.interaction.localIndex)).toEqual([0, 1]);
    expect(state.polygons.map((polygon) => polygon.nearest)).toEqual([false, true]);
    expect(state.nearest?.localIndex).toBe(1);
  });
});
