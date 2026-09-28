import { describe, expect, it } from "vitest";
import { resolveCueBinName, storedZipEntryBlob } from "./source";

describe("CUE BIN resolution", () => {
  it("accepts a renamed BIN when it is the archive's only candidate", () => {
    expect(resolveCueBinName(
      "Road Trip Adventure (Europe) (En,Fr,De).bin",
      ["Road Trip Adventure/Road Trip Adventure.bin"],
    )).toBe("Road Trip Adventure/Road Trip Adventure.bin");
  });

  it("still prefers an exact case-insensitive match", () => {
    expect(resolveCueBinName("GAME.BIN", ["other.bin", "disc/Game.bin"]))
      .toBe("disc/Game.bin");
  });

  it("rejects an unmatched CUE when multiple BIN files make the choice ambiguous", () => {
    expect(resolveCueBinName("missing.bin", ["disc-1.bin", "disc-2.bin"]))
      .toBeUndefined();
  });
});

describe("stored ZIP entry projection", () => {
  it("projects only the local entry payload without copying the disc image", async () => {
    const name = new TextEncoder().encode("disc/game.iso");
    const extra = new Uint8Array([1, 2, 3, 4]);
    const payload = new Uint8Array([9, 8, 7, 6, 5]);
    const prefix = new Uint8Array(11);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 0, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, extra.length, true);
    const archive = new Blob([prefix, header, name, extra, payload, new Uint8Array([4, 3, 2, 1])]);
    const projected = await storedZipEntryBlob(archive, {
      offset: prefix.length,
      compressionMethod: 0,
      compressedSize: payload.length,
      uncompressedSize: payload.length,
    });
    expect(new Uint8Array(await projected.arrayBuffer())).toEqual(payload);
  });

  it("rejects compressed entries instead of pretending they are random-access", async () => {
    await expect(storedZipEntryBlob(new Blob(), {
      offset: 0,
      compressionMethod: 8,
      compressedSize: 1,
      uncompressedSize: 2,
    })).rejects.toThrow(/compressed/);
  });
});
