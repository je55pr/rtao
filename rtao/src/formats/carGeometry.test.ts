import { describe, expect, test } from "vitest";
import { decodeIndexedTexture, nativeWheelSectionIndex, readHg2Header } from "./carGeometry";
import { GsPixelStorageFormat, type FieldTextureUpload } from "./gsTextures";

describe("HG2 car containers", () => {
  test("reads the monotonic section table and final texture span", () => {
    const bytes = new Uint8Array(64);
    const view = new DataView(bytes.buffer);
    for (const [index, value] of [16, 32, 48, 64].entries()) view.setUint32(index * 4, value, true);
    expect(readHg2Header(bytes)).toEqual({ offsets: [16, 32, 48, 64], textureOffset: 48, textureLength: 16 });
  });


  test("decodes PAL coin-style PSMT4 pixels against a CT32 palette", () => {
    const palette = new Uint8Array(16 * 4);
    palette.set([255, 0, 0, 128], 0);
    palette.set([0, 255, 0, 128], 4);
    const upload = (psm: number, width: number, height: number, data: Uint8Array): FieldTextureUpload => ({
      packetIndex: 0, destinationBasePointer: 0, destinationBufferWidth: 1, destinationPixelStorageFormat: psm,
      destinationX: 0, destinationY: 0, width, height, data,
    });
    const texture = decodeIndexedTexture([
      upload(GsPixelStorageFormat.PsmT4, 2, 1, new Uint8Array([0x10])),
      upload(GsPixelStorageFormat.PsmCt32, 16, 1, palette),
    ], 4);
    expect([...texture.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  test("maps every native wheel selector byte +6 to WHEEL.BIN section selector+1", () => {
    for (let selector = 0; selector <= 14; selector += 1) {
      expect(nativeWheelSectionIndex(selector), `selector ${selector}`).toBe(selector + 1);
    }
    expect(() => nativeWheelSectionIndex(15)).toThrow(RangeError);
  });
});
