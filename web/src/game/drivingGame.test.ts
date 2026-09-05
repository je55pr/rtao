import { describe, expect, test } from "vitest";
import { allWorldFieldNumbers } from "./worldTopology";
import { DrivingWorld, flatFieldCollision, type DrivingSurfaceKind, type Vec3 } from "./worldCollision";
import { ArcadeCarController } from "./drivingGame";
import { aggregatePartPerformance, equipPart, defaultPartLoadout } from "./parts";

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

describe("arcade driving", () => {
  test("accelerates the car with a deterministic fixed timestep", () => {
    const car = new ArcadeCarController(flatWorld());
    for (let frame = 0; frame < 120; frame += 1) car.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    expect(car.state.speed).toBeCloseTo(19, 4);
    expect(car.state.position.z).toBeGreaterThan(570);
    expect(car.state.distanceTravelled).toBeGreaterThan(15);
  });

  test("counts only successful driven distance and never debug teleports", () => {
    const car = new ArcadeCarController(flatWorld());
    const initialDistance = car.state.distanceTravelled;
    car.teleport(223, { x: 1_200, y: 0, z: 800 }, 0);
    expect(car.state.distanceTravelled).toBe(initialDistance);
    for (let frame = 0; frame < 60; frame += 1) car.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    const drivenDistance = car.state.distanceTravelled;
    expect(drivenDistance).toBeGreaterThan(4);
    car.teleport(113, { x: 800, y: 0, z: 800 }, Math.PI);
    expect(car.state.distanceTravelled).toBe(drivenDistance);
  });

  test("drives through an X sector seam without losing collision", () => {
    const car = new ArcadeCarController(flatWorld());
    car.teleport(223, { x: 1598, y: 0, z: 800 }, Math.PI / 2);
    for (let frame = 0; frame < 120; frame += 1) car.update(1 / 60, { throttle: 1, steering: 0, boost: true });
    expect(car.state.fieldNumber).not.toBe(223);
    expect(car.state.position.x).toBeGreaterThanOrEqual(0);
    expect(car.state.position.x).toBeLessThanOrEqual(1600);
  });

  test("applies executable-backed native tyre grip on classified road and dirt surfaces", () => {
    const normalRoad = new ArcadeCarController(new ForcedSurfaceWorld("paved-road"));
    const sportsRoad = new ArcadeCarController(new ForcedSurfaceWorld("paved-road"));
    sportsRoad.setNativeTyreSelector(1);
    for (let frame = 0; frame < 60; frame += 1) {
      normalRoad.update(1 / 60, { throttle: 1, steering: 0, boost: false });
      sportsRoad.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    }
    expect(sportsRoad.state.speed).toBeGreaterThan(normalRoad.state.speed * 1.2);

    const normalDirt = new ArcadeCarController(new ForcedSurfaceWorld("dirt"));
    const offRoadDirt = new ArcadeCarController(new ForcedSurfaceWorld("dirt"));
    offRoadDirt.setNativeTyreSelector(7);
    for (let frame = 0; frame < 60; frame += 1) {
      normalDirt.update(1 / 60, { throttle: 1, steering: 0, boost: false });
      offRoadDirt.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    }
    expect(offRoadDirt.state.speed).toBeGreaterThan(normalDirt.state.speed * 1.15);
  });

  test("keeps Off Road Tyre equal to Normal on dry roads and unresolved surfaces neutral", () => {
    const normalRoad = new ArcadeCarController(new ForcedSurfaceWorld("paved-road"));
    const offRoadRoad = new ArcadeCarController(new ForcedSurfaceWorld("paved-road"));
    offRoadRoad.setNativeTyreSelector(7);
    const normalOther = new ArcadeCarController(new ForcedSurfaceWorld("other"));
    const bigOther = new ArcadeCarController(new ForcedSurfaceWorld("other"));
    bigOther.setNativeTyreSelector(11);
    for (let frame = 0; frame < 60; frame += 1) {
      const input = { throttle: 1, steering: 0, boost: false };
      normalRoad.update(1 / 60, input);
      offRoadRoad.update(1 / 60, input);
      normalOther.update(1 / 60, input);
      bigOther.update(1 / 60, input);
    }
    expect(offRoadRoad.state.speed).toBeCloseTo(normalRoad.state.speed, 8);
    expect(bigOther.state.speed).toBeCloseTo(normalOther.state.speed, 8);
  });

  test("applies Wet and Studless tyre coefficients on recovered wet, snow and ice surfaces", () => {
    const pairs = [
      { surface: "wet" as const, selector: 6 },
      { surface: "snow" as const, selector: 9 },
      { surface: "ice" as const, selector: 9 },
    ];
    for (const { surface, selector } of pairs) {
      const normal = new ArcadeCarController(new ForcedSurfaceWorld(surface));
      const specialist = new ArcadeCarController(new ForcedSurfaceWorld(surface));
      specialist.setNativeTyreSelector(selector);
      for (let frame = 0; frame < 60; frame += 1) {
        const input = { throttle: 1, steering: 0, boost: false };
        normal.update(1 / 60, input);
        specialist.update(1 / 60, input);
      }
      expect(specialist.state.speed).toBeGreaterThan(normal.state.speed * 1.7);
    }
  });

  test("applies the selected native engine tuning", () => {
    const standard = new ArcadeCarController(flatWorld());
    const upgraded = new ArcadeCarController(flatWorld());
    let loadout = equipPart(defaultPartLoadout, "engine", "blue-max-engine");
    upgraded.setPartPerformance(aggregatePartPerformance(loadout));
    for (let frame = 0; frame < 60; frame += 1) {
      standard.update(1 / 60, { throttle: 1, steering: 0, boost: false });
      upgraded.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    }
    expect(upgraded.state.speed).toBeGreaterThan(standard.state.speed * 1.25);
  });

  test("applies the PAL Light Chassis inverse-mass response to drive force", () => {
    const normal = new ArcadeCarController(flatWorld());
    const light = new ArcadeCarController(flatWorld());
    light.setPartPerformance(aggregatePartPerformance(equipPart(defaultPartLoadout, "chassis", "light-chassis")));
    for (let frame = 0; frame < 60; frame += 1) {
      const input = { throttle: 1, steering: 0, boost: false };
      normal.update(1 / 60, input);
      light.update(1 / 60, input);
    }
    expect(light.state.speed / normal.state.speed).toBeCloseTo(25 / 22, 8);
  });

  test("applies native Speed Transmission launch and terminal ratios", () => {
    const normal = new ArcadeCarController(flatWorld());
    const speed = new ArcadeCarController(flatWorld());
    speed.setPartPerformance(aggregatePartPerformance(equipPart(defaultPartLoadout, "transmission", "speed-transmission")));
    normal.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    speed.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    expect(speed.state.speed / normal.state.speed).toBeCloseTo(116 / 128, 8);
    for (let frame = 1; frame < 360; frame += 1) {
      const input = { throttle: 1, steering: 0, boost: false };
      normal.update(1 / 60, input);
      speed.update(1 / 60, input);
    }
    expect(normal.state.speed).toBeCloseTo(28, 8);
    expect(speed.state.speed).toBeCloseTo(28 * 660 / 446, 8);
  });

  test("applies and resets the PAL Metal Pad hold curve one fixed update at a time", () => {
    const car = new ArcadeCarController(flatWorld());
    car.setNativeBrakeSelector(3);
    for (let frame = 0; frame < 60; frame += 1) car.update(1 / 60, { throttle: 1, steering: 0, boost: false });
    const beforeBraking = car.state.speed;
    for (let frame = 0; frame < 16; frame += 1) car.update(1 / 60, { throttle: -1, steering: 0, boost: false });
    const firstSixteenForceSum = [1, 1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 10, 13, 16]
      .reduce((sum, value) => sum + Math.floor(value * 10_000 / 32), 0);
    expect(beforeBraking - car.state.speed).toBeCloseTo(18 / 10_000 / 60 * firstSixteenForceSum, 8);

    car.update(1 / 60, { throttle: 0, steering: 0, boost: false });
    const beforeRestart = car.state.speed;
    car.update(1 / 60, { throttle: -1, steering: 0, boost: false });
    expect(beforeRestart - car.state.speed).toBeCloseTo(18 * 312 / 10_000 / 60, 8);
  });

  test("applies the PAL Quick Steering scalar through the live controller", () => {
    const normal = new ArcadeCarController(flatWorld());
    const quick = new ArcadeCarController(flatWorld());
    quick.setPartPerformance(aggregatePartPerformance(equipPart(defaultPartLoadout, "steering", "quick-steering")));
    for (let frame = 0; frame < 60; frame += 1) {
      const input = { throttle: 1, steering: 1, boost: false };
      normal.update(1 / 60, input);
      quick.update(1 / 60, input);
    }
    expect(Math.abs(quick.state.steeringAngle)).toBeGreaterThan(Math.abs(normal.state.steeringAngle) * 1.45);
    expect(Math.abs(quick.state.yaw)).toBeGreaterThan(Math.abs(normal.state.yaw) * 1.35);
  });
});
