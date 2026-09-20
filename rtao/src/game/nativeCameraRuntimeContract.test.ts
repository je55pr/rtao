import { describe, expect, test } from "vitest";
import {
  applyNativeCameraLifecycle,
  createNativeCameraRuntimeContractState,
  nativeCameraFrameForRenderer,
  nativeCameraFrameFromStateForRenderer,
  reflectNativeCameraPointX,
  replaceNativeCameraController,
  selectNativeCameraRenderPose,
  withNativeCameraFinalOutput,
} from "./nativeCameraRuntimeContract";

describe("native camera runtime contract", () => {
  test("keeps final native output separate from retained controller state", () => {
    const initial = createNativeCameraRuntimeContractState(0);
    expect(initial.controller.lagX).toEqual({ value: 0, velocity: 0 });
    expect(initial.controller.lagZ).toEqual({ value: 0, velocity: 0 });
    expect(initial.finalOutput).toBeUndefined();

    const output = {
      eye: [100, 5, 200] as const,
      forward: [10, -3, 20] as const,
      focal: 500,
    };
    const resolved = withNativeCameraFinalOutput(initial, output);
    expect(resolved.controller).toBe(initial.controller);
    expect(resolved.finalOutput).toBe(output);
  });

  test("controller-only state does not fabricate a renderer frame", () => {
    const initial = createNativeCameraRuntimeContractState(0);
    let conversions = 0;
    const frame = nativeCameraFrameFromStateForRenderer(initial, {
      toRenderPoint: (point) => {
        conversions += 1;
        return point;
      },
      projection: { rendererOwned: true },
    });

    expect(frame).toBeUndefined();
    expect(conversions).toBe(0);
  });

  test("advancing controller ownership invalidates stale final output", () => {
    const initial = createNativeCameraRuntimeContractState(0);
    const resolved = withNativeCameraFinalOutput(initial, {
      eye: [100, 5, 200],
      forward: [10, -3, 20],
      focal: 500,
    });
    const nextController = { ...resolved.controller, slipInput: 7 };
    const advanced = replaceNativeCameraController(resolved, nextController);

    expect(advanced.controller).toBe(nextController);
    expect(advanced.finalOutput).toBeUndefined();
  });

  test("selects the exact host fallback until final output exists", () => {
    const initial = createNativeCameraRuntimeContractState(0);
    const fallback = {
      position: [9, 8, 7] as const,
      target: [6, 5, 4] as const,
    };
    expect(selectNativeCameraRenderPose(initial, (point) => point, fallback)).toEqual({
      source: "host-fallback",
      pose: fallback,
    });

    const resolved = withNativeCameraFinalOutput(initial, {
      eye: [100, 5, 200],
      forward: [10, -3, 20],
      focal: 500,
    });
    expect(
      selectNativeCameraRenderPose(
        resolved,
        (point) => reflectNativeCameraPointX(point, 1600),
        fallback,
      ),
    ).toEqual({
      source: "native-final-output",
      pose: {
        position: [1500, 5, 200],
        target: [1490, 2, 220],
      },
    });
  });

  test("maps final native output through one renderer reflection boundary", () => {
    const output = {
      eye: [100, 5, 200] as const,
      forward: [10, -3, 20] as const,
      focal: 500,
    };
    const projection = { rendererOwned: "opaque" as const };
    const frame = nativeCameraFrameForRenderer(output, {
      toRenderPoint: (point) => reflectNativeCameraPointX(point, 1600),
      projection,
    });

    expect(frame.pose).toEqual({
      position: [1500, 5, 200],
      target: [1490, 2, 220],
    });
    expect(frame.projection).toBe(projection);
  });
  test("native lifecycle changes invalidate final output without inventing a snap", () => {
    const output = {
      eye: [100, 5, 200] as const,
      forward: [10, -3, 20] as const,
      focal: 500,
    };
    const initial = createNativeCameraRuntimeContractState(0);
    let state = withNativeCameraFinalOutput(
      {
        controller: {
          ...initial.controller,
          lagX: { value: 12, velocity: 0.2 },
          lagZ: { value: 4, velocity: -0.1 },
        },
      },
      output,
    );

    state = applyNativeCameraLifecycle(state, { kind: "native-lag-reset" });
    expect(state.finalOutput).toBeUndefined();
    expect(state.controller.lagX).toEqual({ value: 0, velocity: 0 });
    expect(state.controller.lagZ).toEqual({ value: 0, velocity: 0 });

    state = withNativeCameraFinalOutput(state, output);
    state = applyNativeCameraLifecycle(state, { kind: "native-recenter" });
    expect(state.finalOutput).toBeUndefined();
    expect(state.controller.recenter.active).toBe(true);

    state = withNativeCameraFinalOutput(state, output);
    state = applyNativeCameraLifecycle(
      state,
      { kind: "native-preset-select", presetIndex: 1 },
    );
    expect(state.finalOutput).toBeUndefined();
    expect(state.controller.presetIndex).toBe(1);
  });

  test("host discontinuity invalidates presentation only", () => {
    const initial = createNativeCameraRuntimeContractState(0);
    const output = {
      eye: [100, 5, 200] as const,
      forward: [10, -3, 20] as const,
      focal: 500,
    };
    const resolved = withNativeCameraFinalOutput(initial, output);
    const invalidated = applyNativeCameraLifecycle(
      resolved,
      { kind: "host-output-invalidate" },
    );

    expect(invalidated.controller).toBe(resolved.controller);
    expect(invalidated.finalOutput).toBeUndefined();
  });

  test("reflection origin must be an explicit finite host value", () => {
    expect(reflectNativeCameraPointX([100, 2, 300], 1600))
      .toEqual([1500, 2, 300]);
    expect(() => reflectNativeCameraPointX([0, 0, 0], Number.NaN))
      .toThrow("X-reflection origin");
  });
});
