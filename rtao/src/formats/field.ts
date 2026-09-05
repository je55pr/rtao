import { BinaryView, hex } from "../core/binary";

export type FieldSectionKind = "textures" | "renderMeshes" | "collision" | "extra";

export interface FieldSection {
  readonly kind: FieldSectionKind;
  readonly extraIndex: number;
  readonly offset: number;
  readonly length: number;
}

export interface FieldHeader {
  readonly offsets: number[];
  readonly sections: FieldSection[];
  readonly fileLength: number;
  readonly headerLength: number;
  readonly endOffset: number;
  readonly textures: FieldSection;
  readonly renderMeshes: FieldSection;
  readonly collision: FieldSection;
  readonly extras: FieldSection[];
}

export interface FieldChunk {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly global: boolean;
  readonly relativeOffset: number;
  readonly length: number;
  readonly declaredPacketCount: number;
}

export interface FieldChunkDirectory {
  readonly gridSize: number;
  readonly spatialChunkCount: number;
  readonly totalChunkCount: number;
  readonly hasGlobalChunk: boolean;
  readonly dataOffset: number;
  readonly chunks: FieldChunk[];
}

export function readFieldHeader(bytes: Uint8Array): FieldHeader {
  const data = new BinaryView(bytes);
  if (data.length < 20) throw new Error("Field file is too small to contain the HG2 section table.");
  const firstOffset = data.u32(0);
  if (firstOffset < 16 || firstOffset > data.length || (firstOffset & 3) !== 0) {
    throw new Error(`Invalid first field section offset ${hex(firstOffset, 8)}.`);
  }

  const offsets: number[] = [];
  for (let offset = 0; offset < firstOffset; offset += 4) {
    const value = data.u32(offset);
    if (value === 0) break;
    offsets.push(value);
  }
  if (offsets.length < 4) throw new Error("Field section table does not contain texture, mesh, collision and EOF offsets.");
  if (offsets[0] !== firstOffset) throw new Error("First field offset does not match the section-table length.");

  let previous = 0;
  for (const value of offsets) {
    if (value <= previous) throw new Error("Field section offsets are not strictly increasing.");
    if (value > data.length) throw new Error("Field section offset lies beyond end of file.");
    previous = value;
  }
  if (offsets.at(-1) !== data.length) {
    throw new Error(`Field EOF offset ${hex(offsets.at(-1) ?? 0)} does not match file length ${hex(data.length)}.`);
  }

  const sections: FieldSection[] = [];
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const offset = offsets[index];
    const end = offsets[index + 1];
    if (offset === undefined || end === undefined) throw new Error("Incomplete field section table.");
    sections.push({
      kind: index === 0 ? "textures" : index === 1 ? "renderMeshes" : index === 2 ? "collision" : "extra",
      extraIndex: index >= 3 ? index - 3 : 0,
      offset,
      length: end - offset,
    });
  }
  const textures = requiredSection(sections, 0);
  const renderMeshes = requiredSection(sections, 1);
  const collision = requiredSection(sections, 2);
  return {
    offsets,
    sections,
    fileLength: data.length,
    headerLength: firstOffset,
    endOffset: offsets.at(-1) ?? data.length,
    textures,
    renderMeshes,
    collision,
    extras: sections.slice(3),
  };
}

export function readRenderChunkDirectory(bytes: Uint8Array, header: FieldHeader): FieldChunkDirectory {
  return readChunkDirectory(bytes, header.renderMeshes, 8, true);
}

export function readCollisionChunkDirectory(bytes: Uint8Array, header: FieldHeader): FieldChunkDirectory {
  return readChunkDirectory(bytes, header.collision, 16, false);
}

export function readChunkDirectory(
  bytes: Uint8Array,
  section: FieldSection,
  gridSize: number,
  hasGlobalChunk: boolean,
): FieldChunkDirectory {
  if (!Number.isInteger(gridSize) || gridSize <= 0) throw new Error("Chunk grid size must be positive.");
  const data = new BinaryView(bytes);
  const spatialChunkCount = gridSize * gridSize;
  const totalChunkCount = spatialChunkCount + (hasGlobalChunk ? 1 : 0);
  const rawDirectoryBytes = totalChunkCount * 4 + totalChunkCount * 2;
  if (section.length < rawDirectoryBytes) throw new Error("Field section is too small for its chunk directory.");

  const offsets: number[] = [];
  for (let index = 0; index < totalChunkCount; index += 1) {
    offsets.push(data.u32(section.offset + index * 4));
  }
  const counts: number[] = [];
  const countsOffset = section.offset + totalChunkCount * 4;
  for (let index = 0; index < totalChunkCount; index += 1) {
    counts.push(data.u16(countsOffset + index * 2));
  }

  const firstDataOffset = offsets[0];
  if (firstDataOffset === undefined || firstDataOffset < rawDirectoryBytes || firstDataOffset > section.length) {
    throw new Error(`Chunk data starts at invalid section-relative offset ${hex(firstDataOffset ?? 0)}.`);
  }
  previousOffsets(offsets, firstDataOffset, section.length);

  const chunks = offsets.map((relativeOffset, index): FieldChunk => {
    const end = offsets[index + 1] ?? section.length;
    const global = hasGlobalChunk && index === spatialChunkCount;
    return {
      index,
      x: global ? -1 : index % gridSize,
      z: global ? -1 : Math.floor(index / gridSize),
      global,
      relativeOffset,
      length: end - relativeOffset,
      declaredPacketCount: counts[index] ?? 0,
    };
  });
  return { gridSize, spatialChunkCount, totalChunkCount, hasGlobalChunk, dataOffset: firstDataOffset, chunks };
}

function previousOffsets(offsets: number[], first: number, maximum: number): void {
  let previous = first;
  for (const value of offsets) {
    if (value < previous || value > maximum) {
      throw new Error("Chunk offsets are not monotonic or exceed their field section.");
    }
    previous = value;
  }
}

function requiredSection(sections: FieldSection[], index: number): FieldSection {
  const section = sections[index];
  if (!section) throw new Error("Missing required field section.");
  return section;
}
