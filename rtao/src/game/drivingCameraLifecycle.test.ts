import { describe, expect, test } from "vitest";
import {
  createOutdoorDrivingCameraLifecycleState,
  rebaseOutdoorDrivingCameraAcrossFieldSeam,
} from "./drivingCameraLifecycle";
import { withNativeCameraFinalOutput } from "./nativeCameraRuntimeContract";

describe("outdoor driving camera lifecycle", () => {
  test("scene construction starts fresh native lag and an unready host fallback", () => {
    const state = createOutdoorDrivingCameraLifecycleState(0);
    expect(state.native.controller.lagX).toEqual({ value: 0, velocity: 0 });
    expect(state.native.controller.lagZ).toEqual({ value: 0, velocity: 0 });
    expect(state.native.finalOutput).toBeUndefined();
    expect(state.browser.ready).toBe(false);
  });

  test("FLD seam rebases host coordinates without resetting native lag", () => {
    const initial = createOutdoorDrivingCameraLifecycleState(0);
    const controller = {
      ...initial.native.controller,
      lagX: { value: 12, velocity: 0.2 },
      lagZ: { value: -4, velocity: -0.1 },
    };
    const native = withNativeCameraFinalOutput(
      { controller },
      { eye: [100, 5, 200], forward: [0, 0, 1], focal: 500 },
    );
    const rebased = rebaseOutdoorDrivingCameraAcrossFieldSeam(
      {
        native,
        browser: {
          position: [1594, 6, 800],
          target: [1601, 2, 800],
          ready: true,
        },
      },
      223,
      222,
    );

    expect(rebased.browser).toEqual({
      position: [-6, 6, 800],
      target: [1, 2, 800],
      ready: true,
    });
    expect(rebased.native.controller).toBe(controller);
    expect(rebased.native.controller.lagX).toEqual({ value: 12, velocity: 0.2 });
    expect(rebased.native.controller.lagZ).toEqual({ value: -4, velocity: -0.1 });
    expect(rebased.native.finalOutput).toBeUndefined();
  });
});
