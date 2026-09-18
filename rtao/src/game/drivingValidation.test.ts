import { expect, test } from "vitest";
import {
  assertBrowserCameraTraceMatchesPal,
  assertBrowserDrivingTraceMatchesPal,
  DrivingValidationError,
  type DrivingValidationObservation,
} from "./drivingValidation";

function observation(): DrivingValidationObservation {
  return {
    label: "straight",
    tick: 120,
    commands: 1,
    equipmentFlags: 0x2000,
    pose: { position: [12, 1.5, 9], yaw: 16384 },
    velocity: [100, 0, 4],
    vehicle: { nativeSpeed: 101, gear: 2, equipmentBoostState: 1 },
    contact: {
      support: [4096, 4096, 4096],
      impulses: [0, 0, 0],
      surfaces: [0, 0, 0, 0, 0, 0, 0],
      contactFlags: 3,
      obstacleFlags: 0,
    },
  };
}

test("driving validation accepts matching browser and PAL observations", () => {
  const pal = observation();
  expect(() => assertBrowserDrivingTraceMatchesPal([structuredClone(pal)], [pal])).not.toThrow();
});

test("driving validation reports field-level PAL divergence", () => {
  const pal = observation();
  const browser = {
    ...structuredClone(pal),
    pose: { ...pal.pose, position: [12.25, 1.5, 9] as const },
  };
  expect(() => assertBrowserDrivingTraceMatchesPal([browser], [pal])).toThrowError(DrivingValidationError);
  expect(() => assertBrowserDrivingTraceMatchesPal([browser], [pal])).toThrow(
    /straight tick 120 pose\.position\[0\].*browser=12\.25.*PAL=12/,
  );
});

test("camera validation reports the exact PAL sample that diverged", () => {
  const pal = [{ label: "corner", tick: 42, position: [4, 6, 9] as const, target: [12, 2.2, 9] as const }];
  const browser = [{ ...pal[0]!, position: [5, 6, 9] as const }];
  expect(() => assertBrowserCameraTraceMatchesPal(browser, pal)).toThrow(
    /corner tick 42 camera\.position\[0\].*browser=5.*PAL=4/,
  );
});

test("driving validation supports explicit numeric tolerances without hiding exact state mismatches", () => {
  const pal = observation();
  const browser = {
    ...structuredClone(pal),
    velocity: [100.01, 0, 4] as const,
  };
  expect(() => assertBrowserDrivingTraceMatchesPal([browser], [pal], {
    position: 0,
    yaw: 0,
    velocity: 0.02,
    contact: 0,
  })).not.toThrow();

  const wrongGear = { ...browser, vehicle: { ...browser.vehicle, gear: 3 } };
  expect(() => assertBrowserDrivingTraceMatchesPal([wrongGear], [pal], {
    position: 0,
    yaw: 0,
    velocity: 0.02,
    contact: 0,
  })).toThrow(/vehicle\.gear/);
});
