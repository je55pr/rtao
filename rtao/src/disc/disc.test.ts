import { describe, expect, it } from "vitest";
import { parseCueSheet } from "./cueSheet";
import { Iso9660Disc } from "./iso9660";
import { MemorySource, RawMode2SectorSource } from "./randomAccess";
import { readGameIdentity } from "../formats/gameIdentity";

describe("CUE parsing", () => {
  it("reads TRACK 01 and ignores the INDEX lines of trailing CDDA tracks", () => {
    const cue = parseCueSheet(`FILE "Road Trip Adventure.bin" BINARY
  TRACK 01 MODE2/2352
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    INDEX 00 10:00:00
    INDEX 01 10:02:00
  TRACK 03 AUDIO
    INDEX 01 20:00:00
`);
    expect(cue).toEqual({ binFileName: "Road Trip Adventure.bin", firstSector: 0 });
  });

  it("rejects a CUE whose first track is not the MODE2/2352 data track", () => {
    expect(() => parseCueSheet(`FILE "game.bin" BINARY
TRACK 02 MODE2/2352
INDEX 01 00:00:00`)).toThrow(/TRACK 01/);
  });

  it("reads the single MODE2 track used by the PAL disc", () => {
    const cue = parseCueSheet(`FILE "Road Trip Adventure.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:02:00\r\n`);
    expect(cue).toEqual({ binFileName: "Road Trip Adventure.bin", firstSector: 150 });
  });

  it("rejects unsupported track layouts", () => {
    expect(() => parseCueSheet(`FILE "game.bin" BINARY\nTRACK 01 MODE1/2352\nINDEX 01 00:00:00`)).toThrow(/MODE2/);
  });
});

describe("ISO9660 disc", () => {
  it("resolves SYSTEM.CNF and validates the European executable", async () => {
    const cooked = createIso(new Map([
      ["SYSTEM.CNF", new TextEncoder().encode("BOOT2 = cdrom0:\\\\SLES_513.56;1\r\nVER = 1.02\r\nVMODE = PAL\r\n")],
    ]));
    const disc = await Iso9660Disc.open(new MemorySource(cooked, "synthetic ISO"));
    expect(new TextDecoder().decode(await disc.readFile("system.cnf"))).toContain("SLES_513.56");
    expect(await readGameIdentity(disc)).toMatchObject({
      bootExecutable: "SLES_513.56",
      version: "1.02",
      videoMode: "PAL",
      supported: true,
    });
  });

  it("reads the same ISO through MODE2/2352 sector framing", async () => {
    const cooked = createIso(new Map([["HELLO.TXT", new TextEncoder().encode("local only")]]));
    const raw = wrapRawMode2(cooked);
    const sectors = new RawMode2SectorSource(new MemorySource(raw, "synthetic BIN"));
    const disc = await Iso9660Disc.open(sectors);
    expect(new TextDecoder().decode(await disc.readFile("HELLO.TXT"))).toBe("local only");
  });

  it("projects a contiguous MODE2 range with one backing-file read", async () => {
    const cooked = new Uint8Array(24 * 2048);
    for (let index = 0; index < cooked.length; index += 1) cooked[index] = index & 0xff;
    const raw = wrapRawMode2(cooked);
    let reads = 0;
    const source = {
      size: raw.byteLength,
      label: "counted raw BIN",
      read: async (offset: number, length: number) => {
        reads += 1;
        return raw.slice(offset, offset + length);
      },
    };
    const sectors = new RawMode2SectorSource(source);
    expect(await sectors.read(73, 20 * 2048 + 91)).toEqual(cooked.slice(73, 73 + 20 * 2048 + 91));
    expect(reads).toBe(1);
  });
});

function createIso(files: Map<string, Uint8Array>): Uint8Array {
  const sectorSize = 2048;
  const rootSector = 20;
  let nextFileSector = 21;
  const allocation = [...files].map(([name, bytes]) => {
    const sector = nextFileSector;
    nextFileSector += Math.ceil(bytes.length / sectorSize);
    return { name, bytes, sector };
  });
  const output = new Uint8Array(nextFileSector * sectorSize);
  const view = new DataView(output.buffer);

  const pvd = 16 * sectorSize;
  output[pvd] = 1;
  output.set(new TextEncoder().encode("CD001"), pvd + 1);
  output[pvd + 6] = 1;

  const rootSize = sectorSize;
  writeDirectoryRecord(output, pvd + 156, "\0", rootSector, rootSize, true);
  const terminator = 17 * sectorSize;
  output[terminator] = 255;
  output.set(new TextEncoder().encode("CD001"), terminator + 1);
  output[terminator + 6] = 1;

  let directoryOffset = rootSector * sectorSize;
  directoryOffset += writeDirectoryRecord(output, directoryOffset, "\0", rootSector, rootSize, true);
  directoryOffset += writeDirectoryRecord(output, directoryOffset, "\u0001", rootSector, rootSize, true);
  for (const file of allocation) {
    directoryOffset += writeDirectoryRecord(output, directoryOffset, `${file.name};1`, file.sector, file.bytes.length, false);
    output.set(file.bytes, file.sector * sectorSize);
  }

  function writeBothEndian32(offset: number, value: number): void {
    view.setUint32(offset, value, true);
    view.setUint32(offset + 4, value, false);
  }
  function writeDirectoryRecord(target: Uint8Array, offset: number, name: string, extent: number, size: number, directory: boolean): number {
    const nameBytes = new TextEncoder().encode(name);
    const length = 33 + nameBytes.length + (nameBytes.length % 2 === 0 ? 1 : 0);
    target[offset] = length;
    writeBothEndian32(offset + 2, extent);
    writeBothEndian32(offset + 10, size);
    target[offset + 25] = directory ? 2 : 0;
    target[offset + 28] = 1;
    target[offset + 30] = 0;
    target[offset + 31] = 1;
    target[offset + 32] = nameBytes.length;
    target.set(nameBytes, offset + 33);
    return length;
  }
  return output;
}

function wrapRawMode2(cooked: Uint8Array): Uint8Array {
  const sectors = cooked.length / 2048;
  const raw = new Uint8Array(sectors * 2352);
  for (let sector = 0; sector < sectors; sector += 1) {
    const offset = sector * 2352;
    raw[offset] = 0;
    raw.fill(0xff, offset + 1, offset + 11);
    raw[offset + 11] = 0;
    raw[offset + 15] = 2;
    raw.set(cooked.subarray(sector * 2048, sector * 2048 + 2048), offset + 24);
  }
  return raw;
}
