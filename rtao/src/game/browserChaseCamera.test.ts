import { expect, test } from "vitest";
import { advanceBrowserChaseCamera, rebaseBrowserChaseCamera, type BrowserChaseCameraState } from "./browserChaseCamera";

const empty: BrowserChaseCameraState = { position: [0, 0, 0], target: [0, 0, 0], ready: false };

test("browser chase camera preserves the current snap geometry", () => {
  const next = advanceBrowserChaseCamera(empty, { position: [10, 2, 20], yaw: 0, cameraLift: 4.2 }, false);
  expect(next.position[0]).toBe(10);
  expect(next.position[1]).toBeCloseTo(6.2, 12);
  expect(next.position[2]).toBeCloseTo(12.2, 12);
  expect(next.target[0]).toBe(10);
  expect(next.target[1]).toBeCloseTo(2.72, 12);
  expect(next.target[2]).toBe(20);
  expect(next.ready).toBe(true);
});

test("browser chase camera rebases across an FLD coordinate-frame change without flying across the world", () => {
  expect(rebaseBrowserChaseCamera(
    { position: [1594, 6, 800], target: [1601, 2, 800], ready: true },
    1600,
    0,
  )).toEqual({ position: [-6, 6, 800], target: [1, 2, 800], ready: true });
});

test("browser chase camera preserves the current per-frame smoothing coefficients", () => {
  const next = advanceBrowserChaseCamera(
    { position: [0, 4, 0], target: [0, 1, 0], ready: true },
    { position: [10, 2, 20], yaw: 0, cameraLift: 4.2 },
    false,
  );
  expect(next.position[0]).toBeCloseTo(1.3, 12);
  expect(next.position[1]).toBeCloseTo(4.286, 12);
  expect(next.position[2]).toBeCloseTo(1.586, 12);
  expect(next.target[0]).toBeCloseTo(1.7, 12);
  expect(next.target[1]).toBeCloseTo(1.2924, 12);
  expect(next.target[2]).toBeCloseTo(3.4, 12);
});
