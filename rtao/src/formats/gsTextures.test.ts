import { describe, expect, it } from "vitest";
import { GsLocalMemory, GsPixelStorageFormat, type FieldTextureUpload } from "./gsTextures";
import type { GsTex0 } from "./fieldGeometry";

describe("GS local memory", () => {
  it("round-trips a host-order PSMCT24 transfer through GS page addressing", () => {
    const memory = new GsLocalMemory();
    memory.write({
      packetIndex: 0,
      destinationBasePointer: 12,
      destinationBufferWidth: 1,
      destinationPixelStorageFormat: GsPixelStorageFormat.PsmCt24,
      destinationX: 0,
      destinationY: 0,
      width: 2,
      height: 1,
      data: new Uint8Array([10, 20, 30, 40, 50, 60]),
    });
    const tex0: GsTex0 = {
      textureBasePointer: 12,
      textureBufferWidth: 1,
      pixelStorageFormat: GsPixelStorageFormat.PsmCt24,
      width: 2,
      height: 1,
      rgbaColorComponent: true,
      textureFunction: 0,
      clutBasePointer: 0,
      clutPixelStorageFormat: 0,
      clutStorageMode: false,
      clutEntryOffset: 0,
    };
    const decoded = memory.decodeTexture(tex0);
    expect([...decoded.rgba]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
    expect(decoded.hasTransparency).toBe(false);
  });

  it("round-trips PSMT8 indices through GS swizzling and CSM1 palette lookup", () => {
    const memory = new GsLocalMemory();
    const indices = new Uint8Array(16 * 16);
    indices[0] = 8;
    indices[1] = 16;
    const palette = physicalCsm1Palette(256, new Map([
      [8, [10, 20, 30, 64]],
      [16, [40, 50, 60, 128]],
    ]));
    memory.write(upload(0, 0x200, 2, GsPixelStorageFormat.PsmT8, 16, 16, indices));
    memory.write(upload(1, 0x400, 1, GsPixelStorageFormat.PsmCt32, 16, 16, palette));

    const decoded = memory.decodeTexture(indexedTex0(0x200, 2, GsPixelStorageFormat.PsmT8, 16, 16, 0x400));
    expect([...decoded.rgba.slice(0, 8)]).toEqual([10, 20, 30, 128, 40, 50, 60, 255]);
  });

  it("keeps PSMT4 logical CSM1 colours intact when unused physical palette entries are overwritten", () => {
    const memory = new GsLocalMemory();
    const indices = new Uint8Array((32 * 16) / 2);
    indices[0] = 0xf8; // logical entries 8 then 15
    const palette = physicalCsm1Palette(32, new Map([
      [8, [11, 22, 33, 64]],
      [15, [44, 55, 66, 128]],
    ]));
    memory.write(upload(0, 0x280, 2, GsPixelStorageFormat.PsmT4, 32, 16, indices));
    memory.write(upload(1, 0x500, 1, GsPixelStorageFormat.PsmCt32, 16, 2, palette));
    const tex0 = indexedTex0(0x280, 2, GsPixelStorageFormat.PsmT4, 32, 16, 0x500);
    const before = memory.decodeTexture(tex0);

    // Physical entries 8..15 are not selected by logical PSMT4 CSM1 indices:
    // logical 8..15 use physical entries 16..23 instead. This is the property
    // that lets HG2 safely alias neighbouring GS data beside small CLUTs.
    memory.write({
      ...upload(2, 0x500, 1, GsPixelStorageFormat.PsmCt32, 8, 1, new Uint8Array(8 * 4).fill(0xee)),
      destinationX: 8,
    });
    const after = memory.decodeTexture(tex0);
    expect([...after.rgba.slice(0, 8)]).toEqual([...before.rgba.slice(0, 8)]);
    expect([...after.rgba.slice(0, 8)]).toEqual([11, 22, 33, 128, 44, 55, 66, 255]);
  });
});

function indexedTex0(
  textureBasePointer: number,
  textureBufferWidth: number,
  pixelStorageFormat: number,
  width: number,
  height: number,
  clutBasePointer: number,
): GsTex0 {
  return {
    textureBasePointer,
    textureBufferWidth,
    pixelStorageFormat,
    width,
    height,
    rgbaColorComponent: true,
    textureFunction: 0,
    clutBasePointer,
    clutPixelStorageFormat: 0,
    clutStorageMode: false,
    clutEntryOffset: 0,
  };
}

function physicalCsm1Palette(entries: number, colours: Map<number, readonly [number, number, number, number]>): Uint8Array {
  const physicalEntries = Math.max(entries, 32);
  const palette = new Uint8Array(physicalEntries * 4);
  for (const [logicalIndex, colour] of colours) {
    const physicalIndex = swapClutBits3And4(logicalIndex);
    palette.set(colour, physicalIndex * 4);
  }
  return palette;
}

function upload(
  packetIndex: number,
  destinationBasePointer: number,
  destinationBufferWidth: number,
  destinationPixelStorageFormat: number,
  width: number,
  height: number,
  data: Uint8Array,
): FieldTextureUpload {
  return {
    packetIndex,
    destinationBasePointer,
    destinationBufferWidth,
    destinationPixelStorageFormat,
    destinationX: 0,
    destinationY: 0,
    width,
    height,
    data,
  };
}

function swapClutBits3And4(value: number): number {
  return (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1);
}
