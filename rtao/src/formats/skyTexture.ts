import { GsPixelStorageFormat, readTextureUploads, type FieldTextureUpload } from "./gsTextures";

export interface SkyImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface SkyTextureSet {
  readonly day: SkyImage;
  readonly night: SkyImage;
  readonly uploadCount: number;
}

export function decodeSkyTextureSet(bytes: Uint8Array): SkyTextureSet {
  return decodeSkyUploads(readTextureUploads(bytes, 0, bytes.length));
}

export function decodeSkyUploads(uploads: FieldTextureUpload[]): SkyTextureSet {
  const dayImage = requiredImage(uploads, GsPixelStorageFormat.PsmT8, 512, 96);
  const dayClut = requiredFollowingClut(uploads, dayImage, 16, 16);
  const nightImage = requiredImage(uploads, GsPixelStorageFormat.PsmT4, 1024, 128);
  const nightClut = requiredFollowingClut(uploads, nightImage, 16, 2);
  return {
    day: decodeIndexed(dayImage, dayClut, 8),
    night: decodeIndexed(nightImage, nightClut, 4),
    uploadCount: uploads.length,
  };
}

function requiredImage(uploads: FieldTextureUpload[], format: number, width: number, height: number): FieldTextureUpload {
  const upload = uploads.find((candidate) => candidate.destinationPixelStorageFormat === format && candidate.width === width && candidate.height === height);
  if (!upload) throw new Error(`SORA.GSL is missing its ${width}x${height} PSM ${format} panorama.`);
  return upload;
}

function requiredFollowingClut(uploads: FieldTextureUpload[], image: FieldTextureUpload, width: number, height: number): FieldTextureUpload {
  const upload = uploads.find((candidate) => candidate.packetIndex > image.packetIndex &&
    candidate.destinationPixelStorageFormat === GsPixelStorageFormat.PsmCt32 && candidate.width === width && candidate.height === height);
  if (!upload) throw new Error(`SORA.GSL panorama packet ${image.packetIndex} has no following ${width}x${height} CLUT.`);
  return upload;
}

function decodeIndexed(image: FieldTextureUpload, clut: FieldTextureUpload, bits: 4 | 8): SkyImage {
  const pixelCount = image.width * image.height;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const packed = image.data[pixel >> 1] ?? 0;
    const logical = bits === 8 ? image.data[pixel] ?? 0 : ((pixel & 1) === 0 ? packed & 0x0f : packed >> 4);
    const physical = swapClutBits(logical);
    const source = physical * 4;
    rgba[pixel * 4] = clut.data[source] ?? 255;
    rgba[pixel * 4 + 1] = clut.data[source + 1] ?? 0;
    rgba[pixel * 4 + 2] = clut.data[source + 2] ?? 255;
    const alpha = clut.data[source + 3] ?? 128;
    rgba[pixel * 4 + 3] = alpha === 0 ? 0 : Math.min(255, alpha * 2);
  }
  return { width: image.width, height: image.height, rgba };
}

function swapClutBits(value: number): number { return (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1); }
