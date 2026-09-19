import { describe, expect, test } from "vitest";
import { NativeDrivingMotion, nativeDrivingFixedStepSeconds } from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";

const contact = { driveContact: true, accelerationY: 89, allowsYaw: true } as const;

describe("browser/PAL driving handedness bridge", () => {
  test("preserves PAL physical steering command bits", () => {
    const authority = syntheticNativeDrivingMotionAuthority();
    const left = new NativeDrivingMotion(authority, 0);
    const right = new NativeDrivingMotion(authority, 0);

    const leftStep = left.step({ throttle: 1, steering: -1, surfaceKind: "paved-road", contact });
    const rightStep = right.step({ throttle: 1, steering: 1, surfaceKind: "paved-road", contact });

    expect(leftStep.commands & 0xa000).toBe(0x8000);
    expect(rightStep.commands & 0xa000).toBe(0x2000);
  });

  test("keeps sustained playable left/right turning symmetric after drift engages", () => {
    const authority = syntheticNativeDrivingMotionAuthority();
    const left = new NativeDrivingMotion(authority, 0);
    const right = new NativeDrivingMotion(authority, 0);
    let previousLeftYaw = 0;
    let previousRightYaw = 0;
    let totalLeftYaw = 0;
    let totalRightYaw = 0;

    const unwrapDelta = (next: number, previous: number): number => {
      let delta = next - previous;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      return delta;
    };

    for (let frame = 0; frame < 180; frame += 1) {
      const leftStep = left.step({ throttle: 1, steering: -1, surfaceKind: "paved-road", contact });
      const rightStep = right.step({ throttle: 1, steering: 1, surfaceKind: "paved-road", contact });
      totalLeftYaw += unwrapDelta(leftStep.yaw, previousLeftYaw);
      totalRightYaw += unwrapDelta(rightStep.yaw, previousRightYaw);
      previousLeftYaw = leftStep.yaw;
      previousRightYaw = rightStep.yaw;
    }

    expect(Math.abs(totalLeftYaw)).toBeCloseTo(Math.abs(totalRightYaw), 5);
  });

  test("reflects native X/yaw into browser coordinates instead of swapping controls", () => {
    const authority = syntheticNativeDrivingMotionAuthority();
    const left = new NativeDrivingMotion(authority, 0);
    const right = new NativeDrivingMotion(authority, 0);
    let leftStep = left.step({ throttle: 1, steering: -1, surfaceKind: "paved-road", contact });
    let rightStep = right.step({ throttle: 1, steering: 1, surfaceKind: "paved-road", contact });

    for (let frame = 1; frame < 40; frame += 1) {
      leftStep = left.step({ throttle: 1, steering: -1, surfaceKind: "paved-road", contact });
      rightStep = right.step({ throttle: 1, steering: 1, surfaceKind: "paved-road", contact });
    }

    expect(leftStep.yaw).toBeGreaterThan(0);
    expect(rightStep.yaw).toBeLessThan(0);
    expect(leftStep.steeringFraction).toBeLessThan(0);
    expect(rightStep.steeringFraction).toBeGreaterThan(0);
    expect(Math.sign(leftStep.deltaX)).toBe(-Math.sign(rightStep.deltaX));
    expect(nativeDrivingFixedStepSeconds).toBe(1 / 50);
  });
});
