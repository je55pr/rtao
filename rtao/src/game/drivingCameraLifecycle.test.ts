import { describe, expect, test } from "vitest";
import { advanceBrowserChaseCamera } from "./browserChaseCamera";
import {
  createOutdoorDrivingCameraLifecycleState,
  rebaseOutdoorDrivingCameraAcrossFieldSeam,
  type OutdoorDrivingCameraLifecycleState,
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

  test("staggered north-road FLD seam rebases both host axes without a fly-in", () => {
    const initial = createOutdoorDrivingCameraLifecycleState(0);
    const rebased = rebaseOutdoorDrivingCameraAcrossFieldSeam(
      {
        native: initial.native,
        browser: {
          position: [950, 6, 4],
          target: [960, 2, 2],
          ready: true,
        },
      },
      223,
      221,
    );

    expect(rebased.browser).toEqual({
      position: [150, 6, 1604],
      target: [160, 2, 1602],
      ready: true,
    });
    expect(rebased.native.controller).toBe(initial.native.controller);
  });

  test("keeps the host fallback locally bounded through a 6000-update seam and reversal soak", () => {
    let state: OutdoorDrivingCameraLifecycleState = createOutdoorDrivingCameraLifecycleState(0);
    const controller = state.native.controller;
    let fieldNumber = 223;
    let vehicle: [number, number, number] = [800, 2, 800];
    let yaw = 0;

    state = {
      ...state,
      browser: advanceBrowserChaseCamera(
        state.browser,
        { position: vehicle, yaw, cameraLift: 4.2 },
        false,
      ),
    };

    for (let tick = 0; tick < 6000; tick += 1) {
      const turnPhase = tick % 240;
      yaw += turnPhase < 60 ? 0.045 : turnPhase >= 120 && turnPhase < 180 ? -0.045 : 0;
      const reversing = tick % 800 >= 520;
      const travel = reversing ? -0.18 : 0.24;
      vehicle = [
        vehicle[0] + Math.sin(yaw) * travel,
        2 + Math.sin(tick * 0.017) * 0.6,
        vehicle[2] + Math.cos(yaw) * travel,
      ];

      if (tick > 0 && tick % 250 === 0) {
        const nextField = fieldNumber === 223 ? 222 : 223;
        const frameShiftX = fieldNumber === 223 ? 1600 : -1600;
        const relativeBefore = [
          state.browser.position[0] - vehicle[0],
          state.browser.position[2] - vehicle[2],
        ];
        state = rebaseOutdoorDrivingCameraAcrossFieldSeam(state, fieldNumber, nextField);
        vehicle = [vehicle[0] - frameShiftX, vehicle[1], vehicle[2]];
        const relativeAfter = [
          state.browser.position[0] - vehicle[0],
          state.browser.position[2] - vehicle[2],
        ];
        expect(relativeAfter[0]).toBeCloseTo(relativeBefore[0]!, 10);
        expect(relativeAfter[1]).toBeCloseTo(relativeBefore[1]!, 10);
        fieldNumber = nextField;
      }

      state = {
        ...state,
        browser: advanceBrowserChaseCamera(
          state.browser,
          { position: vehicle, yaw, cameraLift: 4.2 },
          false,
        ),
      };
      const values = [...state.browser.position, ...state.browser.target];
      expect(values.every(Number.isFinite), `non-finite camera state at tick ${tick}`).toBe(true);
      expect(Math.hypot(
        state.browser.position[0] - vehicle[0],
        state.browser.position[2] - vehicle[2],
      )).toBeLessThan(40);
    }

    expect(state.native.controller).toBe(controller);
  });
});
