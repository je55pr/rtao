import { describe, expect, test } from "vitest";
import { fixedInteractionReturnPose } from "./fixedInteractionReturn";

describe("PAL fixed-interaction exterior return", () => {
  test("uses corners 2 -> 3 for both midpoint and outward vehicle heading", () => {
    const pose = fixedInteractionReturnPose({
      corners: [[100, 200], [140, 200], [150, 260], [110, 260]],
    });
    expect(pose.position).toEqual({ x: 1470, y: -20, z: 260 });
    expect(pose.yaw).toBeCloseTo(Math.PI, 6);
  });

  test("rotates a source +Z return edge into the recovered reflected browser heading", () => {
    const pose = fixedInteractionReturnPose({
      corners: [[0, 0], [0, 0], [100, 100], [100, 140]],
    });
    expect(pose.position).toEqual({ x: 1500, y: -20, z: 120 });
    expect(pose.yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  test("rejects missing, sentinel and degenerate return edges", () => {
    expect(() => fixedInteractionReturnPose({ corners: [] })).toThrow(/incomplete/);
    expect(() => fixedInteractionReturnPose({ corners: [[0, 0], [0, 0], [-1, -1], [2, 2]] })).toThrow(/usable/);
    expect(() => fixedInteractionReturnPose({ corners: [[0, 0], [0, 0], [2, 2], [2, 2]] })).toThrow(/degenerate/);
  });
});
