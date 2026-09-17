import { BinaryView } from "../core/binary";

export const tsqDirectoryEntrySize = 4;
export const tsqDirectoryEntryCounts = [51, 100] as const;
export const tsqDirectoryBoundaries = [0xcc, 0x190] as const;
export const tsqBoundaryMarker = [0xf0, 0xff, 0xff, 0x00] as const;
export const tsqMusicChannelCount = 36;
export const tsqMusicDescriptorSize = 4;

export type TsqDirectoryEntryCount = typeof tsqDirectoryEntryCounts[number];

export interface TsqDirectoryEntry {
  readonly index: number;
  readonly priority: number;
  readonly sequenceOffset: number;
}

export interface TsqFile {
  readonly bytes: Uint8Array;
  readonly directoryEntryCount: TsqDirectoryEntryCount;
  readonly directoryEnd: number;
  readonly entries: readonly TsqDirectoryEntry[];
}

export interface TsqMusicDescriptor {
  readonly channelIndex: number;
  readonly stateByte: number;
  readonly reservedByte: number;
  readonly relativeBytecodeOffset: number;
}
export interface PackedTsqRequest {
  readonly raw: number;
  readonly requestId: number;
  readonly parameters: number;
  readonly cancel: boolean;
  readonly bank: number;
  readonly index: number;
  readonly reservedBits: number;
}

export interface ResolvedTsqRequest {
  readonly packed: PackedTsqRequest;
  readonly tsq: TsqFile;
  readonly entry: TsqDirectoryEntry;
}

export type TsqOpcodeFamily =
  | "step" | "key-on" | "volume" | "pan" | "tone" | "tempo" | "pitch" | "key-pitch"
  | "reverb-e6" | "reverb-e7" | "flag-on" | "flag-off" | "pitch-cent"
  | "key-off" | "priority" | "jump" | "extended-channel" | "end";

export interface TsqBytecodeToken {
  readonly offset: number;
  readonly opcode: number;
  readonly family: TsqOpcodeFamily;
  readonly length: number;
  readonly immediateBytes: readonly number[];
  readonly embeddedValue?: number;
  readonly signedImmediate?: number;
}

export class UnsupportedTsqOpcodeError extends Error {
  readonly offset: number;
  readonly opcode: number;

  constructor(offset: number, opcode: number) {
    super(`Unsupported TSQ opcode 0x${opcode.toString(16).padStart(2, "0")} at 0x${offset.toString(16)}.`);
    this.name = "UnsupportedTsqOpcodeError";
    this.offset = offset;
    this.opcode = opcode;
  }
}

function hasBoundaryMarker(bytes: Uint8Array, offset: number): boolean {
  if (offset + tsqBoundaryMarker.length > bytes.length) return false;
  return tsqBoundaryMarker.every((value, index) => bytes[offset + index] === value);
}

export function readTsq(bytes: Uint8Array): TsqFile {
  const matchingBoundaries = tsqDirectoryBoundaries.filter((offset) => hasBoundaryMarker(bytes, offset));
  if (matchingBoundaries.length !== 1) {
    throw new Error(`TSQ must contain exactly one proven directory boundary marker; found ${matchingBoundaries.length}.`);
  }

  const directoryEnd = matchingBoundaries[0]!;
  const directoryEntryCount = (directoryEnd / tsqDirectoryEntrySize) as TsqDirectoryEntryCount;
  const data = new BinaryView(bytes);
  const entries = Array.from({ length: directoryEntryCount }, (_, index): TsqDirectoryEntry => ({
    index,
    priority: data.u16(index * tsqDirectoryEntrySize),
    sequenceOffset: data.u16(index * tsqDirectoryEntrySize + 2),
  }));
  for (const entry of entries) {
    if (entry.sequenceOffset >= bytes.length) {
      throw new Error(`TSQ request ${entry.index} sequence offset 0x${entry.sequenceOffset.toString(16)} exceeds ${bytes.length} bytes.`);
    }
  }

  return { bytes, directoryEntryCount, directoryEnd, entries };
}

export function lookupTsqRequest(tsq: TsqFile, index: number): TsqDirectoryEntry {
  if (!Number.isSafeInteger(index) || index < 0 || index >= tsq.entries.length) {
    throw new RangeError(`TSQ request index ${index} is outside 0..${tsq.entries.length - 1}.`);
  }
  return tsq.entries[index]!;
}

export function readTsqMusicDescriptors(tsq: TsqFile, requestIndex: number): readonly TsqMusicDescriptor[] {
  const entry = lookupTsqRequest(tsq, requestIndex);
  if (entry.priority !== 0) throw new Error(`TSQ request ${requestIndex} has priority ${entry.priority}; music descriptors require priority 0.`);
  const data = new BinaryView(tsq.bytes);
  data.assertRange(entry.sequenceOffset, tsqMusicChannelCount * tsqMusicDescriptorSize, `TSQ music request ${requestIndex}`);
  return Array.from({ length: tsqMusicChannelCount }, (_, channelIndex): TsqMusicDescriptor => {
    const offset = entry.sequenceOffset + channelIndex * tsqMusicDescriptorSize;
    return {
      channelIndex,
      stateByte: data.u8(offset),
      reservedByte: data.u8(offset + 1),
      relativeBytecodeOffset: data.u16(offset + 2),
    };
  });
}
function assertUint(value: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be an integer in 0..${max}; got ${value}.`);
  }
}

export function decodePackedTsqRequest(raw: number): PackedTsqRequest {
  assertUint(raw, 0xffffffff, "TSQ packed request");
  const requestId = raw & 0xffff;
  return {
    raw: raw >>> 0,
    requestId,
    parameters: raw >>> 16,
    cancel: (requestId & 0x8000) !== 0,
    bank: (requestId >>> 8) & 0x0f,
    index: requestId & 0xff,
    reservedBits: (requestId >>> 12) & 0x07,
  };
}

export function encodePackedTsqRequest(request: {
  readonly bank: number;
  readonly index: number;
  readonly cancel?: boolean;
  readonly parameters?: number;
}): number {
  assertUint(request.bank, 0x0f, "TSQ bank");
  assertUint(request.index, 0xff, "TSQ request index");
  const parameters = request.parameters ?? 0;
  assertUint(parameters, 0xffff, "TSQ request parameters");
  const requestId = (request.cancel ? 0x8000 : 0) | (request.bank << 8) | request.index;
  return ((parameters << 16) | requestId) >>> 0;
}
export function resolvePackedTsqRequest(raw: number, banks: ReadonlyMap<number, TsqFile>): ResolvedTsqRequest {
  const packed = decodePackedTsqRequest(raw);
  if (packed.reservedBits !== 0) {
    throw new Error(`TSQ packed request 0x${packed.requestId.toString(16)} uses unsupported reserved bits ${packed.reservedBits}.`);
  }
  const tsq = banks.get(packed.bank);
  if (!tsq) throw new Error(`TSQ bank ${packed.bank} is not available.`);
  return { packed, tsq, entry: lookupTsqRequest(tsq, packed.index) };
}

interface OpcodeShape {
  readonly family: TsqOpcodeFamily;
  readonly immediateLength: number;
  readonly signedImmediate?: boolean;
}

/** Widths recovered from SNDMOD.IRX play 0x5294..0x5674 and its opcode helpers; values remain uninterpreted here. */
const fixedOpcodeShapes = new Map<number, OpcodeShape>([
  [0xe0, { family: "volume", immediateLength: 1 }],
  [0xe1, { family: "pan", immediateLength: 2 }],
  [0xe2, { family: "tone", immediateLength: 1 }],
  [0xe3, { family: "tempo", immediateLength: 2 }],
  [0xe4, { family: "pitch", immediateLength: 2 }],
  [0xe5, { family: "key-pitch", immediateLength: 2 }],
  [0xe6, { family: "reverb-e6", immediateLength: 1 }],
  [0xe7, { family: "reverb-e7", immediateLength: 1 }],
  [0xe8, { family: "flag-on", immediateLength: 0 }],
  [0xe9, { family: "flag-off", immediateLength: 0 }],
  [0xea, { family: "pitch-cent", immediateLength: 2 }],
  [0xf0, { family: "key-off", immediateLength: 0 }],
  [0xf1, { family: "priority", immediateLength: 1 }],
  [0xf8, { family: "jump", immediateLength: 2, signedImmediate: true }],
  [0xf9, { family: "extended-channel", immediateLength: 2 }],
  [0xff, { family: "end", immediateLength: 0 }],
]);
function signedLe16(bytes: readonly number[]): number {
  const value = bytes[0]! | (bytes[1]! << 8);
  return value >= 0x8000 ? value - 0x10000 : value;
}

export function readTsqBytecodeToken(bytes: Uint8Array, offset: number): TsqBytecodeToken {
  const data = new BinaryView(bytes);
  data.assertRange(offset, 1, "TSQ opcode");
  const opcode = data.u8(offset);
  if (opcode <= 0x7f) {
    return { offset, opcode, family: "step", length: 1, immediateBytes: [], embeddedValue: opcode };
  }
  if (opcode <= 0xdf) {
    return { offset, opcode, family: "key-on", length: 1, immediateBytes: [], embeddedValue: opcode & 0x7f };
  }

  const shape = fixedOpcodeShapes.get(opcode);
  if (!shape) throw new UnsupportedTsqOpcodeError(offset, opcode);
  data.assertRange(offset + 1, shape.immediateLength, `TSQ opcode 0x${opcode.toString(16)}`);
  const immediateBytes = Array.from(data.span(offset + 1, shape.immediateLength));
  return {
    offset,
    opcode,
    family: shape.family,
    length: 1 + shape.immediateLength,
    immediateBytes,
    ...(shape.signedImmediate ? { signedImmediate: signedLe16(immediateBytes) } : {}),
  };
}

/** Lexical scan only: F8 is preserved as a jump token, but control flow is deliberately not followed. */
export function tokenizeTsqBytecode(bytes: Uint8Array, startOffset: number, maxTokens = 4096): readonly TsqBytecodeToken[] {
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new RangeError(`TSQ maxTokens must be positive; got ${maxTokens}.`);
  const tokens: TsqBytecodeToken[] = [];
  let offset = startOffset;
  while (tokens.length < maxTokens) {
    const token = readTsqBytecodeToken(bytes, offset);
    tokens.push(token);
    if (token.family === "end") return tokens;
    offset += token.length;
  }
  throw new Error(`TSQ tokenization exceeded ${maxTokens} tokens without 0xFF data-end.`);
}
