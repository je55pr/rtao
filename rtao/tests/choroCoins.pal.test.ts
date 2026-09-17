import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { readHg2Header } from "../src/formats/carGeometry";
import { readChoroCoinPlacements } from "../src/formats/choroCoins";
import { readHg2ObjectAsset } from "../src/formats/fieldObjects";
import {
  DialogueFlow,
  DialogueOpcode,
  DialogueRuntimeState,
  readDialogueEntity,
  type DialogueControlToken,
} from "../src/formats/dialogue";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const binPath = process.env.RTA_PAL_BIN;


async function openDisc(): Promise<{ disc: Iso9660Disc; close: () => void }> {
  const handle = openSync(binPath!, "r");
  const disc = await Iso9660Disc.open(new RawMode2SectorSource({
    size: fstatSync(handle).size,
    label: "local PAL BIN",
    async read(offset, length) {
      const bytes = new Uint8Array(length);
      if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
      return bytes;
    },
  }));
  return { disc, close: () => closeSync(handle) };
}

describe.skipIf(!executablePath)("PAL ChoroQ coin authority", () => {
  const executable = executablePath ? new Uint8Array(readFileSync(executablePath)) : new Uint8Array();

  test("reads the exact 100-record placement table", () => {
    const placements = readChoroCoinPlacements(executable);
    expect(placements).toHaveLength(100);
    expect(placements[0]).toEqual({
      index: 0, areaCode: 6, fieldNumber: 12,
      sourcePosition: { x: 529, y: 20.5, z: 1499 },
    });
    expect(placements[49]).toMatchObject({
      index: 49, areaCode: 35, sourcePosition: { x: 772.5, z: 1046 },
    });
    expect(placements[99]).toMatchObject({
      index: 99, areaCode: 47, fieldNumber: 233, sourcePosition: { x: 860, z: 1356 },
    });
  });

  test("Coine's 0x1a controls encode the 10-through-100 collected-coin ladder", () => {
    const coine = readDialogueEntity(executable, 9, "Coine");
    const gates = coine.variants.flatMap((variant) => variant.tokens
      .filter((token): token is DialogueControlToken =>
        token.kind === "control" && token.opcode === DialogueOpcode.BranchIfChoroCoinCountAtLeast)
      .map((token) => [...token.operands]));
    expect(gates).toEqual([
      [10, 5], [20, 8], [30, 11], [40, 14], [50, 17],
      [60, 20], [70, 23], [80, 26], [90, 29], [100, 32],
    ]);

    const enough = new DialogueRuntimeState();
    for (let index = 0; index < 10; index += 1) enough.collectChoroCoin(index);
    expect(new DialogueFlow(coine, enough, 3).currentSlot).toBe(5);

    const short = new DialogueRuntimeState();
    for (let index = 0; index < 9; index += 1) short.collectChoroCoin(index);
    expect(new DialogueFlow(coine, short, 3).currentSlot).toBe(3);
  });
});

describe.skipIf(!binPath)("PAL ChoroQ coin presentation asset", () => {
  test("decodes SYS/COIN.BIN as the native MSCALF-4 coin mesh and texture", async () => {
    const { disc, close } = await openDisc();
    try {
      const bytes = await disc.readFile("SYS/COIN.BIN");
      expect(bytes).toHaveLength(5056);
      expect(readHg2Header(bytes).offsets).toEqual([0x10, 0x0a30, 0x13c0]);
      const asset = readHg2ObjectAsset(bytes);
      expect(asset?.kind).toBe("prop");
      expect(asset?.meshes).toHaveLength(1);
      expect(asset!.meshes[0]!.positions.length / 9).toBe(44);
      expect(asset!.radius).toBeGreaterThan(1);
      expect(asset!.radius).toBeLessThan(1.01);
      expect(asset?.texture).toMatchObject({ width: 64, height: 64 });
    } finally {
      close();
    }
  });
});
