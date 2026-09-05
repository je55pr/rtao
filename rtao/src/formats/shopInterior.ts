import { GsPixelStorageFormat, readTextureUploads, type FieldTextureUpload } from "./gsTextures";
import { readDmaChain } from "./ps2";

export const shopInteriorSlotSize = 0x3f000;
export const shopInteriorWidth = 640;
export const shopInteriorHeight = 384;

export interface ShopInteriorBackdrop {
  readonly slotIndex: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly dmaPacketCount: number;
  readonly uploadCount: number;
}

/**
 * Decodes one fixed HG2 SHOP slot. The first two CNT packets contain the
 * authored 640x384 PSMT8 atlas and its 256-entry PSMCT32 CSM1 palette.
 */
export function readShopInteriorBackdrop(bytes: Uint8Array, slotIndex: number): ShopInteriorBackdrop {
  if (!Number.isInteger(slotIndex) || slotIndex < 0) throw new RangeError("SHOP slot index must be a non-negative integer.");
  const slotOffset = slotIndex * shopInteriorSlotSize;
  if (slotOffset + shopInteriorSlotSize > bytes.length) {
    throw new RangeError(`SHOP slot ${slotIndex} lies beyond the ${bytes.length.toLocaleString()}-byte package.`);
  }
  const chain = readDmaChain(bytes, slotOffset, shopInteriorSlotSize);
  const uploads = readTextureUploads(bytes, slotOffset, shopInteriorSlotSize);
  return decodeShopInteriorUploads(uploads, slotIndex, chain.length);
}


export function shopInteriorPackagePath(areaIndex: number): string {
  if (!Number.isInteger(areaIndex) || areaIndex <= 0 || areaIndex > 99) {
    throw new RangeError("SHOP interior area index must be between 1 and 99.");
  }
  return `SHOP/T${(areaIndex - 1).toString().padStart(2, "0")}.BIN`;
}

export function shopInteriorSlotCount(bytes: Uint8Array): number {
  return Math.floor(bytes.length / shopInteriorSlotSize);
}

export function decodeShopInteriorUploads(
  uploads: FieldTextureUpload[],
  slotIndex = 0,
  dmaPacketCount = uploads.length,
): ShopInteriorBackdrop {
  const image = uploads[0];
  const clut = uploads[1];
  if (!image || !clut) throw new Error(`SHOP slot ${slotIndex} does not contain its image and CLUT uploads.`);
  if (image.destinationPixelStorageFormat !== GsPixelStorageFormat.PsmT8) {
    throw new Error(`SHOP slot ${slotIndex} base atlas uses unsupported PSM 0x${image.destinationPixelStorageFormat.toString(16)}.`);
  }
  if (clut.destinationPixelStorageFormat !== GsPixelStorageFormat.PsmCt32) {
    throw new Error(`SHOP slot ${slotIndex} palette uses unsupported PSM 0x${clut.destinationPixelStorageFormat.toString(16)}.`);
  }
  if (image.width !== shopInteriorWidth || image.height !== shopInteriorHeight) {
    throw new Error(`SHOP slot ${slotIndex} atlas is ${image.width}x${image.height}; expected ${shopInteriorWidth}x${shopInteriorHeight}.`);
  }
  const pixelCount = image.width * image.height;
  if (image.data.length < pixelCount) throw new Error(`SHOP slot ${slotIndex} indexed atlas is truncated.`);
  if (clut.data.length < 256 * 4) throw new Error(`SHOP slot ${slotIndex} palette is truncated.`);

  const rgba = new Uint8Array(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const logicalIndex = image.data[pixel] ?? 0;
    const physicalIndex = swapClutBits3And4(logicalIndex);
    const source = physicalIndex * 4;
    const target = pixel * 4;
    rgba[target] = clut.data[source] ?? 255;
    rgba[target + 1] = clut.data[source + 1] ?? 0;
    rgba[target + 2] = clut.data[source + 2] ?? 255;
    const alpha = clut.data[source + 3] ?? 128;
    rgba[target + 3] = alpha === 0 ? 0 : Math.min(255, alpha * 2);
  }
  return {
    slotIndex,
    width: image.width,
    height: image.height,
    rgba,
    dmaPacketCount,
    uploadCount: uploads.length,
  };
}

function swapClutBits3And4(value: number): number {
  return (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1);
}
