import { describe, expect, test } from "vitest";
import {
  applyNativeCameraLifecycle,
  createNativeCameraRuntimeContractState,
  nativeCameraFrameForRenderer,
  reflectNativeCameraPointX,
  withNativeCameraFinalOutput,
} from "./nativeCameraRuntimeContract";

describe("native camera runtime contract", () => {
  test("keeps final native output separate from retained controller state", () => {
    const initial = createNativeCameraRuntimeContractState(0);
    expect(initial.controller.ready).toBe(false);
    expect(initial.finalOutput).toBeUndefined();

    const output = {
      position: [100, 5, 200] as const,
      target: [110, 2, 220] as const,
    };
    const resolved = withNativeCameraFinalOutput(initial, output);
    expect(resolved.controller).toBe(initial.controller);
    expect(resolved.finalOutput).toBe(output);
  });

  test("maps final native output through one renderer reflection boundary", () => {
    const output = {
      position: [100, 5, 200] as const,
      target: [110, 2, 220] as const,
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
      position: [100, 5, 200] as const,
      target: [110, 2, 220] as const,
    };
    const initial = createNativeCameraRuntimeContractState(0);
    let state = withNativeCameraFinalOutput(
      {
        controller: {
          ...initial.controller,
          position: [12, 3, 4],
          lagVelocity: [0.2, -0.1, 0.05],
          ready: true,
        },
      },
      output,
    );

    state = applyNativeCameraLifecycle(state, { kind: "native-lag-reset" });
    expect(state.finalOutput).toBeUndefined();
    expect(state.controller.ready).toBe(true);
    expect(state.controller.position).toEqual([12, 3, 4]);
    expect(state.controller.lagVelocity).toEqual([0, 0, 0]);

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
      position: [100, 5, 200] as const,
      target: [110, 2, 220] as const,
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
