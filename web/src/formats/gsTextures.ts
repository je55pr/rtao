import { BinaryView } from "../core/binary";
import type { FieldHeader } from "./field";
import { DmaTagId, gifRegister, readDmaChain, readGifTag } from "./ps2";
import type { GsTex0 } from "./fieldGeometry";

export enum GsPixelStorageFormat {
  PsmCt32 = 0x00,
  PsmCt24 = 0x01,
  PsmCt16 = 0x02,
  PsmCt16S = 0x0a,
  PsmT8 = 0x13,
  PsmT4 = 0x14,
}

export interface FieldTextureUpload {
  readonly packetIndex: number;
  readonly destinationBasePointer: number;
  readonly destinationBufferWidth: number;
  readonly destinationPixelStorageFormat: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface DecodedTexture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly hasTransparency: boolean;
}

const blockCt32 = [
  0,1,4,5,16,17,20,21, 2,3,6,7,18,19,22,23,
  8,9,12,13,24,25,28,29, 10,11,14,15,26,27,30,31,
];
const columnWordCt32 = [0,1,4,5,8,9,12,13, 2,3,6,7,10,11,14,15];
const columnWordT8 = [
  [
    0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13, 2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,
    8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5, 10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,
  ],
  [
    8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5, 10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,
    0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13, 2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,
  ],
];
const columnByteT8 = [
  0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2, 0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,
  1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3, 1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,
];
const blockT4 = [
  0,2,8,10,1,3,9,11,4,6,12,14,5,7,13,15,
  16,18,24,26,17,19,25,27,20,22,28,30,21,23,29,31,
];
const columnWordT4 = [
  [
    0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,
    2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,
    8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,
    10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,
  ],
  [
    8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,
    10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,
    0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13,
    2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15,
  ],
];
const columnByteT4 = [
  0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,4,4,4,4,4,4,4,4,6,6,6,6,6,6,6,6,
  0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,4,4,4,4,4,4,4,4,6,6,6,6,6,6,6,6,
  1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,5,5,5,5,5,5,5,5,7,7,7,7,7,7,7,7,
  1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,5,5,5,5,5,5,5,5,7,7,7,7,7,7,7,7,
];

export function readFieldTextureUploads(bytes: Uint8Array, header: FieldHeader): FieldTextureUpload[] {
  return readTextureUploads(bytes, header.textures.offset, header.textures.length);
}

export function readTextureUploads(bytes: Uint8Array, offset: number, length: number): FieldTextureUpload[] {
  const chain = readDmaChain(bytes, offset, length);
  const uploads: FieldTextureUpload[] = [];
  let packetIndex = 0;
  for (const packet of chain) {
    if (packet.tag.id !== DmaTagId.Cnt) continue;
    uploads.push(readImageTransfer(bytes, offset + packet.payloadOffset, packetIndex++));
  }
  return uploads;
}

export class GsLocalMemory {
  static readonly sizeBytes = 4 * 1024 * 1024;
  private readonly memory = new Uint8Array(GsLocalMemory.sizeBytes);

  replay(uploads: Iterable<FieldTextureUpload>): void {
    for (const upload of uploads) this.write(upload);
  }

  write(upload: FieldTextureUpload): void {
    switch (upload.destinationPixelStorageFormat) {
      case GsPixelStorageFormat.PsmCt32: this.writeCt32(upload, 4); break;
      case GsPixelStorageFormat.PsmCt24: this.writeCt32(upload, 3); break;
      case GsPixelStorageFormat.PsmT8: this.writeT8(upload); break;
      case GsPixelStorageFormat.PsmT4: this.writeT4(upload); break;
      default: throw new Error(`GS upload PSM ${upload.destinationPixelStorageFormat} is not implemented.`);
    }
  }

  decodeTexture(tex0: GsTex0): DecodedTexture {
    const image = this.readTexture(tex0);
    const indexed = tex0.pixelStorageFormat === GsPixelStorageFormat.PsmT8 || tex0.pixelStorageFormat === GsPixelStorageFormat.PsmT4;
    const clut = indexed ? this.readCsm1Clut(tex0) : undefined;
    const rgba = decodePixels(tex0, image, clut);
    let hasTransparency = false;
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] !== 255) { hasTransparency = true; break; }
    }
    return { width: tex0.width, height: tex0.height, rgba, hasTransparency };
  }

  private readTexture(tex0: GsTex0): Uint8Array {
    switch (tex0.pixelStorageFormat) {
      case GsPixelStorageFormat.PsmCt32: return this.readCt32(tex0.textureBasePointer, tex0.textureBufferWidth, tex0.width, tex0.height, 4);
      case GsPixelStorageFormat.PsmCt24: return this.readCt32(tex0.textureBasePointer, tex0.textureBufferWidth, tex0.width, tex0.height, 3);
      case GsPixelStorageFormat.PsmT8: return this.readT8(tex0.textureBasePointer, tex0.textureBufferWidth, tex0.width, tex0.height);
      case GsPixelStorageFormat.PsmT4: return this.readT4(tex0.textureBasePointer, tex0.textureBufferWidth, tex0.width, tex0.height);
      default: throw new Error(`GS TEX0 PSM ${tex0.pixelStorageFormat} is not implemented.`);
    }
  }

  private readCsm1Clut(tex0: GsTex0): Uint8Array {
    if (tex0.clutStorageMode) throw new Error("CSM2 CLUT addressing is not implemented.");
    if (tex0.clutPixelStorageFormat !== 0) throw new Error(`CLUT PSM ${tex0.clutPixelStorageFormat} is not implemented.`);
    const entryCount = tex0.pixelStorageFormat === GsPixelStorageFormat.PsmT4 ? 16 : tex0.pixelStorageFormat === GsPixelStorageFormat.PsmT8 ? 256 : 0;
    if (entryCount === 0) throw new Error("Texture does not use an indexed CLUT.");
    const output = new Uint8Array(entryCount * 4);
    const entryBase = tex0.clutEntryOffset * 16;
    for (let logicalIndex = 0; logicalIndex < entryCount; logicalIndex += 1) {
      const physicalIndex = swapClutBits3And4(entryBase + logicalIndex);
      const address = ct32ByteAddress(tex0.clutBasePointer, 1, physicalIndex & 0x0f, physicalIndex >> 4);
      const target = logicalIndex * 4;
      for (let channel = 0; channel < 4; channel += 1) output[target + channel] = this.memory[wrapByte(address + channel)] ?? 0;
    }
    return output;
  }

  private writeCt32(upload: FieldTextureUpload, bytesPerPixel: number): void {
    const expected = upload.width * upload.height * bytesPerPixel;
    if (upload.data.length < expected) throw new Error("GS upload is shorter than its declared dimensions.");
    let sourceOffset = 0;
    for (let y = 0; y < upload.height; y += 1) for (let x = 0; x < upload.width; x += 1) {
      const address = ct32ByteAddress(upload.destinationBasePointer, upload.destinationBufferWidth, upload.destinationX + x, upload.destinationY + y);
      for (let channel = 0; channel < bytesPerPixel; channel += 1) this.memory[wrapByte(address + channel)] = upload.data[sourceOffset++] ?? 0;
    }
  }

  private readCt32(basePointer: number, bufferWidth: number, width: number, height: number, bytesPerPixel: number): Uint8Array {
    const output = new Uint8Array(width * height * bytesPerPixel);
    let target = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const address = ct32ByteAddress(basePointer, bufferWidth, x, y);
      for (let channel = 0; channel < bytesPerPixel; channel += 1) output[target++] = this.memory[wrapByte(address + channel)] ?? 0;
    }
    return output;
  }

  private writeT8(upload: FieldTextureUpload): void {
    const expected = upload.width * upload.height;
    if (upload.data.length < expected) throw new Error("GS PSMT8 upload is shorter than declared.");
    let source = 0;
    for (let y = 0; y < upload.height; y += 1) for (let x = 0; x < upload.width; x += 1) {
      this.memory[t8ByteAddress(upload.destinationBasePointer, upload.destinationBufferWidth, upload.destinationX + x, upload.destinationY + y)] = upload.data[source++] ?? 0;
    }
  }

  private readT8(basePointer: number, bufferWidth: number, width: number, height: number): Uint8Array {
    const output = new Uint8Array(width * height);
    let target = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) output[target++] = this.memory[t8ByteAddress(basePointer, bufferWidth, x, y)] ?? 0;
    return output;
  }

  private writeT4(upload: FieldTextureUpload): void {
    const pixels = upload.width * upload.height;
    if (upload.data.length < Math.ceil(pixels / 2)) throw new Error("GS PSMT4 upload is shorter than declared.");
    let pixel = 0;
    for (let y = 0; y < upload.height; y += 1) for (let x = 0; x < upload.width; x += 1, pixel += 1) {
      const packed = upload.data[pixel >> 1] ?? 0;
      const value = ((pixel & 1) === 0 ? packed : packed >> 4) & 0x0f;
      const [address, high] = t4NibbleAddress(upload.destinationBasePointer, upload.destinationBufferWidth, upload.destinationX + x, upload.destinationY + y);
      const existing = this.memory[address] ?? 0;
      this.memory[address] = high ? (existing & 0x0f) | (value << 4) : (existing & 0xf0) | value;
    }
  }

  private readT4(basePointer: number, bufferWidth: number, width: number, height: number): Uint8Array {
    const pixels = width * height;
    const output = new Uint8Array(Math.ceil(pixels / 2));
    let pixel = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1, pixel += 1) {
      const [address, high] = t4NibbleAddress(basePointer, bufferWidth, x, y);
      const value = high ? ((this.memory[address] ?? 0) >> 4) & 0x0f : (this.memory[address] ?? 0) & 0x0f;
      const target = pixel >> 1;
      output[target] = (pixel & 1) === 0 ? value : (output[target] ?? 0) | (value << 4);
    }
    return output;
  }
}

function readImageTransfer(bytes: Uint8Array, payloadOffset: number, packetIndex: number): FieldTextureUpload {
  const data = new BinaryView(bytes);
  const setup = readGifTag(bytes, payloadOffset);
  if (setup.loopCount !== 4 || setup.format !== 0 || setup.registerCount !== 1 || gifRegister(setup, 0) !== 0x0e) {
    throw new Error(`Texture packet ${packetIndex} has an unsupported setup GIF tag.`);
  }
  let cursor = payloadOffset + 16;
  const registers = new Map<number, bigint>();
  for (let index = 0; index < 4; index += 1) {
    const value = data.u64(cursor);
    const register = Number(data.u64(cursor + 8) & 0xffn);
    registers.set(register, value);
    cursor += 16;
  }
  const bitbltbuf = requiredRegister(registers, 0x50, packetIndex);
  const trxpos = requiredRegister(registers, 0x51, packetIndex);
  const trxreg = requiredRegister(registers, 0x52, packetIndex);
  const trxdir = requiredRegister(registers, 0x53, packetIndex);
  if ((trxdir & 0x3n) !== 0n) throw new Error(`Texture packet ${packetIndex} is not host-to-local.`);
  const image = readGifTag(bytes, cursor);
  cursor += 16;
  if (image.format !== 2) throw new Error(`Texture packet ${packetIndex} has non-IMAGE payload format ${image.format}.`);
  const imageBytes = image.loopCount * 16;
  return {
    packetIndex,
    destinationBasePointer: Number((bitbltbuf >> 32n) & 0x3fffn),
    destinationBufferWidth: Number((bitbltbuf >> 48n) & 0x3fn),
    destinationPixelStorageFormat: Number((bitbltbuf >> 56n) & 0x3fn),
    destinationX: Number((trxpos >> 32n) & 0x7ffn),
    destinationY: Number((trxpos >> 48n) & 0x7ffn),
    width: Number(trxreg & 0xfffn),
    height: Number((trxreg >> 32n) & 0xfffn),
    data: data.slice(cursor, imageBytes),
  };
}

function decodePixels(tex0: GsTex0, image: Uint8Array, clut?: Uint8Array): Uint8Array {
  const output = new Uint8Array(tex0.width * tex0.height * 4);
  if (tex0.pixelStorageFormat === GsPixelStorageFormat.PsmCt24) {
    const pixels = Math.min(tex0.width * tex0.height, Math.floor(image.length / 3));
    for (let index = 0; index < pixels; index += 1) {
      output[index * 4] = image[index * 3] ?? 0;
      output[index * 4 + 1] = image[index * 3 + 1] ?? 0;
      output[index * 4 + 2] = image[index * 3 + 2] ?? 0;
      output[index * 4 + 3] = 255;
    }
    return output;
  }
  const entries = tex0.pixelStorageFormat === GsPixelStorageFormat.PsmT4 ? 16 : 256;
  const palette = decodePalette(clut, entries);
  const pixels = tex0.width * tex0.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const paletteIndex = tex0.pixelStorageFormat === GsPixelStorageFormat.PsmT4
      ? (((pixel & 1) === 0 ? image[pixel >> 1] : (image[pixel >> 1] ?? 0) >> 4) ?? 0) & 0x0f
      : image[pixel] ?? 0;
    output.set(palette.subarray(paletteIndex * 4, paletteIndex * 4 + 4), pixel * 4);
  }
  return output;
}

function decodePalette(clut: Uint8Array | undefined, entries: number): Uint8Array {
  const output = new Uint8Array(entries * 4);
  for (let index = 0; index < entries; index += 1) {
    const source = index * 4;
    output[source] = clut?.[source] ?? 255;
    output[source + 1] = clut?.[source + 1] ?? 0;
    output[source + 2] = clut?.[source + 2] ?? 255;
    const alpha = clut?.[source + 3] ?? 128;
    output[source + 3] = alpha === 0 ? 0 : Math.min(255, alpha * 2);
  }
  return output;
}

function ct32ByteAddress(basePointer: number, bufferWidth: number, x: number, y: number): number {
  const pageX = Math.floor(x / 64), pageY = Math.floor(y / 32), page = pageX + pageY * bufferWidth;
  const px = x - pageX * 64, py = y - pageY * 32, blockX = Math.floor(px / 8), blockY = Math.floor(py / 8);
  const block = blockCt32[blockX + blockY * 8] ?? 0, bx = px - blockX * 8, by = py - blockY * 8;
  const column = Math.floor(by / 2), word = columnWordCt32[bx + (by - column * 2) * 8] ?? 0;
  return wrapWord(basePointer * 64 + page * 2048 + block * 64 + column * 16 + word) * 4;
}

function t8ByteAddress(basePointer: number, bufferWidth: number, x: number, y: number): number {
  const stride = Math.max(1, bufferWidth >> 1), pageX = Math.floor(x / 128), pageY = Math.floor(y / 64), page = pageX + pageY * stride;
  const px = x - pageX * 128, py = y - pageY * 64, blockX = Math.floor(px / 16), blockY = Math.floor(py / 16);
  const block = blockCt32[blockX + blockY * 8] ?? 0, bx = px - blockX * 16, by = py - blockY * 16, column = Math.floor(by / 4);
  const key = bx + (by - column * 4) * 16, word = columnWordT8[column & 1]?.[key] ?? 0, byte = columnByteT8[key] ?? 0;
  return wrapByte(wrapWord(basePointer * 64 + page * 2048 + block * 64 + column * 16 + word) * 4 + byte);
}

function t4NibbleAddress(basePointer: number, bufferWidth: number, x: number, y: number): [number, boolean] {
  const stride = Math.max(1, bufferWidth >> 1), pageX = Math.floor(x / 128), pageY = Math.floor(y / 128), page = pageX + pageY * stride;
  const px = x - pageX * 128, py = y - pageY * 128, blockX = Math.floor(px / 32), blockY = Math.floor(py / 16);
  const block = blockT4[blockX + blockY * 4] ?? 0, bx = px - blockX * 32, by = py - blockY * 16, column = Math.floor(by / 4);
  const key = bx + (by - column * 4) * 32, word = columnWordT4[column & 1]?.[key] ?? 0, nibble = columnByteT4[key] ?? 0;
  return [wrapByte(wrapWord(basePointer * 64 + page * 2048 + block * 64 + column * 16 + word) * 4 + (nibble >> 1)), (nibble & 1) !== 0];
}

function requiredRegister(registers: Map<number, bigint>, register: number, packet: number): bigint {
  const value = registers.get(register);
  if (value === undefined) throw new Error(`Texture packet ${packet} is missing GS register 0x${register.toString(16)}.`);
  return value;
}
function swapClutBits3And4(value: number): number { return (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1); }
function wrapWord(value: number): number { return ((value % (GsLocalMemory.sizeBytes / 4)) + GsLocalMemory.sizeBytes / 4) % (GsLocalMemory.sizeBytes / 4); }
function wrapByte(value: number): number { return ((value % GsLocalMemory.sizeBytes) + GsLocalMemory.sizeBytes) % GsLocalMemory.sizeBytes; }
