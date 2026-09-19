import { describe, expect, test } from "vitest";
import type { CompiledFieldCollision } from "../formats/fieldCollision";
import { ArcadeCarController } from "./drivingGame";
import { nativeDrivingFixedStepSeconds } from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";
import { allWorldFieldNumbers } from "./worldTopology";
import { DrivingWorld, flatFieldCollision, type DrivingSurfaceKind, type Vec3 } from "./worldCollision";

function flatWorld(): DrivingWorld {
  const world = new DrivingWorld();
  for (const field of allWorldFieldNumbers()) world.addCompiledField(field, flatFieldCollision());
  return world;
}

class ForcedSurfaceWorld extends DrivingWorld {
  constructor(private readonly forcedSurface: DrivingSurfaceKind) {
    super();
    for (const field of allWorldFieldNumbers()) this.addCompiledField(field, flatFieldCollision());
  }

  override drivingSurface(_originFieldNumber: number, _position: Vec3, _referenceY?: number): DrivingSurfaceKind {
    return this.forcedSurface;
  }
}

function controller(world: DrivingWorld): ArcadeCarController {
  return new ArcadeCarController(world, syntheticNativeDrivingMotionAuthority());
}

const drive = { throttle: 1, steering: 0, boost: false } as const;
describe("recovered driving integration", () => {
  test("advances deterministically at the recovered 50 Hz fixed step", () => {
    const a = controller(flatWorld());
    const b = controller(flatWorld());
    for (let frame = 0; frame < 120; frame += 1) {
      a.update(nativeDrivingFixedStepSeconds, drive);
      b.update(nativeDrivingFixedStepSeconds, drive);
    }
    expect(a.state).toEqual(b.state);
    expect(a.state.speed).toBeGreaterThan(0);
    expect(a.state.position.z).toBeGreaterThan(555);
    expect(a.state.nativeEngineSpeed).toBeGreaterThan(0);
    expect(a.state.nativeEngineLayerSelector).toBe(1);
    expect(a.state.distanceTravelled).toBeGreaterThan(0);
  });

  test("rejects browser timing that would rescale native update arithmetic", () => {
    const car = controller(flatWorld());
    expect(() => car.update(1 / 60, drive)).toThrow("PAL 50 Hz fixed step");
  });

  test("counts only successful driven distance and never debug teleports", () => {
    const car = controller(flatWorld());
    car.teleport(223, { x: 1_200, y: 0, z: 800 }, 0);
    expect(car.state.distanceTravelled).toBe(0);
    for (let frame = 0; frame < 60; frame += 1) car.update(nativeDrivingFixedStepSeconds, drive);
    const drivenDistance = car.state.distanceTravelled;
    expect(drivenDistance).toBeGreaterThan(0);
    car.teleport(113, { x: 800, y: 0, z: 800 }, Math.PI);
    expect(car.state.distanceTravelled).toBe(drivenDistance);
  });

  test("enters Cloud Hill through special-outdoor collision without inventing FLD/064", () => {
    const world = flatWorld();
    world.addCompiledSpecialOutdoor(64, flatFieldCollision());
    const car = controller(world);
    car.enterSpecialOutdoor(64, { x: 767.77001953125, z: 725 });
    expect(car.state.location).toEqual({ kind: "special-outdoor", areaCode: 64 });
    expect(car.state.fieldNumber).toBe(-1);
    car.update(nativeDrivingFixedStepSeconds, drive);
    expect(car.state.location).toEqual({ kind: "special-outdoor", areaCode: 64 });
  });
  test("drives through an X sector seam without losing the existing collision bridge", () => {
    const car = controller(flatWorld());
    car.teleport(223, { x: 1598, y: 0, z: 800 }, Math.PI / 2);
    for (let frame = 0; frame < 120; frame += 1) {
      car.update(nativeDrivingFixedStepSeconds, { ...drive, boost: true });
    }
    expect(car.state.fieldNumber).not.toBe(223);
    expect(car.state.position.x).toBeGreaterThanOrEqual(0);
    expect(car.state.position.x).toBeLessThanOrEqual(1600);
  });

  test("uses Big Tyre's recovered 1.35 contact gate in free-roam movement", () => {
    const normalWorld = new DrivingWorld();
    normalWorld.addCompiledField(223, auxiliaryBarrierCollision(0, 0.8));
    const bigWorld = new DrivingWorld();
    bigWorld.addCompiledField(223, auxiliaryBarrierCollision(0, 0.8));
    const normal = controller(normalWorld);
    const big = controller(bigWorld);
    big.setNativeTyreSelector(11);
    normal.update(nativeDrivingFixedStepSeconds, drive);
    big.update(nativeDrivingFixedStepSeconds, drive);
    expect(normal.state.distanceTravelled).toBe(0);
    expect(normal.state.speed).toBe(0);
    expect(big.state.distanceTravelled).toBeGreaterThan(0);
  });

  test("keeps unresolved browser surfaces neutral instead of inventing a native surface code", () => {
    const normal = controller(new ForcedSurfaceWorld("other"));
    const sports = controller(new ForcedSurfaceWorld("other"));
    sports.setNativeTyreSelector(1);
    for (let frame = 0; frame < 60; frame += 1) {
      normal.update(nativeDrivingFixedStepSeconds, drive);
      sports.update(nativeDrivingFixedStepSeconds, drive);
    }
    expect(sports.state.speed).toBe(normal.state.speed);
    expect(sports.state.distanceTravelled).toBe(normal.state.distanceTravelled);
  });
  test("maps browser left/right steering onto the reflected PAL yaw directions", () => {
    const left = controller(flatWorld());
    const right = controller(flatWorld());
    for (let frame = 0; frame < 60; frame += 1) {
      left.update(nativeDrivingFixedStepSeconds, { throttle: 1, steering: -1, boost: false });
      right.update(nativeDrivingFixedStepSeconds, { throttle: 1, steering: 1, boost: false });
    }
    expect(left.state.yaw).toBeGreaterThan(-0.1);
    expect(right.state.yaw).toBeLessThan(-0.1);
    expect(left.state.steeringAngle).toBeGreaterThan(0);
    expect(right.state.steeringAngle).toBeLessThan(0);
  });

  test("developer boost scales traversal only and never multiplies recovered yaw", () => {
    const normal = controller(flatWorld());
    const boosted = controller(flatWorld());
    for (let frame = 0; frame < 90; frame += 1) {
      const input = { throttle: 1, steering: 1, boost: false };
      normal.update(nativeDrivingFixedStepSeconds, input);
      boosted.update(nativeDrivingFixedStepSeconds, { ...input, boost: true });
    }
    expect(boosted.state.yaw).toBe(normal.state.yaw);
    expect(boosted.state.steeringAngle).toBe(normal.state.steeringAngle);
    expect(boosted.state.distanceTravelled).toBeGreaterThan(normal.state.distanceTravelled);
  });

});

function auxiliaryBarrierCollision(groundY: number, extraY: number): CompiledFieldCollision {
  return {
    triangleCount: 4,
    positions: new Float32Array([
      0, groundY, 0, 1600, groundY, 0, 0, groundY, 1600,
      1600, groundY, 0, 1600, groundY, 1600, 0, groundY, 1600,
      0, extraY, 0, 1600, extraY, 0, 0, extraY, 1600,
      1600, extraY, 0, 1600, extraY, 1600, 0, extraY, 1600,
    ]),
    surfaceFlags: new Uint32Array([0, 0, 0x1000_0000, 0x1000_0000]),
  };
}
