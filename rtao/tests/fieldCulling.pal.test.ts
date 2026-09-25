import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { Elf32AddressSpace } from "../src/formats/elf32";

const binPath = process.env.RTA_PAL_BIN;
const mpgCommands = [0x00292ed4, 0x002936dc, 0x00293ee4] as const;

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

function lowerWord(elf: Elf32AddressSpace, pc: number): number {
  const page = pc >>> 8;
  const command = mpgCommands[page];
  if (command === undefined) throw new RangeError(`VU PC 0x${pc.toString(16)} is outside the retained MSCALF-8 proof window.`);
  return elf.u32(command + 4 + (pc & 0xff) * 8);
}
function primaryOpcode(lower: number): number {
  return lower >>> 25;
}

function branchTarget(pc: number, lower: number): number {
  const raw = lower & 0x7ff;
  const offset = raw >= 0x400 ? raw - 0x800 : raw;
  return pc + 1 + offset;
}

describe.skipIf(!binPath)("PAL ordinary-field face culling", () => {
  test("MSCALF 8 clips with FCOR/FCAND + ADC and has no MAC-area reject in its helper window", async () => {
    const { disc, close } = await openDisc();
    try {
      const elf = new Elf32AddressSpace(await disc.readFile("SLES_513.56"));
      expect(branchTarget(0x008, lowerWord(elf, 0x008))).toBe(0x010);

      for (const pc of [0x05e, 0x061, 0x064, 0x067, 0x06a]) {
        expect(primaryOpcode(lowerWord(elf, pc)), `VU 0x${pc.toString(16)} FCOR`).toBe(0x13);
      }
      expect(primaryOpcode(lowerWord(elf, 0x06d))).toBe(0x12);
      expect([0x070, 0x072, 0x074].map((pc) => branchTarget(pc, lowerWord(elf, pc))))
        .toEqual([0x208, 0x0e4, 0x22a]);

      const fmandSites: number[] = [];
      for (let pc = 0x010; pc < 0x300; pc += 1) {
        if (primaryOpcode(lowerWord(elf, pc)) === 0x1a) fmandSites.push(pc);
      }
      expect(fmandSites).toEqual([]);

      expect([0x077, 0x078, 0x079, 0x07a].map((pc) => lowerWord(elf, pc)))
        .toEqual([0x11eb07ff, 0x100b5801, 0x80015af5, 0x0a2b3fff]);
    } finally {
      close();
    }
  });
});
