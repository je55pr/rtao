import { BinaryView } from "../core/binary";
import {
  GsPixelStorageFormat,
  readTextureUploads,
  type DecodedTexture,
  type FieldTextureUpload,
} from "./gsTextures";
import { DmaTagId, effectiveVifCount, readDmaTag, readGifTag, readVifPacket } from "./ps2";

export interface Hg2Header {
  readonly offsets: number[];
  readonly textureOffset: number;
  readonly textureLength: number;
}

export interface CarVertex {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly color: readonly [number, number, number];
  readonly texture: readonly [number, number, number];
}

export interface CarPrimitive {
  readonly primitiveType: number;
  readonly colorSelection: number;
  readonly vuProgram: number;
  readonly textured: boolean;
  readonly vertices: CarVertex[];
}

export interface Q62Assets {
  readonly body: CarPrimitive[];
  readonly bodyTexture: DecodedTexture;
  readonly frontLeft: CarPrimitive[];
  readonly frontRight: CarPrimitive[];
  readonly rearPair: CarPrimitive[];
  /** PAL TIRE.BIN section 4: authored Big Tyre mesh for the left side. */
  readonly bigLeft: CarPrimitive[];
  /** PAL TIRE.BIN section 5: authored Big Tyre mesh for the right side. */
  readonly bigRight: CarPrimitive[];
  /** Default (wheel-paint index 0) PAL TIRE texture. */
  readonly tireTexture: DecodedTexture;
  /** PAL TIRE PSMT4 texture decoded with each native wheel-paint CLUT bank (0..11). */
  readonly tireTextures: readonly DecodedTexture[];
}

/**
 * Original close-detail wheel bank from CARS/WHEEL.BIN. Native configuration
 * byte +6 selects choices[selector], while section zero is drawn for every
 * wheel. The PAL executable exposes selectors 0..14.
 */
export interface NativeWheelAssets {
  readonly common: CarPrimitive[];
  readonly choices: readonly CarPrimitive[][];
}

export const nativeWheelSelectorCount = 15;

export function nativeWheelSectionIndex(selector: number): number {
  if (!Number.isInteger(selector) || selector < 0 || selector >= nativeWheelSelectorCount) {
    throw new RangeError(`Native wheel selector ${selector} lies outside 0..${nativeWheelSelectorCount - 1}.`);
  }
  return selector + 1;
}

export function decodeNativeWheelAssets(bytes: Uint8Array): NativeWheelAssets {
  const wheel = readHg2Header(bytes);
  // WHEEL.BIN is model-only: sixteen mesh-section starts followed by EOF.
  // Section 0 is common; native selector n renders section n+1.
  if (wheel.offsets.length < nativeWheelSelectorCount + 2) {
    throw new Error(`WHEEL HG2 section table has ${wheel.offsets.length - 1} model sections; expected at least ${nativeWheelSelectorCount + 1}.`);
  }
  const readSection = (sectionIndex: number): CarPrimitive[] => {
    const offset = wheel.offsets[sectionIndex];
    if (offset === undefined) throw new RangeError(`WHEEL section ${sectionIndex} is unavailable.`);
    return readCarMeshPart(bytes, offset + 0x10);
  };
  return {
    common: readSection(0),
    choices: Object.freeze(Array.from({ length: nativeWheelSelectorCount }, (_, selector) => readSection(nativeWheelSectionIndex(selector)))),
  };
}

export function readHg2Header(bytes: Uint8Array): Hg2Header {
  const data = new BinaryView(bytes);
  if (data.length < 16) throw new Error("HG2 file is too small.");
  const firstOffset = data.u32(0);
  if (firstOffset < 8 || firstOffset > data.length || (firstOffset & 3) !== 0) {
    throw new Error(`Invalid first HG2 section offset 0x${firstOffset.toString(16)}.`);
  }
  const offsets: number[] = [];
  for (let cursor = 0; cursor < firstOffset; cursor += 4) {
    const value = data.u32(cursor);
    if (value === 0) break;
    offsets.push(value);
  }
  if (offsets.length < 2 || offsets[0] !== firstOffset || offsets.at(-1) !== data.length) {
    throw new Error("HG2 section table is incomplete or does not end at EOF.");
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if ((offsets[index] ?? 0) <= (offsets[index - 1] ?? 0)) throw new Error("HG2 section offsets are not strictly increasing.");
  }
  const textureOffset = offsets.at(-2) ?? firstOffset;
  return { offsets, textureOffset, textureLength: data.length - textureOffset };
}

export function readCarMeshPart(bytes: Uint8Array, meshOffset: number): CarPrimitive[] {
  const data = new BinaryView(bytes);
  const tag = readDmaTag(data, meshOffset);
  if (tag.id !== DmaTagId.Cnt) throw new Error(`HG2 mesh at 0x${meshOffset.toString(16)} does not begin with a CNT tag.`);
  const vif = readVifPacket(bytes, meshOffset, tag);
  const payloadOffset = meshOffset + 16;
  const output: CarPrimitive[] = [];
  for (let index = 0; index + 2 < vif.length; index += 1) {
    const gifUnpack = vif[index];
    const vertexUnpack = vif[index + 1];
    const execute = vif[index + 2];
    if (!gifUnpack || !vertexUnpack || !execute ||
      gifUnpack.kind !== "unpack" || gifUnpack.code.command !== 0x6c || effectiveVifCount(gifUnpack.code.count) !== 1 ||
      vertexUnpack.kind !== "unpack" || vertexUnpack.code.command !== 0x68 ||
      execute.kind !== "mscalf" || (execute.code.immediate !== 4 && execute.code.immediate !== 10)) continue;

    const gif = readGifTag(bytes, payloadOffset + gifUnpack.dataOffset);
    const vectorCount = effectiveVifCount(vertexUnpack.code.count);
    if (vectorCount !== gif.loopCount * 4) throw new Error("HG2 car primitive vector count does not match its GIF tag.");
    const vertices: CarVertex[] = [];
    let cursor = payloadOffset + vertexUnpack.dataOffset;
    for (let vertexIndex = 0; vertexIndex < gif.loopCount; vertexIndex += 1) {
      const position = readVec3(data, cursor); cursor += 12;
      const normal = readVec3(data, cursor); cursor += 12;
      const color = readVec3(data, cursor); cursor += 12;
      const texture = readVec3(data, cursor); cursor += 12;
      vertices.push({ position, normal, color, texture });
    }
    output.push({
      primitiveType: gif.primitive & 0x7,
      colorSelection: Number((gif.registers >> 32n) & 0xffn),
      vuProgram: execute.code.immediate,
      textured: vertices.some((vertex) => Math.abs(vertex.texture[0]) > 0.00001 || Math.abs(vertex.texture[1]) > 0.00001),
      vertices,
    });
    index += 2;
  }
  return output;
}

export function decodeQ62Assets(carBytes: Uint8Array, tireBytes: Uint8Array): Q62Assets {
  const car = readHg2Header(carBytes);
  const tire = readHg2Header(tireBytes);
  // PAL TIRE.BIN has six model sections followed by the texture section and EOF.
  // Sections 4/5 are the executable-selected Big Tyre left/right meshes.
  if (car.offsets.length < 3 || tire.offsets.length < 8) throw new Error("Q62 or TIRE HG2 section table is incomplete.");
  const body = readCarMeshPart(carBytes, (car.offsets[0] ?? 0) + 0x10);
  const frontLeft = readCarMeshPart(tireBytes, (tire.offsets[0] ?? 0) + 0x10);
  const frontRight = readCarMeshPart(tireBytes, (tire.offsets[1] ?? 0) + 0x10);
  const rearPair = readCarMeshPart(tireBytes, (tire.offsets[2] ?? 0) + 0x10);
  const bigLeft = readCarMeshPart(tireBytes, (tire.offsets[4] ?? 0) + 0x10);
  const bigRight = readCarMeshPart(tireBytes, (tire.offsets[5] ?? 0) + 0x10);
  const tireUploads = readTextureUploads(tireBytes, tire.textureOffset, tire.textureLength);
  // TIRE.BIN uploads a 16x16 CT16 CLUT. The PAL renderer places config byte +5
  // in the PSMT4 TEX0 CSA field, selecting one of the first twelve 16-colour
  // banks. This is distinct from the flat RGB palette used by close WHEEL.BIN.
  const tireTextures = Object.freeze(Array.from({ length: 12 }, (_, paletteIndex) => decodeIndexedTexture(tireUploads, 4, paletteIndex)));
  return {
    body,
    bodyTexture: decodeIndexedTexture(readTextureUploads(carBytes, car.textureOffset, car.textureLength), 8),
    frontLeft,
    frontRight,
    rearPair,
    bigLeft,
    bigRight,
    tireTexture: tireTextures[0]!,
    tireTextures,
  };
}

function decodeIndexedTexture(uploads: FieldTextureUpload[], bits: 4 | 8, paletteIndex = 0): DecodedTexture {
  const imageFormat = bits === 8 ? GsPixelStorageFormat.PsmT8 : GsPixelStorageFormat.PsmT4;
  const paletteFormat = bits === 8 ? GsPixelStorageFormat.PsmCt32 : GsPixelStorageFormat.PsmCt16;
  const image = uploads.find((upload) => upload.destinationPixelStorageFormat === imageFormat);
  const palette = uploads.find((upload) => upload.destinationPixelStorageFormat === paletteFormat);
  if (!image || !palette) throw new Error(`HG2 ${bits}-bit indexed texture uploads are incomplete.`);
  const entries = bits === 8 ? 256 : 16;
  const clut = bits === 8 ? decodeCt32Palette(palette.data, entries) : decodeCt16Palette(palette.data, entries, paletteIndex);
  const rgba = new Uint8Array(image.width * image.height * 4);
  let hasTransparency = false;
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const packed = image.data[pixel >> 1] ?? 0;
    const index = bits === 8 ? (image.data[pixel] ?? 0) : ((pixel & 1) === 0 ? packed & 0x0f : packed >> 4);
    const source = index * 4;
    rgba.set(clut.subarray(source, source + 4), pixel * 4);
    hasTransparency ||= (clut[source + 3] ?? 255) < 255;
  }
  return { width: image.width, height: image.height, rgba, hasTransparency };
}

function decodeCt32Palette(bytes: Uint8Array, entries: number): Uint8Array {
  const output = new Uint8Array(entries * 4);
  for (let logical = 0; logical < entries; logical += 1) {
    const physical = swapClutBits(logical);
    const source = physical * 4;
    output[logical * 4] = bytes[source] ?? 255;
    output[logical * 4 + 1] = bytes[source + 1] ?? 0;
    output[logical * 4 + 2] = bytes[source + 2] ?? 255;
    const alpha = bytes[source + 3] ?? 128;
    output[logical * 4 + 3] = alpha === 0 ? 0 : Math.min(255, alpha * 2);
  }
  return output;
}

function decodeCt16Palette(bytes: Uint8Array, entries: number, paletteIndex = 0): Uint8Array {
  const output = new Uint8Array(entries * 4);
  const logicalBase = paletteIndex * entries;
  for (let logical = 0; logical < entries; logical += 1) {
    const physical = swapClutBits(logicalBase + logical);
    const packed = (bytes[physical * 2] ?? 0) | ((bytes[physical * 2 + 1] ?? 0) << 8);
    const r = expand5(packed & 0x1f), g = expand5((packed >> 5) & 0x1f), b = expand5((packed >> 10) & 0x1f);
    output[logical * 4] = r;
    output[logical * 4 + 1] = g;
    output[logical * 4 + 2] = b;
    output[logical * 4 + 3] = g > 240 && r < 20 && b < 20 ? 0 : 255;
  }
  return output;
}

function readVec3(data: BinaryView, offset: number): readonly [number, number, number] {
  return [data.f32(offset), data.f32(offset + 4), data.f32(offset + 8)];
}

function swapClutBits(value: number): number { return (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1); }
function expand5(value: number): number { return (value << 3) | (value >> 2); }
