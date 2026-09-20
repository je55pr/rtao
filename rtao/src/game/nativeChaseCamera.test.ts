import { describe, expect, test } from "vitest";
import {
  advanceNativeChaseCamera,
  advanceNativeChaseLagAxis,
  advanceNativeChaseRecenter,
  beginNativeChaseRecenter,
  createNativeChaseCameraState,
  nativeChaseSlipInput,
  nativeChaseYawRadians,
  resetNativeChaseLag,
  selectNativeChasePreset,
  stepNativeChaseAngle,
  stepNativeChaseLag,
} from "./nativeChaseCamera";

describe("native chase-camera runtime", () => {
  test("uses signed native angles without renderer handedness policy", () => {
    expect(nativeChaseYawRadians(0x4000)).toBeCloseTo(Math.PI / 2, 6);
    expect(nativeChaseYawRadians(0xc000)).toBeCloseTo(-Math.PI / 2, 6);
  });

  test("retains the executable-backed slip input rule", () => {
    expect(nativeChaseSlipInput(123, 0)).toBe(-123);
    expect(nativeChaseSlipInput(-123, 0)).toBe(123);
    expect(nativeChaseSlipInput(123, 1)).toBe(0);
  });
  test("matches the retained float32 lag-pair trace and clamps overshoot", () => {
    let axis = { value: 0, velocity: 0 };
    const trace = [];
    for (let tick = 0; tick < 3; tick += 1) {
      axis = advanceNativeChaseLagAxis(axis, 0.005);
      trace.push(axis);
    }
    expect(trace).toEqual([
      { value: Math.fround(0.001), velocity: Math.fround(0.001) },
      { value: Math.fround(0.003), velocity: Math.fround(0.002) },
      {
        value: Math.fround(0.005),
        velocity: Math.fround(Math.fround(0.005) - Math.fround(0.003)),
      },
    ]);
    expect(stepNativeChaseLag(0.005, axis.velocity, 0.005).value)
      .toBeCloseTo(Math.fround(0.007), 9);
  });

  test("camera pitch converges by the recovered 0x80 native-angle step", () => {
    expect(stepNativeChaseAngle(0x380, 0x500)).toBe(0x400);
    expect(stepNativeChaseAngle(0x500, 0x380)).toBe(0x480);
    expect(stepNativeChaseAngle(0x380, 0x3c0)).toBe(0x3c0);
    const advanced = advanceNativeChaseCamera(
      createNativeChaseCameraState(0),
      { nativeSlip: 0 },
      { pitchTarget: 0x500 },
    );
    expect(advanced.pitchAngle).toBe(0x400);
  });

  test("controller advancement updates proven slip/recenter without fabricating an eye", () => {
    const initial = {
      ...createNativeChaseCameraState(0),
      lagX: { value: 0.25, velocity: 0.01 },
      lagZ: { value: -0.5, velocity: -0.02 },
    };
    const next = advanceNativeChaseCamera(initial, { nativeSlip: -120 });
    expect(next.lagX).toBe(initial.lagX);
    expect(next.lagZ).toBe(initial.lagZ);
    expect(next.slipInput).toBe(120);
    expect("position" in next).toBe(false);
    expect("target" in next).toBe(false);
  });

  test("reset clears all four recovered lag-block words", () => {
    const state = {
      ...createNativeChaseCameraState(0),
      lagX: { value: 1.25, velocity: 0.2 },
      lagZ: { value: -2.5, velocity: -0.3 },
    };
    const reset = resetNativeChaseLag(state);
    expect(reset.lagX).toEqual({ value: 0, velocity: 0 });
    expect(reset.lagZ).toEqual({ value: 0, velocity: 0 });
  });

  test("preset selection is explicit and clears the recovered lag block", () => {
    const state = {
      ...createNativeChaseCameraState(0),
      lagX: { value: 0.4, velocity: 0.1 },
      lagZ: { value: -0.2, velocity: -0.3 },
      slipInput: 123,
    };
    const selected = selectNativeChasePreset(state, 1);
    expect(selected.presetIndex).toBe(1);
    expect(selected.pitchAngle).toBe(0);
    expect(selected.lagX).toEqual({ value: 0, velocity: 0 });
    expect(selected.lagZ).toEqual({ value: 0, velocity: 0 });
    expect(selected.slipInput).toBe(0);
  });

  test("retains the timed native recenter state independently of browser rendering", () => {
    const camera = beginNativeChaseRecenter(createNativeChaseCameraState(0));
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
