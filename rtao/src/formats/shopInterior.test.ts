import { describe, expect, test } from "vitest";
import { GsPixelStorageFormat, type FieldTextureUpload } from "./gsTextures";
import { decodeShopInteriorUploads, shopInteriorHeight, shopInteriorPackagePath, shopInteriorWidth } from "./shopInterior";

describe("HG2 SHOP interior atlas", () => {
  test("decodes PSMT8 pixels through the CSM1 CLUT permutation and expands PS2 alpha", () => {
    const indices = new Uint8Array(shopInteriorWidth * shopInteriorHeight);
    indices[0] = 8;
    indices[1] = 16;
    const palette = new Uint8Array(256 * 4);
    // CSM1 exchanges address bits 3 and 4: logical 8 is stored at physical 16,
    // while logical 16 is stored at physical 8.
    palette.set([10, 20, 30, 64], 16 * 4);
    palette.set([40, 50, 60, 128], 8 * 4);
    const backdrop = decodeShopInteriorUploads([
      upload(GsPixelStorageFormat.PsmT8, shopInteriorWidth, shopInteriorHeight, indices, 0),
      upload(GsPixelStorageFormat.PsmCt32, 16, 16, palette, 1),
    ], 0, 3);
    expect([...backdrop.rgba.slice(0, 8)]).toEqual([10, 20, 30, 128, 40, 50, 60, 255]);
    expect(backdrop.dmaPacketCount).toBe(3);
    expect(backdrop.uploadCount).toBe(2);
  });

  test("rejects a package whose authored atlas dimensions do not match", () => {
    expect(() => decodeShopInteriorUploads([
      upload(GsPixelStorageFormat.PsmT8, 320, 192, new Uint8Array(320 * 192), 0),
      upload(GsPixelStorageFormat.PsmCt32, 16, 16, new Uint8Array(1024), 1),
    ])).toThrow(/expected 640x384/i);
  });


  test("maps authored areas to SHOP package numbers", () => {
    expect(shopInteriorPackagePath(1)).toBe("SHOP/T00.BIN");
    expect(shopInteriorPackagePath(2)).toBe("SHOP/T01.BIN");
    expect(shopInteriorPackagePath(32)).toBe("SHOP/T31.BIN");
    expect(() => shopInteriorPackagePath(0)).toThrow(/area index/);
  });
});

function upload(format: number, width: number, height: number, data: Uint8Array, packetIndex: number): FieldTextureUpload {
  return {
    packetIndex,
    destinationBasePointer: 0,
    destinationBufferWidth: Math.max(1, Math.ceil(width / 64)),
    destinationPixelStorageFormat: format,
    destinationX: 0,
    destinationY: 0,
    width,
    height,
    data,
  };
}
