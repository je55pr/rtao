import { BinaryView } from "../core/binary";

export enum DmaTagId {
  Refe = 0,
  Cnt = 1,
  Next = 2,
  Ref = 3,
  Refs = 4,
  Call = 5,
  Ret = 6,
  End = 7,
}

export interface DmaTag {
  readonly quadwordCount: number;
  readonly id: DmaTagId;
  readonly vifCode0: number;
  readonly vifCode1: number;
  readonly inlinePayloadBytes: number;
}

export interface DmaPacket {
  readonly relativeOffset: number;
  readonly tag: DmaTag;
  readonly payloadOffset: number;
  readonly payloadLength: number;
}

export type VifKind =
  | "nop" | "stcycl" | "offset" | "base" | "itop" | "stmod" | "mskpath3" | "mark"
  | "flushe" | "flush" | "flusha" | "mscal" | "mscalf" | "mscnt" | "stmask" | "strow"
  | "stcol" | "mpg" | "direct" | "directHl" | "unpack" | "unknown";

export interface VifCode {
  readonly immediate: number;
  readonly count: number;
  readonly command: number;
}

export interface VifInstruction {
  readonly raw: number;
  readonly code: VifCode;
  readonly kind: VifKind;
  readonly embedded: boolean;
  readonly dataOffset: number;
  readonly dataLength: number;
}

export interface GifTag {
  readonly loopCount: number;
  readonly endOfPacket: boolean;
  readonly primitiveEnabled: boolean;
  readonly primitive: number;
  readonly format: number;
  readonly registerCount: number;
  readonly registers: bigint;
}

/**
 * HG2 reuses an otherwise-unused bit in the GIF tag register-descriptor word
 * as an ordinary MSCALF 8 visibility selector. Clear selects dynamic VU
 * memory 20; set selects stable VU memory 21.
 */
export const hg2FieldVisibilityProfileFlagMask = 0x0000000200000000n;

export function readDmaChain(bytes: Uint8Array, absoluteOffset: number, maximumLength: number): DmaPacket[] {
  const data = new BinaryView(bytes);
  const packets: DmaPacket[] = [];
  let relative = 0;
  while (relative + 16 <= maximumLength) {
    const tag = readDmaTag(data, absoluteOffset + relative);
    if (tag.id !== DmaTagId.Cnt && tag.id !== DmaTagId.Ret && tag.id !== DmaTagId.End) {
      throw new Error(`Inline DMA chain encountered unsupported tag ${DmaTagId[tag.id] ?? tag.id} at +0x${relative.toString(16)}.`);
    }
    const packetBytes = 16 + tag.inlinePayloadBytes;
    if (relative + packetBytes > maximumLength) throw new Error("DMA packet exceeds its containing section or chunk.");
    packets.push({
      relativeOffset: relative,
      tag,
      payloadOffset: relative + 16,
      payloadLength: tag.inlinePayloadBytes,
    });
    relative += packetBytes;
    if (tag.id === DmaTagId.Ret || tag.id === DmaTagId.End) return packets;
  }
  throw new Error("DMA chain reached its containing boundary without RET or END.");
}

export function readVifPacket(bytes: Uint8Array, dmaTagAbsoluteOffset: number, tag: DmaTag): VifInstruction[] {
  const data = new BinaryView(bytes);
  const payloadAbsoluteOffset = dmaTagAbsoluteOffset + 16;
  const payloadLength = tag.inlinePayloadBytes;
  const instructions: VifInstruction[] = [];
  let payloadCursor = 0;

  decode(tag.vifCode0, true);
  decode(tag.vifCode1, true);
  while (payloadCursor < payloadLength) {
    if (payloadLength - payloadCursor < 4) throw new Error("VIF payload ends with a partial command word.");
    const raw = data.u32(payloadAbsoluteOffset + payloadCursor);
    payloadCursor += 4;
    decode(raw, false);
  }
  return instructions;

  function decode(raw: number, embedded: boolean): void {
    const code = decodeVifCode(raw);
    const kind = vifKind(code.command);
    const dataLength = vifDataLength(code, kind);
    const dataOffset = payloadCursor;
    if (payloadCursor + dataLength > payloadLength) {
      throw new Error(`VIF ${kind} requests ${dataLength} bytes beyond the DMA packet.`);
    }
    instructions.push({ raw, code, kind, embedded, dataOffset, dataLength });
    payloadCursor += dataLength;
  }
}

export function readGifTag(bytes: Uint8Array, offset: number): GifTag {
  const data = new BinaryView(bytes);
  return decodeGifTagWords(data.u64(offset), data.u64(offset + 8));
}

export function decodeGifTagWords(low: bigint, high: bigint): GifTag {
  const nreg = Number((low >> 60n) & 0xfn);
  return {
    loopCount: Number(low & 0x7fffn),
    endOfPacket: ((low >> 15n) & 1n) !== 0n,
    primitiveEnabled: ((low >> 46n) & 1n) !== 0n,
    primitive: Number((low >> 47n) & 0x7ffn),
    format: Number((low >> 58n) & 0x3n),
    registerCount: nreg === 0 ? 16 : nreg,
    registers: high,
  };
}

export function hg2FieldUsesStableVisibilityProfile(tag: GifTag): boolean {
  return (tag.registers & hg2FieldVisibilityProfileFlagMask) !== 0n;
}

export function gifRegister(tag: GifTag, index: number): number {
  if (index < 0 || index >= tag.registerCount) throw new RangeError("GIF register index is out of range.");
  return Number((tag.registers >> BigInt(index * 4)) & 0xfn);
}

export function effectiveVifCount(count: number): number {
  return count === 0 ? 256 : count;
}

export function readDmaTag(data: BinaryView, offset: number): DmaTag {
  const raw = data.u64(offset);
  const quadwordCount = Number(raw & 0xffffn);
  return {
    quadwordCount,
    id: Number((raw >> 28n) & 0x7n) as DmaTagId,
    vifCode0: data.u32(offset + 8),
    vifCode1: data.u32(offset + 12),
    inlinePayloadBytes: quadwordCount * 16,
  };
}

function decodeVifCode(value: number): VifCode {
  return {
    immediate: value & 0xffff,
    count: (value >>> 16) & 0xff,
    command: (value >>> 24) & 0x7f,
  };
}

function vifKind(command: number): VifKind {
  const fixed: Record<number, VifKind> = {
    0x00: "nop", 0x01: "stcycl", 0x02: "offset", 0x03: "base", 0x04: "itop", 0x05: "stmod",
    0x06: "mskpath3", 0x07: "mark", 0x10: "flushe", 0x11: "flush", 0x13: "flusha",
    0x14: "mscal", 0x15: "mscalf", 0x17: "mscnt", 0x20: "stmask", 0x30: "strow",
    0x31: "stcol", 0x4a: "mpg", 0x50: "direct", 0x51: "directHl",
  };
  if (command >= 0x60 && command <= 0x7f) return "unpack";
  return fixed[command] ?? "unknown";
}

function vifDataLength(code: VifCode, kind: VifKind): number {
  switch (kind) {
    case "stmask": return 4;
    case "strow":
    case "stcol": return 16;
    case "mpg": return effectiveVifCount(code.count) * 8;
    case "direct":
    case "directHl": return code.immediate * 16;
    case "unpack": return unpackDataLength(code);
    default: return 0;
  }
}

function unpackDataLength(code: VifCode): number {
  const format = code.command & 0x0f;
  const vectorComponents = ((format >> 2) & 0x3) + 1;
  const vectorLength = format & 0x3;
  const count = effectiveVifCount(code.count);
  if (vectorLength === 3) {
    if (vectorComponents !== 4) throw new Error(`Reserved VIF UNPACK format 0x${code.command.toString(16)}.`);
    return count * 2;
  }
  const bitsPerComponent = 32 >> vectorLength;
  return count * vectorComponents * bitsPerComponent / 8;
}
