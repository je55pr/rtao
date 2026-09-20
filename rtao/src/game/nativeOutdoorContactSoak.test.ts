import { describe, expect, test } from "vitest";
import { NativeDrivingMotion } from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";
import {
  NativeOutdoorContact,
  type NativeOutdoorContactQuery,
} from "./nativeOutdoorContact";
import { fieldNumberFromAddress } from "./worldTopology";

const authority = syntheticNativeDrivingMotionAuthority();
const startField = fieldNumberFromAddress(3, 4);
const f = Math.fround;

interface SoakSummary {
  readonly collisionTicks: number;
  readonly fields: readonly number[];
  readonly surfaces: readonly number[];
  readonly sawDeep: boolean;
  readonly sawShallow: boolean;
  readonly unsupportedRecoveryPulses: number;
  readonly finalPosition: readonly number[];
  readonly finalSupport: readonly number[];
}

function runMixedTerrainSoak(bigTyre: boolean): SoakSummary {
  const motion = new NativeDrivingMotion(authority, 0);
  const contact = new NativeOutdoorContact(
    authority,
    startField,
    { x: 800, y: 4, z: 800 },
    motion.nativeVehicle.yaw,
  );
  let tick = 0;
  const query: NativeOutdoorContactQuery = (_field, point) => {
    const unsupported = tick % 1200 >= 900 && tick % 1200 < 980;
    if (unsupported) return { point, flags: -1, ceilingY: 10000 };

    const wrappedX = ((point[0] % 1600) + 1600) % 1600;
    const wrappedZ = ((point[2] % 1600) + 1600) % 1600;
    const crest = -Math.abs(((wrappedZ + 80) % 160) - 80) * 0.012;
    const crossfall = Math.sin(wrappedX * 0.015) * 0.18;
    const groundY = f(4 + crest + crossfall);
    const surfaceBand = Math.floor(tick / 140) % 3;
    const surface = [0x550, 0x111, 0x313][surfaceBand]!;
    const shoreline = tick % 1000 >= 300 && tick % 1000 < 380;
    const extraY = shoreline ? f(groundY + 0.8) : 0;
    return {
      point: [point[0], groundY, point[2], extraY],
      flags: surface,
      ceilingY: 10000,
    };
  };

  const equipmentFlags = bigTyre ? 0x400 : 0;
  contact.prime(query, equipmentFlags, equipmentFlags);
  const fields = new Set<number>();
  const surfaces = new Set<number>();
  let collisionTicks = 0;
  let sawDeep = false;
  let sawShallow = false;
  let unsupportedRecoveryPulses = 0;

  for (tick = 0; tick < 6000; tick += 1) {
    const driveCycle = tick % 400;
    const throttle = driveCycle < 180 ? 1 : driveCycle < 260 ? 0 : -1;
    const steeringCycle = Math.floor(tick / 90) % 4;
    const steering = steeringCycle === 1 ? 1 : steeringCycle === 3 ? -1 : 0;
    const step = motion.step({
      throttle,
      steering,
      surfaceIndex: undefined,
      contact: {
        specialState: contact.specialState,
        propellerEnabled: false,
        waterSkiEnabled: false,
        native: contact.retainedContact,
      },
    });
    const obstacleMask = tick % 211 === 0
      ? [1, 2, 3, 4, 5, 10][Math.floor(tick / 211) % 6]!
      : 0;
    const response = contact.advance(
      step,
      query,
      equipmentFlags,
      equipmentFlags,
      () => obstacleMask,
    );
    expect(response, `native contact escaped the authored world at tick ${tick}`).toBeDefined();
    motion.applyNativeContactResponse(
      response!.velocity,
      response!.yaw,
      response!.runtimeFlags,
    );
    const pose = contact.pose(response!.browserYaw);
    const finite = [
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.pitch,
      pose.roll,
      ...pose.bodyMatrix,
      ...response!.velocity,
      response!.browserYaw,
    ];
    expect(finite.every(Number.isFinite), `non-finite native state at tick ${tick}`).toBe(true);
    for (const support of contact.retainedContact.support) {
      expect(Number.isInteger(support), `fractional support at tick ${tick}`).toBe(true);
      expect(support, `support below native clamp at tick ${tick}`).toBeGreaterThanOrEqual(0);
      expect(support, `support above native clamp at tick ${tick}`).toBeLessThanOrEqual(8192);
    }
    fields.add(pose.fieldNumber);
    const surfaceFlags = contact.retainedContact.surfaceFlags;
    if (surfaceFlags !== undefined && surfaceFlags >= 0) {
      surfaces.add(surfaceFlags & 7);
    }
    collisionTicks += response!.collisionFlags !== 0 ? 1 : 0;
    unsupportedRecoveryPulses += (response!.runtimeFlags & 1) !== 0 ? 1 : 0;
    sawDeep ||= contact.specialState > 0;
    sawShallow ||= contact.specialState < 0;
  }

  const pose = contact.pose(0);
  return {
    collisionTicks,
    fields: [...fields].sort((a, b) => a - b),
    surfaces: [...surfaces].sort((a, b) => a - b),
    sawDeep,
    sawShallow,
    unsupportedRecoveryPulses,
    finalPosition: [pose.position.x, pose.position.y, pose.position.z],
    finalSupport: [...contact.retainedContact.support],
  };
}

describe("native outdoor contact long-drive soak", () => {
  test("stays finite, bounded and deterministic across mixed support/collision states", () => {
    const first = runMixedTerrainSoak(false);
    const second = runMixedTerrainSoak(false);
    expect(second).toEqual(first);
    expect(first.collisionTicks).toBeGreaterThan(20);
    expect(first.surfaces).toEqual(expect.arrayContaining([0, 1, 3]));
    expect(first.sawDeep).toBe(true);
    expect(first.unsupportedRecoveryPulses).toBeGreaterThan(0);
  }, 15_000);

  test("keeps Big Tyre contact stable through the same soak", () => {
    const ordinary = runMixedTerrainSoak(false);
    const big = runMixedTerrainSoak(true);
    expect(big.collisionTicks).toBeGreaterThan(20);
    expect(big.sawShallow).toBe(true);
    expect(big.unsupportedRecoveryPulses).toBeGreaterThan(0);
    expect(big.finalPosition.every(Number.isFinite)).toBe(true);
    expect(big.finalSupport.every((value) => value >= 0 && value <= 8192)).toBe(true);
    expect(big).not.toEqual(ordinary);
  }, 15_000);
});
