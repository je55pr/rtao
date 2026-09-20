import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { nativeCollisionSurfaceLabel, surfaceLabel } from "../src/app/debugDiagnostics";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { compileFieldCollision, type CompiledFieldCollision } from "../src/formats/fieldCollision";
import { compileFieldVertexColorMesh } from "../src/formats/fieldGeometry";
import { ArcadeCarController } from "../src/game/drivingGame";
import { nativeDrivingFixedStepSeconds, readNativeDrivingMotionAuthority } from "../src/game/nativeDrivingMotion";
import { DrivingWorld, type Vec3 } from "../src/game/worldCollision";

const binPath = process.env.RTA_PAL_BIN;

async function openPalDisc(path: string): Promise<{ disc: Iso9660Disc; close(): void }> {
  const handle = openSync(path, "r");
  const source = new RawMode2SectorSource({
    size: fstatSync(handle).size,
    label: "local PAL BIN",
    async read(offset, length) {
      const bytes = new Uint8Array(length);
      if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
      return bytes;
    },
  });
  try {
    return { disc: await Iso9660Disc.open(source), close: () => closeSync(handle) };
  } catch (error) {
    closeSync(handle);
    throw error;
  }
}

async function addField(world: DrivingWorld, disc: Iso9660Disc, fieldNumber: number): Promise<CompiledFieldCollision> {
  const path = `FLD/${fieldNumber.toString().padStart(3, "0")}.BIN`;
  const bytes = await disc.readFile(path);
  const collision = compileFieldCollision(bytes);
  world.addCompiledField(fieldNumber, collision);
  world.addCompiledFieldSurface(fieldNumber, compileFieldVertexColorMesh(bytes));
  return collision;
}

function expectSurface(
  world: DrivingWorld,
  fieldNumber: number,
  point: Vec3,
  expectedFlags: number,
  expectedKind: "paved-road" | "dry" | "dirt" | "grass" | "snow" | "ice",
): void {
  const ground = world.sampleGround(fieldNumber, point, point.y);
  expect(ground, `FLD/${fieldNumber} ground at ${JSON.stringify(point)}`).toBeDefined();
  expect(ground?.surfaceFlags >>> 0).toBe(expectedFlags >>> 0);
  expect(world.drivingSurface(fieldNumber, point, point.y)).toBe(expectedKind);
}

describe.skipIf(!binPath)("PAL integrated field surfaces and water contact", () => {
  test("classifies retained real field and Cloud Hill witnesses exactly", async () => {
    const opened = await openPalDisc(binPath!);
    try {
      const world = new DrivingWorld();
      await addField(world, opened.disc, 13);
      await addField(world, opened.disc, 203);
      await addField(world, opened.disc, 223);

      const dryRoad = { x: 963.18809, y: 30, z: 3.619033 };
      expectSurface(world, 223, dryRoad, 0x0000_0000, "paved-road");
      expect(surfaceLabel(world.drivingSurface(223, dryRoad, dryRoad.y))).toBe("Paved road");
      expect(nativeCollisionSurfaceLabel(0)).toBe("Dry · selector 0 · 0x00000000");

      const offRoad = { x: 1586.666667, y: 25, z: 13.333333 };
      expectSurface(world, 13, offRoad, 0x0000_0111, "dirt");
      expect(nativeCollisionSurfaceLabel(0x0000_0111)).toBe("Off-road · selector 1 · 0x00000111");

      expectSurface(
        world,
        13,
        { x: 733.184713, y: 30.268749, z: 344.159627 },
        0x0000_0313,
        "grass",
      );
      expectSurface(
        world,
        203,
        { x: 1129.941935, y: 234, z: 206.001343 },
        0x0000_0444,
        "snow",
      );
      expectSurface(
        world,
        203,
        { x: 873.333333, y: 231.979996, z: 293.333333 },
        0x0000_0455,
        "ice",
      );
      expect(nativeCollisionSurfaceLabel(0x0000_0313)).toBe("Grass · selector 3 · 0x00000313");
      expect(nativeCollisionSurfaceLabel(0x0000_0444)).toBe("Snow · selector 4 · 0x00000444");
      expect(nativeCollisionSurfaceLabel(0x0000_0455)).toBe("Ice · selector 5 · 0x00000455");

      // The minimap road ribbon remains authoritative over the underlying tyre selector.
      const whiteMountainRoad = { x: 691.666667, y: 186, z: 93.333333 };
      expectSurface(world, 203, whiteMountainRoad, 0x0000_0111, "paved-road");

      const action = await opened.disc.readFile("ACTION/A16.BIN");
      world.addCompiledSpecialOutdoor(64, compileFieldCollision(action));
      world.addCompiledSpecialOutdoorSurface(64, compileFieldVertexColorMesh(action));
      const cloudHill = { x: 1466.666667, y: 50, z: 133.333333 };
      const cloudGround = world.sampleSpecialOutdoorGround(64, cloudHill, cloudHill.y);
      expect(cloudGround?.surfaceFlags >>> 0).toBe(0x0000_2550);
      expect(world.specialOutdoorDrivingSurface(64, cloudHill, cloudHill.y)).toBe("dry");
      expect(nativeCollisionSurfaceLabel(cloudGround?.surfaceFlags ?? 0))
        .toBe("Dry · selector 0 · 0x00002550");
    } finally {
      opened.close();
    }
  }, 120_000);

  test("feeds real Snow and Ice contacts into the recovered tyre response", async () => {
    const opened = await openPalDisc(binPath!);
    try {
      const world = new DrivingWorld();
      await addField(world, opened.disc, 203);
      const authority = readNativeDrivingMotionAuthority(await opened.disc.readFile("SLES_513.56"));
      const cases = [
        { kind: "snow", point: { x: 1129.941935, y: 234, z: 206.001343 }, tyre: 10 },
        { kind: "ice", point: { x: 873.333333, y: 231.979996, z: 293.333333 }, tyre: 9 },
      ] as const;

      for (const sample of cases) {
        const normal = new ArcadeCarController(world, authority, 203, sample.point, 0);
        const specialist = new ArcadeCarController(world, authority, 203, sample.point, 0);
        specialist.setNativeTyreSelector(sample.tyre);
        expect(normal.state.surfaceKind).toBe(sample.kind);
        expect(specialist.state.surfaceKind).toBe(sample.kind);
        for (let tick = 0; tick < 30; tick += 1) {
          const input = { throttle: 1, steering: tick < 10 ? 0 : 1, boost: false } as const;
          normal.update(nativeDrivingFixedStepSeconds, input);
          specialist.update(nativeDrivingFixedStepSeconds, input);
        }
        expect([
          specialist.state.speed,
          specialist.state.yaw,
          specialist.state.nativeSlipAngle,
          specialist.state.distanceTravelled,
        ]).not.toEqual([
          normal.state.speed,
          normal.state.yaw,
          normal.state.nativeSlipAngle,
          normal.state.distanceTravelled,
        ]);
      }
    } finally {
      opened.close();
    }
  }, 120_000);

  test("crosses the retained Peach north-road field seam without changing surface/contact state", async () => {
    const opened = await openPalDisc(binPath!);
    try {
      const world = new DrivingWorld();
      await addField(world, opened.disc, 223);
      await addField(world, opened.disc, 221);
      const authority = readNativeDrivingMotionAuthority(await opened.disc.readFile("SLES_513.56"));
      const car = new ArcadeCarController(
        world,
        authority,
        223,
        { x: 960.15, y: 31, z: 40 },
        Math.PI,
      );

      expect(car.state.surfaceKind).toBe("paved-road");
      for (let tick = 0; tick < 800 && car.state.fieldNumber === 223; tick += 1) {
        car.update(nativeDrivingFixedStepSeconds, { throttle: 1, steering: 0, boost: false });
      }

      expect(car.state.fieldNumber).toBe(221);
      expect(car.state.location).toEqual({ kind: "standard-world", fieldNumber: 221 });
      expect(car.state.position.x).toBeCloseTo(160.15, 6);
      expect(car.state.position.z).toBeGreaterThan(1599);
      expect(car.state.surfaceKind).toBe("paved-road");
      expect(car.state.surfaceFlags >>> 0).toBe(0);
      expect(car.state.contactSpecialState).toBe(0);
      expect(car.state.contactHasGroundSupport).toBe(true);
      expect(car.state.distanceTravelled).toBeGreaterThan(40);
    } finally {
      opened.close();
    }
  }, 120_000);

  test("keeps real shoreline auxiliary contact separate from Wet and from Water Ski propulsion", async () => {
    const opened = await openPalDisc(binPath!);
    try {
      const world = new DrivingWorld();
      await addField(world, opened.disc, 223);
      const authority = readNativeDrivingMotionAuthority(await opened.disc.readFile("SLES_513.56"));
      // Payload-free witness derived from FLD/223's retained 0x10000000 auxiliary plane.
      const shoreline = { x: 578.7818400065104, y: 20.5, z: 1317.1686328125 };
      const normal = new ArcadeCarController(world, authority, 223, shoreline, 0);
      const waterSki = new ArcadeCarController(world, authority, 223, shoreline, 0);
      waterSki.setNativeOptionSelector(1);

      for (const car of [normal, waterSki]) {
        expect(car.state.surfaceKind).toBe("dirt");
        expect(car.state.surfaceFlags >>> 0).toBe(0x0010_0651);
        expect(car.state.contactAuxiliaryY).toBe(21.5);
        expect(car.state.contactHasGroundSupport).toBe(true);
        expect(car.state.contactSpecialState).toBe(1);
        expect(car.state.nativeContactSurfaceFlags & 7).toBe(1);
      }

      for (let tick = 0; tick < 60; tick += 1) {
        const input = { throttle: 1, steering: 1, boost: false } as const;
        normal.update(nativeDrivingFixedStepSeconds, input);
        waterSki.update(nativeDrivingFixedStepSeconds, input);
      }
      // Water Ski's recovered 0x0100 role is unsupported-contact steering only.
      // At this ground-supported real shoreline it must not manufacture thrust or alter motion.
      expect(waterSki.state).toEqual(normal.state);
      expect(normal.state.distanceTravelled).toBeGreaterThan(0);
      expect(normal.state.surfaceKind).not.toBe("wet");

      const big = new ArcadeCarController(world, authority, 223, shoreline, 0);
      big.setNativeTyreSelector(11);
      big.teleport(223, shoreline, 0);
      expect(big.state.contactAuxiliaryY).toBe(21.5);
      expect(big.state.contactSpecialState).toBe(-1);
      expect(big.state.contactRuntimeFlags & 0x40).toBe(0x40);
    } finally {
      opened.close();
    }
  }, 120_000);
});
