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

  test("retains fixed-polygon and packed-paint executable routine anchors", () => {
    const elf = new Elf32AddressSpace(executable());

    expectIInstruction(elf, 0x0025b5b0, { opcode: 0x09, rs: 29, rt: 29, immediate: 0xff80 });
    expectIInstruction(elf, 0x0025b618, { opcode: 0x0f, rs: 0, rt: 20, immediate: 0x002c });
    expectIInstruction(elf, 0x0025b61c, { opcode: 0x09, rs: 20, rt: 20, immediate: 0x04b0 });
    expectIInstruction(elf, 0x0025b638, { opcode: 0x0f, rs: 0, rt: 4, immediate: 0x002c });
    expectIInstruction(elf, 0x0025b640, { opcode: 0x09, rs: 4, rt: 4, immediate: 0x2710 });
    expectIInstruction(elf, 0x0025b644, { opcode: 0x20, rs: 20, rt: 3, immediate: 6 });
    for (const address of [0x0025b728, 0x0025b760, 0x0025b798, 0x0025b7c4]) {
      expectIInstruction(elf, address, { opcode: 0x11, rs: 0x08, rt: 0x02 });
      expect(instructionBranchTarget(address, elf.u32(address))).toBe(0x0025b950);
    }
    expectIInstruction(elf, 0x0025b848, { opcode: 0x28, rs: 17, rt: 18, immediate: 35 });
    expectIInstruction(elf, 0x0025b854, { opcode: 0x28, rs: 17, rt: 19, immediate: 33 });
    expectIInstruction(elf, 0x0025b95c, { opcode: 0x09, rs: 16, rt: 16, immediate: 32 });

    expectIInstruction(elf, 0x00257e98, { opcode: 0x23, rs: 16, rt: 2, immediate: 0 });
    expectRInstruction(elf, 0x00257ea8, { opcode: 0, rt: 2, rd: 7, shamt: 20, funct: 0x02 });
    expectRInstruction(elf, 0x00257eac, { opcode: 0, rt: 2, rd: 3, shamt: 4, funct: 0x02 });
    expectRInstruction(elf, 0x00257eb0, { opcode: 0, rt: 2, rd: 4, shamt: 8, funct: 0x02 });
    expectRInstruction(elf, 0x00257eb4, { opcode: 0, rt: 2, rd: 5, shamt: 12, funct: 0x02 });
    expectRInstruction(elf, 0x00257eb8, { opcode: 0, rt: 2, rd: 6, shamt: 16, funct: 0x02 });
    for (const address of [0x00257ebc, 0x00257ec0, 0x00257ec4, 0x00257ec8, 0x00257ecc, 0x00257ed0]) {
      expectIInstruction(elf, address, { opcode: 0x0c, immediate: 0x0f });
    }
    for (const [address, rt, offset] of [
      [0x00257ed8, 2, 0], [0x00257ed4, 3, 1], [0x00257ee0, 4, 2],
      [0x00257ee8, 5, 3], [0x00257ef0, 6, 4], [0x00257ef8, 7, 5],
    ] as const) {
      expectIInstruction(elf, address, { opcode: 0x28, rs: 29, rt, immediate: offset });
    }

    expectIInstruction(elf, 0x00258d74, { opcode: 0x09, rs: 0, rt: 6, immediate: 1 });
    expectRInstruction(elf, 0x00258d84, { opcode: 0, rt: 5, rd: 2, shamt: 12, funct: 0x02 });
    expectRInstruction(elf, 0x00258d9c, { opcode: 0, rt: 5, rd: 3, shamt: 4, funct: 0x02 });
    expectRInstruction(elf, 0x00258da0, { opcode: 0, rt: 5, rd: 2, shamt: 16, funct: 0x02 });
    expectRInstruction(elf, 0x00258db4, { opcode: 0, rt: 5, rd: 2, shamt: 20, funct: 0x02 });
    expectRInstruction(elf, 0x00258db8, { opcode: 0, rt: 5, rd: 3, shamt: 8, funct: 0x02 });
    expectIInstruction(elf, 0x00258d94, { opcode: 0x05, rs: 3, rt: 2 });
    expect(instructionBranchTarget(0x00258d94, elf.u32(0x00258d94))).toBe(0x00258dc8);
    expectIInstruction(elf, 0x00258dac, { opcode: 0x15, rs: 3, rt: 2 });
    expect(instructionBranchTarget(0x00258dac, elf.u32(0x00258dac))).toBe(0x00258dcc);
    expectRInstruction(elf, 0x00258dbc, { opcode: 0, rs: 2, rt: 3, rd: 2, funct: 0x26 });
    expectRInstruction(elf, 0x00258dc4, { opcode: 0, rs: 0, rt: 2, rd: 6, funct: 0x2b });
    expectIInstruction(elf, 0x00258dc8, { opcode: 0x28, rs: 16, rt: 6, immediate: 39 });
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

function expectIInstruction(
  elf: Elf32AddressSpace,
  address: number,
  expected: Partial<ReturnType<typeof decodeIInstruction>>,
): void {
  expect(decodeIInstruction(elf.u32(address))).toMatchObject(expected);
}

function expectRInstruction(
  elf: Elf32AddressSpace,
  address: number,
  expected: Partial<ReturnType<typeof decodeRInstruction>>,
): void {
  expect(decodeRInstruction(elf.u32(address))).toMatchObject(expected);
}

function decodeIInstruction(word: number) {
  return {
    opcode: (word >>> 26) & 0x3f,
    rs: (word >>> 21) & 0x1f,
    rt: (word >>> 16) & 0x1f,
    immediate: word & 0xffff,
  };
}

function decodeRInstruction(word: number) {
  return {
    opcode: (word >>> 26) & 0x3f,
    rs: (word >>> 21) & 0x1f,
    rt: (word >>> 16) & 0x1f,
    rd: (word >>> 11) & 0x1f,
    shamt: (word >>> 6) & 0x1f,
    funct: word & 0x3f,
  };
}

function instructionBranchTarget(address: number, word: number): number {
  const immediate = word & 0xffff;
  const signedImmediate = (immediate & 0x8000) !== 0 ? immediate - 0x10000 : immediate;
  return (address + 4 + (signedImmediate << 2)) >>> 0;
}

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
