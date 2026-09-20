import { describe, expect, test } from "vitest";
import { createNativeChaseCameraState } from "./nativeChaseCamera";
import {
  resolveNativeCameraObstruction,
  type NativeCameraObstructionBuilder,
} from "./nativeCameraObstruction";

function builder(builtAngles: number[]): NativeCameraObstructionBuilder {
  return (controller) => {
    builtAngles.push(controller.recenter.angle);
    return {
      finalOutput: {
        eye: [0, 2, -7],
        forward: [0, 0, 1],
        focal: 500,
      },
      nearLowerProbes: [
        [-1, 10, 1],
        [1, 10, 1],
      ],
    };
  };
}

describe("native camera obstruction correction", () => {
  test("invalid lower-left probe steps +0x16 by -0x80 and rebuilds until clear", () => {
    const builtAngles: number[] = [];
    let leftCalls = 0;
    const result = resolveNativeCameraObstruction(
      createNativeChaseCameraState(0),
      builder(builtAngles),
      ({ point }) => {
        if (point[0] < 0 && leftCalls++ === 0) return { valid: false };
        return { valid: true, correctedY: point[1] };
      },
    );

    expect(result.controller.recenter.angle).toBe(-0x80);
    expect(result.adjustmentCount).toBe(1);
    expect(result.terminatedAtBoundary).toBe(false);
    expect(builtAngles).toEqual([0, -0x80]);
  });

  test("raised lower-right probe steps +0x16 by +0x80; equal or lower terrain is clear", () => {
    let rightCalls = 0;
    const result = resolveNativeCameraObstruction(
      createNativeChaseCameraState(0),
      builder([]),
      ({ point }) => {
        if (point[0] < 0) return { valid: true, correctedY: point[1] - 1 };
        if (rightCalls++ === 0) return { valid: true, correctedY: point[1] + 0.25 };
        return { valid: true, correctedY: point[1] };
      },
    );

    expect(result.controller.recenter.angle).toBe(0x80);
    expect(result.adjustmentCount).toBe(1);
    expect(result.terminatedAtBoundary).toBe(false);
  });

  test("paired preset and raw context gates bypass the collision query", () => {
    const query = () => {
      throw new Error("bypassed obstruction query must not run");
    };
    expect(resolveNativeCameraObstruction(
      createNativeChaseCameraState(1),
      builder([]),
      query,
    ).adjustmentCount).toBe(0);
    expect(resolveNativeCameraObstruction(
      createNativeChaseCameraState(0),
      builder([]),
      query,
      { contextFlags28: 0x8000 },
    ).adjustmentCount).toBe(0);
    expect(resolveNativeCameraObstruction(
      createNativeChaseCameraState(0),
      builder([]),
      query,
      { sceneByte0B: 1 },
    ).adjustmentCount).toBe(0);
  });

  test("stops rather than wrapping past the signed-angle boundary", () => {
    const initial = createNativeChaseCameraState(0);
    const result = resolveNativeCameraObstruction(
      {
        ...initial,
        recenter: { ...initial.recenter, angle: -0x8000 },
      },
      builder([]),
      ({ point }) => point[0] < 0
        ? { valid: false }
        : { valid: true, correctedY: point[1] },
    );

    expect(result.controller.recenter.angle).toBe(-0x8000);
    expect(result.adjustmentCount).toBe(0);
    expect(result.terminatedAtBoundary).toBe(true);
  });
});
