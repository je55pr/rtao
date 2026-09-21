import { describe, expect, test } from "vitest";
import type { CompiledFieldCollision } from "../formats/fieldCollision";
import { ArcadeCarController, BrowserDrivingGame } from "./drivingGame";
import { applyNativeDrivingEquipment } from "./nativeDrivingEquipment";
import { nativeDrivingFixedStepSeconds, nativeDrivingSurfaceIndex } from "./nativeDrivingMotion";
import type { NativeRaceCollisionPoint } from "./nativeRaceCollision";
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

class PositionSurfaceWorld extends DrivingWorld {
  constructor() {
    super();
    for (const field of allWorldFieldNumbers()) this.addCompiledField(field, flatFieldCollision());
  }

  override drivingSurface(_originFieldNumber: number, position: Vec3, _referenceY?: number): DrivingSurfaceKind {
    return position.z > 555.4 ? "snow" : "dry";
  }
}

class NativeOnlyWorld extends DrivingWorld {
  footprintCalls = 0;

  constructor(private readonly auxiliaryY = 0) {
    super();
  }

  override hasNativeField(_fieldNumber: number): boolean {
    return true;
  }

  override queryNativeContact(_originFieldNumber: number, point: NativeRaceCollisionPoint) {
    const hit: NativeRaceCollisionPoint = [point[0], 0, point[2], this.auxiliaryY];
    return { point: hit, flags: 0x550, ceilingY: 10000 };
  }

  override resolveFootprint(..._args: Parameters<DrivingWorld["resolveFootprint"]>): never {
    this.footprintCalls += 1;
    throw new Error("native standard-FLD initialization must not resolve a browser footprint");
  }

  override drivingSurface(): DrivingSurfaceKind {
    return "dry";
  }
}

function controller(world: DrivingWorld): ArcadeCarController {
  return new ArcadeCarController(world, syntheticNativeDrivingMotionAuthority());
}

const drive = { throttle: 1, steering: 0, boost: false } as const;
const nativeSurfaceCases = [
  { kind: "dry", flags: 0x550, index: 0, tyreSelector: 3 },
  { kind: "dirt", flags: 0x111, index: 1, tyreSelector: 8 },
  { kind: "wet", flags: 0x002, index: 2, tyreSelector: 6 },
  { kind: "grass", flags: 0x313, index: 3, tyreSelector: 8 },
  { kind: "snow", flags: 0x444, index: 4, tyreSelector: 10 },
  { kind: "ice", flags: 0x455, index: 5, tyreSelector: 9 },
] as const;

function collisionSurfaceWorld(surfaceFlags: number): DrivingWorld {
  const world = new DrivingWorld();
  for (const field of allWorldFieldNumbers()) world.addCompiledField(field, flatFieldCollision(0, surfaceFlags));
  return world;
}

describe("recovered driving integration", () => {
  test("initializes and relocates native standard FLD contact without the browser four-point resolver", () => {
    const world = new NativeOnlyWorld();
    const car = new ArcadeCarController(
      world,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
    );
    expect(world.footprintCalls).toBe(0);
    expect(car.state.contactHasGroundSupport).toBe(true);
    expect(car.state.nativeBodyMatrix).toBeDefined();

    car.teleport(223, { x: 700, y: 0, z: 700 }, 0.25);
    expect(world.footprintCalls).toBe(0);
    expect(car.state.position.x).toBeCloseTo(700, 5);
    expect(car.state.position.z).toBeCloseTo(700, 5);
  });

  test("runs explicit relocation seeding before the relocated state is rendered", () => {
    const events: string[] = [];
    type DrivingGameArgs = ConstructorParameters<typeof BrowserDrivingGame>;
    const view = {
      updateDriving: (fieldNumber: number) => events.push(`view:${fieldNumber}`),
      updateSpecialOutdoorDriving: () => events.push("view:special"),
    } as unknown as DrivingGameArgs[1];
    const car = {
      setNativeBodyMatrix: () => undefined,
      setWheelState: () => undefined,
    } as unknown as DrivingGameArgs[2];
    const input = {
      createScope: () => ({ reset: () => undefined }),
    } as unknown as DrivingGameArgs[4];
    const game = new BrowserDrivingGame(
      new NativeOnlyWorld(),
      view,
      car,
      (state) => events.push(`state:${state.fieldNumber}`),
      input,
      syntheticNativeDrivingMotionAuthority(),
    );

    game.enterArea(113, { x: 700, z: 700 }, { yaw: 1.25, beforeRender: (state) => {
      events.push(`seed:${state.fieldNumber}`);
      expect(state.position.x).toBeCloseTo(700, 5);
      expect(state.position.z).toBeCloseTo(700, 5);
      expect(state.yaw).toBeCloseTo(1.25, 4);
    } });

    expect(events).toEqual(["seed:113", "view:113", "state:113"]);
  });

  test("primes already-equipped Big Tyre with its native lift and shoreline threshold", () => {
    const ordinary = new ArcadeCarController(
      new NativeOnlyWorld(0.8),
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
    );
    const big = new ArcadeCarController(
      new NativeOnlyWorld(0.8),
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
      { selectedItem: (_loadout, category) => category === 1 ? 11 : 0 },
    );

    expect(ordinary.state.contactSpecialState).toBe(1);
    expect(big.state.contactSpecialState).toBe(-1);
    expect(big.state.contactRuntimeFlags & 0x40).toBe(0x40);
    expect(big.state.nativeBodyMatrix).toBeDefined();
    expect(ordinary.state.nativeBodyMatrix).toBeDefined();
    expect(big.state.nativeBodyMatrix![13]! - ordinary.state.nativeBodyMatrix![13]!).toBeCloseTo(0.85, 7);
  });

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

  test("reports the resolved surface at the post-step position without changing contact physics", () => {
    const world = new PositionSurfaceWorld();
    const car = controller(world);
    let crossed = false;
    for (let frame = 0; frame < 120; frame += 1) {
      const beforeZ = car.state.position.z;
      car.update(nativeDrivingFixedStepSeconds, drive);
      if (beforeZ <= 555.4 && car.state.position.z > 555.4) {
        expect(car.state.surfaceKind).toBe("snow");
        crossed = true;
        break;
      }
    }
    expect(crossed).toBe(true);
  });

  test.each(nativeSurfaceCases)("feeds sustained $kind contact into native tyre slot $index", ({ kind, flags, index, tyreSelector }) => {
    const world = collisionSurfaceWorld(flags);
    const normal = controller(world);
    const equipped = controller(world);
    equipped.setNativeTyreSelector(tyreSelector);
    expect(normal.state.surfaceKind).toBe(kind);
    expect(nativeDrivingSurfaceIndex(normal.state.surfaceKind)).toBe(index);
    for (let frame = 0; frame < 90; frame += 1) {
      const input = { throttle: 1, steering: frame < 20 ? 0 : 1, boost: false } as const;
      normal.update(nativeDrivingFixedStepSeconds, input);
      equipped.update(nativeDrivingFixedStepSeconds, input);
    }
    expect(equipped.state.surfaceKind).toBe(kind);
    expect([equipped.state.speed, equipped.state.yaw, equipped.state.nativeSlipAngle, equipped.state.distanceTravelled])
      .not.toEqual([normal.state.speed, normal.state.yaw, normal.state.nativeSlipAngle, normal.state.distanceTravelled]);
  });

  test.each(nativeSurfaceCases)("keeps special-outdoor $kind contact on native tyre slot $index", ({ kind, flags, index, tyreSelector }) => {
    const world = flatWorld();
    world.addCompiledSpecialOutdoor(16, flatFieldCollision(0, flags));
    const normal = controller(world);
    const equipped = controller(world);
    normal.enterSpecialOutdoor(16, { x: 800, z: 800 });
    equipped.enterSpecialOutdoor(16, { x: 800, z: 800 });
    equipped.setNativeTyreSelector(tyreSelector);
    expect(nativeDrivingSurfaceIndex(normal.state.surfaceKind)).toBe(index);
    for (let frame = 0; frame < 90; frame += 1) {
      const input = { throttle: 1, steering: frame < 20 ? 0 : 1, boost: false } as const;
      normal.update(nativeDrivingFixedStepSeconds, input);
      equipped.update(nativeDrivingFixedStepSeconds, input);
    }
    expect(equipped.state.surfaceKind).toBe(kind);
    expect([equipped.state.speed, equipped.state.yaw, equipped.state.nativeSlipAngle, equipped.state.distanceTravelled])
      .not.toEqual([normal.state.speed, normal.state.yaw, normal.state.nativeSlipAngle, normal.state.distanceTravelled]);
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
  test("carries the recovered surface class across an ordinary field seam", () => {
    const world = new DrivingWorld();
    for (const field of allWorldFieldNumbers()) {
      world.addCompiledField(field, flatFieldCollision(0, field === 223 ? 0x550 : 0x455));
    }
    const normal = controller(world);
    const studless = controller(world);
    normal.teleport(223, { x: 1598, y: 0, z: 800 }, Math.PI / 2);
    studless.teleport(223, { x: 1598, y: 0, z: 800 }, Math.PI / 2);
    studless.setNativeTyreSelector(9);
    let crossed = false;
    for (let frame = 0; frame < 120; frame += 1) {
      const input = { ...drive, boost: true };
      normal.update(nativeDrivingFixedStepSeconds, input);
      studless.update(nativeDrivingFixedStepSeconds, input);
      if (normal.state.fieldNumber !== 223) {
        expect(studless.state.position).toEqual(normal.state.position);
        expect(normal.state.surfaceKind).toBe("ice");
        expect(studless.state.surfaceKind).toBe("ice");
        crossed = true;
        break;
      }
    }
    expect(crossed).toBe(true);
    for (let frame = 0; frame < 30; frame += 1) {
      normal.update(nativeDrivingFixedStepSeconds, drive);
      studless.update(nativeDrivingFixedStepSeconds, drive);
    }
    expect(normal.state.surfaceKind).toBe("ice");
    expect(studless.state.surfaceKind).toBe("ice");
    expect(studless.state.distanceTravelled).not.toBe(normal.state.distanceTravelled);
  });

  test("crosses shallow/deep auxiliary contact and reverses back out without a rescue jump", () => {
    const world = new DrivingWorld();
    world.addCompiledField(223, slopedWaterCollision(0, 555, 575, 1));
    const car = new ArcadeCarController(
      world,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 552 },
      0,
    );
    let sawShallow = false, sawDeep = false, sawShallowPulse = false;
    let previousPosition = car.state.position;
    let previousDistance = car.state.distanceTravelled;
    for (let frame = 0; frame < 600; frame += 1) {
      car.update(nativeDrivingFixedStepSeconds, drive);
      sawShallow ||= car.state.contactSpecialState === -1;
      sawDeep ||= car.state.contactSpecialState === 1;
      sawShallowPulse ||= car.state.contactSpecialState === -1 && (car.state.contactRuntimeFlags & 0x40) !== 0;
      const moved = Math.hypot(
        car.state.position.x - previousPosition.x,
        car.state.position.z - previousPosition.z,
      );
      expect(moved).toBeLessThanOrEqual(car.state.distanceTravelled - previousDistance + 1e-8);
      previousPosition = car.state.position;
      previousDistance = car.state.distanceTravelled;
      if (sawDeep && car.state.position.z > 568) break;
    }
    expect(sawShallow).toBe(true);
    expect(sawShallowPulse).toBe(true);
    expect(sawDeep).toBe(true);
    expect(car.state.surfaceKind).toBe("dry");
    expect(car.state.nativeContactSurfaceFlags & 7).toBe(1);
    const deepZ = car.state.position.z;
    const deepDistance = car.state.distanceTravelled;

    let sawShallowOnExit = false, sawOrdinaryOnExit = false, sawExitPulse = false;
    for (let frame = 0; frame < 800; frame += 1) {
      const before = car.state;
      car.update(nativeDrivingFixedStepSeconds, { throttle: -1, steering: 0, boost: false });
      if (car.state.contactSpecialState === -1) sawShallowOnExit = true;
      if (sawShallowOnExit && car.state.contactSpecialState === 0) {
        sawOrdinaryOnExit = true;
        sawExitPulse = (car.state.contactRuntimeFlags & 0x40) !== 0;
        break;
      }
      const moved = Math.hypot(
        car.state.position.x - before.position.x,
        car.state.position.z - before.position.z,
      );
      expect(moved).toBeLessThanOrEqual(car.state.distanceTravelled - before.distanceTravelled + 1e-8);
    }
    expect(sawShallowOnExit).toBe(true);
    expect(sawOrdinaryOnExit).toBe(true);
    expect(sawExitPulse).toBe(true);
    expect(car.state.position.z).toBeLessThan(deepZ);
    expect(car.state.distanceTravelled).toBeGreaterThan(deepDistance);
  });

  test("uses Big Tyre's recovered 1.35 shoreline threshold without rejecting either contact", () => {
    const normalWorld = new DrivingWorld();
    normalWorld.addCompiledField(223, auxiliaryBarrierCollision(0, 0.8));
    const bigWorld = new DrivingWorld();
    bigWorld.addCompiledField(223, auxiliaryBarrierCollision(0, 0.8));
    const normal = controller(normalWorld);
    const big = controller(bigWorld);
    big.setNativeTyreSelector(11);
    normal.update(nativeDrivingFixedStepSeconds, drive);
    big.update(nativeDrivingFixedStepSeconds, drive);
    expect(normal.state.contactSpecialState).toBe(1);
    expect(big.state.contactSpecialState).toBe(-1);
    expect(normal.state.distanceTravelled).toBeGreaterThan(0);
    expect(big.state.distanceTravelled).toBeGreaterThan(0);
    expect(normal.state.surfaceKind).toBe("dry");
    expect(normal.state.nativeContactSurfaceFlags & 7).toBe(1);
    expect(big.state.nativeContactSurfaceFlags & 7).toBe(0);
  });

  test("wires Propeller thrust and Water Ski unsupported steering as separate proven equipment roles", () => {
    const makeCar = (propeller: boolean, waterSki: boolean) => {
      const world = new DrivingWorld();
      world.addCompiledField(223, auxiliaryOnlyCollision(0.8));
      return new ArcadeCarController(
        world,
        syntheticNativeDrivingMotionAuthority(),
        223,
        { x: 800, y: 0, z: 800 },
        0,
        {
          selectedItem: (_loadout, category) =>
            ((category === 10 && propeller) || (category === 11 && waterSki)) ? 1 : 0,
        },
      );
    };
    const neither = makeCar(false, false);
    const skiOnly = makeCar(false, true);
    const propellerOnly = makeCar(true, false);
    const both = makeCar(true, true);
    for (let frame = 0; frame < 120; frame += 1) {
      for (const car of [neither, skiOnly, propellerOnly, both]) {
        car.update(nativeDrivingFixedStepSeconds, { throttle: 1, steering: 1, boost: false });
      }
    }
    expect(neither.state.distanceTravelled).toBe(0);
    expect(skiOnly.state.distanceTravelled).toBe(0);
    expect(propellerOnly.state.distanceTravelled).toBeGreaterThan(0);
    expect(both.state.distanceTravelled).toBeGreaterThan(0);
    expect(Math.abs(propellerOnly.state.yaw)).toBe(0);
    expect(Math.abs(both.state.yaw)).toBeGreaterThan(0);
    expect(both.state.contactSpecialState).toBe(1);
    expect(both.state.contactHasGroundSupport).toBe(false);
    expect(both.state.surfaceKind).toBe("other");
    expect(both.state.nativeContactSurfaceFlags & 7).toBe(1);

    const reverse = makeCar(true, false);
    const startZ = reverse.state.position.z;
    for (let frame = 0; frame < 120; frame += 1) {
      reverse.update(nativeDrivingFixedStepSeconds, { throttle: -1, steering: 0, boost: false });
    }
    expect(reverse.state.position.z).toBeLessThan(startZ);
    expect(reverse.state.distanceTravelled).toBeGreaterThan(0);
  });

  test("keeps sustained deep-water slowdown active without Water Ski", () => {
    const dryWorld = new DrivingWorld();
    dryWorld.addCompiledField(223, flatFieldCollision(0));
    const waterWorld = new DrivingWorld();
    waterWorld.addCompiledField(223, auxiliaryBarrierCollision(0, 0.8));
    const dry = new ArcadeCarController(
      dryWorld,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
    );
    const water = new ArcadeCarController(
      waterWorld,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
    );

    let stayedDeep = true;
    for (let frame = 0; frame < 240; frame += 1) {
      dry.update(nativeDrivingFixedStepSeconds, drive);
      water.update(nativeDrivingFixedStepSeconds, drive);
      stayedDeep &&= water.state.contactSpecialState === 1;
    }

    expect(stayedDeep).toBe(true);
    expect(water.state.contactHasGroundSupport).toBe(true);
    expect(water.state.nativeContactSurfaceFlags & 7).toBe(1);
    expect(water.state.distanceTravelled).toBeLessThan(dry.state.distanceTravelled);
  });

  test("applies and removes Water Ski live from selector-backed free-roam ability state", () => {
    const world = new DrivingWorld();
    world.addCompiledField(223, auxiliaryOnlyCollision(0.8));
    const car = new ArcadeCarController(
      world,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
    );
    let waterSkiSelector = 0;
    const equipment = {
      selectedItem: (_loadout: number, category: number) => {
        if (category === 10) return 1;
        if (category === 11) return waterSkiSelector;
        return 0;
      },
    };
    const runUnsupported = () => {
      for (let frame = 0; frame < 120; frame += 1) {
        car.update(nativeDrivingFixedStepSeconds, { throttle: 1, steering: 1, boost: false });
      }
    };
    const reset = () => car.teleport(223, { x: 800, y: 0, z: 800 }, 0);

    applyNativeDrivingEquipment(car, equipment);
    reset();
    runUnsupported();
    expect(car.state.distanceTravelled).toBeGreaterThan(0);
    expect(Math.abs(car.state.yaw)).toBe(0);

    waterSkiSelector = 1;
    applyNativeDrivingEquipment(car, equipment);
    reset();
    runUnsupported();
    expect(Math.abs(car.state.yaw)).toBeGreaterThan(0);

    waterSkiSelector = 0;
    applyNativeDrivingEquipment(car, equipment);
    reset();
    runUnsupported();
    expect(Math.abs(car.state.yaw)).toBe(0);
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

function auxiliaryOnlyCollision(extraY: number): CompiledFieldCollision {
  return {
    triangleCount: 2,
    positions: new Float32Array([
      0, extraY, 0, 1600, extraY, 0, 0, extraY, 1600,
      1600, extraY, 0, 1600, extraY, 1600, 0, extraY, 1600,
    ]),
    surfaceFlags: new Uint32Array([0x1000_0000, 0x1000_0000]),
  };
}

function slopedWaterCollision(
  groundY: number,
  shoreZ: number,
  deepZ: number,
  deepY: number,
): CompiledFieldCollision {
  return {
    triangleCount: 4,
    positions: new Float32Array([
      0, groundY, 0, 1600, groundY, 0, 0, groundY, 1600,
      1600, groundY, 0, 1600, groundY, 1600, 0, groundY, 1600,
      0, groundY, shoreZ, 1600, groundY, shoreZ, 0, deepY, deepZ,
      1600, groundY, shoreZ, 1600, deepY, deepZ, 0, deepY, deepZ,
    ]),
    surfaceFlags: new Uint32Array([0, 0, 0x1000_0000, 0x1000_0000]),
  };
}

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
