import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { readDialogueEntity, readDialogueEntityAtIndex } from "../src/formats/dialogue";
import { Elf32AddressSpace } from "../src/formats/elf32";
import { readOverworldCatalogue } from "../src/formats/overworld";
import {
  advanceRaceNavigation,
  readRaceCatalogue,
  readRaceFinishGateSets,
  readRaceNavigationCourses,
  readRaceStartAnchors,
} from "../src/formats/raceCatalogue";
import { readShopInteriorBackdrop, shopInteriorSlotCount } from "../src/formats/shopInterior";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const binPath = process.env.RTA_PAL_BIN;

describe.skipIf(!executablePath)("promoted PAL executable witnesses", () => {
  const executable = (): Uint8Array => new Uint8Array(readFileSync(executablePath!));

  test("retains Peach fixed-interaction and roaming anchors", () => {
    const bytes = executable();
    const elf = new Elf32AddressSpace(bytes);
    const world = readOverworldCatalogue(bytes);
    const peach = world.authoredAreas[1]!;
    expect(peach).toMatchObject({ name: "Peach Town", fixedInteractionCount: 28, outdoorResidentCount: 11 });
    const fixed = world.interactions.filter((entry) => entry.areaIndex === 1);
    expect(fixed).toHaveLength(28);
    expect(fixed.map((entry) => entry.name)).toContain("Entrance to the cave");
    const factory = fixed[0]!;
    expect(factory.name).toBe("Q's Factory Staff");
    expect(factory.corners[0]?.[0]).toBeCloseTo(512.10, 2);
    expect(factory.corners[0]?.[1]).toBeCloseTo(432.10, 2);
    expect(center(factory.corners)).toEqual([expect.closeTo(508.57, 2), expect.closeTo(432.94, 2)]);
    expect(center(fixed[17]!.corners)).toEqual([expect.closeTo(1189.0, 1), expect.closeTo(528.78, 1)]);
    expect(fixed[13]!.corners.slice(0, 2)).toEqual([[-1, -1], [-1, -1]]);

    const residents = world.residents.filter((entry) => entry.areaIndex === 1);
    expect(residents.map((entry) => entry.name)).toEqual([
      "James", "Gonzo", "Ramsey", "Accel", "Cobran", "Flower",
      "Klien", "Barthou", "Pillow", "Kevin", "Newman",
    ]);
    expect(residents.map((entry) => entry.bodyId)).toEqual([91, 28, 10, 9, 56, 73, 30, 21, 68, 47, 14]);
    expect(residents[0]).toMatchObject({ spawn: { x: 459, y: 30, z: 786 } });
    expect(residents[0]!.route).toHaveLength(84);
    expect(residents[0]!.route[0]).toEqual({ x: 482, z: 484 });
    expect(Object.fromEntries(residents.filter((entry) => entry.route.length >= 2).map((entry) => [entry.name, entry.route.length]))).toEqual({
      James: 84, Klien: 19, Barthou: 36, Pillow: 25, Kevin: 29, Newman: 71,
    });
    expect(residents[1]!.paint).toEqual({ primary: { r: 25, g: 38, b: 216 }, secondary: { r: 216, g: 216, b: 216 } });
    expect(residents[9]).toMatchObject({ spawn: { x: 858, z: 392 }, paint: {
      primary: { r: 216, g: 25, b: 25 }, secondary: { r: 216, g: 25, b: 25 },
    } });
    expect(residents[9]!.route[0]).toEqual({ x: 858, z: 392 });

    const residentBlock = elf.u32(0x002c4340 + 4);
    expect(residentBlock + 28 * 16).toBe(0x002c2950);
    const routeArea = elf.u32(0x002dba28 + 4);
    expect(elf.u32(routeArea)).toBe(0x002c8170);
    expect(elf.u32(routeArea + 4)).toBe(0x002c8950);

    expect(rawOutdoorRouteTotals(elf)).toEqual({ residents: 81, moving: 77, routePoints: 3208 });
  });

  test("retains Peach dialogue pointer witnesses without inferring new semantics", () => {
    const bytes = executable();
    const factory = readDialogueEntityAtIndex(bytes, 1, 0);
    expect(factory.name).toBe("Q's Factory");
    expect(factory.entityAddress).toBe(0x002e2338);
    expect(factory.variants).toHaveLength(72);
    expect(factory.variants.find((variant) => variant.pointerTableSlot === 0x07)?.textAddress).toBe(0x00322350);
    expect(factory.variants.find((variant) => variant.pointerTableSlot === 0x0f)?.textAddress).toBe(0x003220d0);
    expect(factory.variants.find((variant) => variant.pointerTableSlot === 0x04)?.textAddress).toBe(0x003223a8);

    const james = readDialogueEntity(bytes, 1, "James");
    expect(james.entityIndex).toBe(28);
    expect(james.variants).toHaveLength(11);
    expect(james.variants.some((variant) => variant.textAddress === 0x00326aa0)).toBe(true);
  });

  test("retains real PAL race/navigation anchors already described by current archaeology", () => {
    const bytes = executable();
    const catalogue = readRaceCatalogue(bytes);
    expect(catalogue.activities).toHaveLength(39);
    expect(catalogue.ordinaryRaces).toHaveLength(24);
    expect(catalogue.activities[0]).toMatchObject({
      descriptorAddress: 0x002bfe48,
      settingsAddress: 0x002bf9f8,
      participantListAddress: 0x002bf728,
      handlerAAddress: 0x0022f3f8,
      handlerBAddress: 0x00252ba0,
    });
    const starts = readRaceStartAnchors(bytes);
    expect(starts).toHaveLength(15);
    expect(starts[0]).toMatchObject({ headingQuarterTurns: 1, lateralPolarity: 0 });
    expect(starts[0]!.nativeX).toBeCloseTo(572.2, 1);
    expect(starts[0]!.nativeY).toBeCloseTo(1.1, 1);
    expect(starts[0]!.nativeZ).toBeCloseTo(561.3, 1);

    const finish = readRaceFinishGateSets(bytes);
    expect(finish[0]!.strips[0]).toMatchObject({ minimumX: 588, minimumZ: 535, maximumX: 590 });
    expect(finish[0]!.strips[0].maximumZ).toBeCloseTo(576.8, 1);

    const navigation = readRaceNavigationCourses(bytes);
    expect(navigation.map((course) => course.gates.length)).toEqual([
      35, 43, 120, 143, 66, 163, 90, 128, 42, 37, 143, 90, 143, 224, 197,
    ]);
    expect(navigation.reduce((sum, course) => sum + course.gates.length, 0)).toBe(1664);
    expect(navigation[0]).toMatchObject({ gateTableAddress: 0x002ae698, recordTableAddress: 0x002ae9e0 });
    expect(navigation[0]!.gates[0]).toMatchObject({ gateIndex: 0 });
    expect(navigation[0]!.gates[0]!.endpointA.nativeX).toBeCloseTo(590, 3);
    expect(navigation[0]!.gates[0]!.endpointA.nativeZ).toBeCloseTo(569, 3);
    expect(navigation[0]!.gates[0]!.endpointB.nativeX).toBeCloseTo(590, 3);
    expect(navigation[0]!.gates[0]!.endpointB.nativeZ).toBeCloseTo(571, 3);
    expect(navigation[0]!.records[0]).toMatchObject({
      backwardBoundaryGateIndex: 0,
      forwardBoundaryGateIndex: 1,
      backwardRecordIndices: [34, 34],
      forwardRecordIndices: [1, 1],
      selectorOutput: 0,
      reservedByte: 0,
    });
    expect(advanceRaceNavigation(navigation[0]!, 0, starts[0]!.nativeX, starts[0]!.nativeZ)).toEqual({
      currentRecordIndex: 34,
      selectorOutput: 34,
      returnedRecordIndex: 0,
      forwardChoiceClass: 2,
    });
    expect(navigation[11]!.gateTableAddress).toBe(navigation[6]!.gateTableAddress);
    expect(navigation[11]!.recordTableAddress).toBe(navigation[6]!.recordTableAddress);
  });
});

describe.skipIf(!binPath)("promoted PAL SHOP witnesses", () => {
  test("retains Peach SHOP slot fingerprints and repeated Quick-Pic backdrop", async () => {
    const handle = openSync(binPath!, "r");
    try {
      const disc = await Iso9660Disc.open(new RawMode2SectorSource({
        size: fstatSync(handle).size,
        label: "local PAL BIN",
        async read(offset, length) {
          const bytes = new Uint8Array(length);
          if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
          return bytes;
        },
      }));
      const shop = await disc.readFile("SHOP/T00.BIN");
      expect(shopInteriorSlotCount(shop)).toBe(28);
      const factory = readShopInteriorBackdrop(shop, 0);
      expect(factory).toMatchObject({ width: 640, height: 384, dmaPacketCount: 3 });
      expect(sha256(factory.rgba)).toBe("7813917f1854038264193bbb4ef545fe2f1b8f73e13048678a7a2808fdb50165");
      expect(readShopInteriorBackdrop(shop, 3).dmaPacketCount).toBe(7);
      expect(sha256(readShopInteriorBackdrop(shop, 18).rgba)).toBe(sha256(readShopInteriorBackdrop(shop, 27).rgba));
    } finally {
      closeSync(handle);
    }
  });
});

function center(corners: ReadonlyArray<readonly [number, number]>): [number, number] {
  return [
    corners.reduce((sum, corner) => sum + corner[0], 0) / corners.length,
    corners.reduce((sum, corner) => sum + corner[1], 0) / corners.length,
  ];
}

function rawOutdoorRouteTotals(elf: Elf32AddressSpace): { residents: number; moving: number; routePoints: number } {
  let residents = 0;
  let moving = 0;
  let routePoints = 0;
  for (let areaIndex = 0; areaIndex < 22; areaIndex += 1) {
    const descriptor = 0x002c04b0 + areaIndex * 8;
    const outdoorCount = elf.bytes(descriptor + 6, 2)[1] ?? 0;
    residents += outdoorCount;
    const routeBlock = elf.u32(0x002dba28 + areaIndex * 4);
    for (let localIndex = 0; localIndex < outdoorCount && routeBlock !== 0; localIndex += 1) {
      const record = routeBlock + localIndex * 8;
      const start = elf.u32(record);
      const end = elf.u32(record + 4);
      const points = start !== 0 && end > start ? (end - start) / 24 : 0;
      if (points >= 2) moving += 1;
      routePoints += points;
    }
  }
  return { residents, moving, routePoints };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
