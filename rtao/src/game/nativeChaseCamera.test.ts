import { describe, expect, test } from "vitest";
import {
  advanceNativeChaseCamera,
  advanceNativeChaseRecenter,
  beginNativeChaseRecenter,
  createNativeChaseCameraState,
  nativeChaseSlipInput,
  nativeChaseYawRadians,
  projectNativeChaseFollowTarget,
  resetNativeChaseLag,
  selectNativeChasePreset,
  stepNativeChaseLag,
} from "./nativeChaseCamera";

describe("native chase-camera runtime", () => {
  test("projects recovered ordinary preset zero from native yaw", () => {
    const pose = projectNativeChaseFollowTarget(
      { position: [10, 2, 20], nativeYaw: 0, nativeSlip: 0 },
      0,
    );
    expect(pose.position).toEqual([10, 4, 13]);
    expect(pose.target).toEqual([10, 2, 20]);

    const quarterTurn = projectNativeChaseFollowTarget(
      { position: [10, 2, 20], nativeYaw: 0x4000, nativeSlip: 0 },
      0,
    );
    expect(quarterTurn.position[0]).toBeCloseTo(3, 5);
    expect(quarterTurn.position[2]).toBeCloseTo(20, 5);
  });
  test("uses signed native yaw without renderer handedness policy", () => {
    expect(nativeChaseYawRadians(0x4000)).toBeCloseTo(Math.PI / 2, 6);
    expect(nativeChaseYawRadians(0xc000)).toBeCloseTo(-Math.PI / 2, 6);
    const native = projectNativeChaseFollowTarget(
      { position: [100, 2, 200], nativeYaw: 0x4000, nativeSlip: 0 },
      0,
    );
    expect(native.position[0]).toBeCloseTo(93, 5);
    expect(native.position[2]).toBeCloseTo(200, 5);
  });

  test("retains the executable-backed slip input rule", () => {
    expect(nativeChaseSlipInput(123, 0)).toBe(-123);
    expect(nativeChaseSlipInput(-123, 0)).toBe(123);
    expect(nativeChaseSlipInput(123, 1)).toBe(0);
  });

  test("matches the retained float32 lag trace and clamps overshoot", () => {
    let value = 0;
    let velocity = 0;
    const trace = [];
    for (let tick = 0; tick < 3; tick += 1) {
      const next = stepNativeChaseLag(value, velocity, 0.005);
      value = next.value;
      velocity = next.velocity;
      trace.push(next);
    }
    expect(trace).toEqual([
      { value: Math.fround(0.001), velocity: Math.fround(0.001) },
      { value: Math.fround(0.003), velocity: Math.fround(0.002) },
      { value: Math.fround(0.005), velocity: Math.fround(Math.fround(0.005) - Math.fround(0.003)) },
    ]);
  });
  test("advances lag once per native camera invocation and reset clears velocity without snapping", () => {
    let state = createNativeChaseCameraState(0);
    state = advanceNativeChaseCamera(
      state,
      { position: [0, 0, 0], nativeYaw: 0, nativeSlip: 0 },
    );
    expect(state.position).toEqual([0, 2, -7]);

    state = advanceNativeChaseCamera(
      state,
      { position: [1, 0, 0], nativeYaw: 0, nativeSlip: 0 },
    );
    expect(state.position[0]).toBeCloseTo(Math.fround(0.001), 12);
    expect(state.lagVelocity[0]).toBeCloseTo(Math.fround(0.001), 12);

    const reset = resetNativeChaseLag(state);
    expect(reset.position).toEqual(state.position);
    expect(reset.lagVelocity).toEqual([0, 0, 0]);
  });

  test("preset selection is explicit and clears recovered lag velocity", () => {
    const state = {
      ...createNativeChaseCameraState(0),
      ready: true,
      lagVelocity: [0.1, -0.2, 0.3] as const,
      slipInput: 123,
    };
    const selected = selectNativeChasePreset(state, 1);
    expect(selected.presetIndex).toBe(1);
    expect(selected.lagVelocity).toEqual([0, 0, 0]);
    expect(selected.slipInput).toBe(0);
  });

  test("retains the timed native recenter state independently of browser rendering", () => {
    let camera = beginNativeChaseRecenter(createNativeChaseCameraState(0));
    let recenter = camera.recenter;
    for (let timer = 0; timer < 0x80; timer += 1) {
      recenter = advanceNativeChaseRecenter(recenter, 0);
      if (timer === 0x3f) expect(recenter.angle).toBe(-0x8000);
      if (timer === 0x40) expect(recenter.angle).toBe(-0x7e00);
    }
    expect(recenter.angle).toBe(0);
    expect(advanceNativeChaseRecenter(recenter, 0).active).toBe(false);
  });
});
