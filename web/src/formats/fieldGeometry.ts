import { BinaryView } from "../core/binary";
import { readFieldHeader, readRenderChunkDirectory, type FieldChunk, type FieldHeader } from "./field";
import { GsLocalMemory, readFieldTextureUploads } from "./gsTextures";
import { compileFieldRoadNetwork, type CompiledRoadNetwork } from "./fieldMinimap";
import { DmaTagId, decodeGifTagWords, effectiveVifCount, gifRegister, hg2FieldUsesStableVisibilityProfile, readDmaChain, readGifTag, readVifPacket, type GifTag, type VifInstruction } from "./ps2";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GsTex0 {
  readonly textureBasePointer: number;
  readonly textureBufferWidth: number;
  readonly pixelStorageFormat: number;
  readonly width: number;
  readonly height: number;
  /** TEX0.TCC: false = RGB, true = RGBA. */
  readonly rgbaColorComponent: boolean;
  /** TEX0.TFX texture-function selector. HG2 outdoor fields use 0 = MODULATE. */
  readonly textureFunction: number;
  readonly clutBasePointer: number;
  readonly clutPixelStorageFormat: number;
  readonly clutStorageMode: boolean;
  readonly clutEntryOffset: number;
}

export interface GsClamp {
  readonly wrapModeS: number;
  readonly wrapModeT: number;
}

export interface FieldMaterial {
  readonly materialGifTagRaw: bigint;
  readonly materialGifTag: GifTag;
  readonly tex1: bigint;
  readonly tex0Raw: bigint;
  readonly tex0: GsTex0;
  readonly clampRaw: bigint;
  readonly clamp: GsClamp;
  readonly mipTbp1?: bigint;
}

export interface FieldMaterialRegister {
  readonly register: number;
  readonly value: bigint;
}

export interface FieldRenderVertex {
  readonly position: Vec3;
  readonly dayColor: Vec3;
  readonly unknown: Vec3;
  readonly nightColor: Vec3;
  readonly textureCoordinate: Vec3;
}

export interface FieldRenderPrimitive {
  readonly chunkIndex: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly primitiveIndex: number;
  readonly material: FieldMaterial;
  readonly gifTag: GifTag;
  readonly vertices: FieldRenderVertex[];
  readonly placementOffset?: Vec3;
}

export interface CompiledFieldTexture {
  readonly width: number;
  readonly height: number;
  readonly wrapS: number;
  readonly wrapT: number;
  readonly hasTransparency: boolean;
  readonly rgba: Uint8Array;
}

export interface CompiledFieldBatch {
  readonly chunkIndex: number;
  readonly textureBasePointer: number;
  readonly textureIndex: number;
  readonly rgbaColorComponent: boolean;
  readonly textureFunction: number;
  readonly hasTransparency: boolean;
  readonly billboard: boolean;
  /** Ordinary MSCALF 8 selector: true = stable VU memory-21 visibility profile. */
  readonly stableAtmosphere: boolean;
  /** Authored FLD/220 corona family that is hidden in the daytime endpoint. */
  readonly nightOnly: boolean;
  readonly positions: Float32Array;
  readonly anchors: Float32Array;
  readonly colors: Uint8Array;
  readonly warmColors: Uint8Array;
  readonly nightColors: Uint8Array;
  readonly uvs: Float32Array;
}

export interface CompiledFieldMesh {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly suppressedTriangleCount: number;
  readonly primitiveCount: number;
  readonly batches: CompiledFieldBatch[];
  readonly textures: CompiledFieldTexture[];
  readonly roads: CompiledRoadNetwork;
}

export const compiledFieldCacheVersion = 8;

const v3_32 = 0x68;
const v4_32 = 0x6c;
const fieldMeshVuProgram = 8;
const fieldBillboardVuProgram = 6;
const vectorsPerVertex = 5;
const bytesPerVector3 = 12;

export function readFieldRenderPrimitives(bytes: Uint8Array): FieldRenderPrimitive[] {
  const header = readFieldHeader(bytes);
  const chunks = readRenderChunkDirectory(bytes, header);
  const output: FieldRenderPrimitive[] = [];
  for (const chunk of chunks.chunks) {
    output.push(...readChunkPrimitives(bytes, header, chunk));
  }
  return output;
}

export function compileFieldVertexColorMesh(bytes: Uint8Array): CompiledFieldMesh {
  const primitives = readFieldRenderPrimitives(bytes);
  const memory = new GsLocalMemory();
  memory.replay(readFieldTextureUploads(bytes, readFieldHeader(bytes)));
  const textureIndices = new Map<string, number>();
  const textures: CompiledFieldTexture[] = [];
  const groups = new Map<string, { chunkIndex: number; textureBasePointer: number; textureIndex: number; rgbaColorComponent: boolean; textureFunction: number; hasTransparency: boolean; billboard: boolean; stableAtmosphere: boolean; nightOnly: boolean; positions: number[]; anchors: number[]; colors: number[]; warmColors: number[]; nightColors: number[]; uvs: number[] }>();
  const seenStaticTriangles = new Map<string, Set<string>>();
  let triangleCount = 0;
  let suppressedTriangleCount = 0;

  for (const primitive of primitives) {
    if ((primitive.gifTag.primitive & 0x7) !== 4) continue;
    const nightOnly = isNightLightBillboard(primitive);
    const billboard = primitive.placementOffset !== undefined;
    const stableAtmosphere = !billboard && hg2FieldUsesStableVisibilityProfile(primitive.gifTag);
    const textureEnabled = (primitive.gifTag.primitive & 0x10) !== 0;
    const textureKey = textureEnabled ? materialTextureKey(primitive.material) : "untextured";
    let textureIndex = -1;
    let hasTransparency = false;
    if (textureEnabled) {
      const existing = textureIndices.get(textureKey);
      if (existing !== undefined) {
        textureIndex = existing;
        hasTransparency = textures[existing]?.hasTransparency ?? false;
      } else {
        const decoded = decodeTextureOrFallback(memory, primitive.material.tex0);
        textureIndex = textures.length;
        hasTransparency = decoded.hasTransparency;
        textureIndices.set(textureKey, textureIndex);
        textures.push({
          ...decoded,
          wrapS: primitive.material.clamp.wrapModeS,
          wrapT: primitive.material.clamp.wrapModeT,
        });
      }
    }
    const rgbaColorComponent = textureEnabled ? primitive.material.tex0.rgbaColorComponent : false;
    const textureFunction = textureEnabled ? primitive.material.tex0.textureFunction : -1;
    const groupKey = `${primitive.chunkIndex}|${textureIndex}|${textureEnabled ? 1 : 0}|${rgbaColorComponent ? 1 : 0}|${textureFunction}|${billboard ? 1 : 0}|${stableAtmosphere ? 1 : 0}|${nightOnly ? 1 : 0}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { chunkIndex: primitive.chunkIndex, textureBasePointer: textureEnabled ? primitive.material.tex0.textureBasePointer : 0, textureIndex, rgbaColorComponent, textureFunction, hasTransparency, billboard, stableAtmosphere, nightOnly, positions: [], anchors: [], colors: [], warmColors: [], nightColors: [], uvs: [] };
      groups.set(groupKey, group);
    }
    let staticTriangles: Set<string> | undefined;
    if (!billboard) {
      const sourceGroupKey = rendererStaticTriangleGroupKey(primitive.chunkIndex, textureEnabled, primitive.material);
      staticTriangles = seenStaticTriangles.get(sourceGroupKey);
      if (!staticTriangles) {
        staticTriangles = new Set<string>();
        seenStaticTriangles.set(sourceGroupKey, staticTriangles);
      }
    }
    for (let index = 0; index < primitive.vertices.length - 2; index += 1) {
      const indices = (index & 1) === 0 ? [index, index + 1, index + 2] : [index + 1, index, index + 2];
      if (staticTriangles) {
        const a = primitive.vertices[indices[0]!];
        const b = primitive.vertices[indices[1]!];
        const c = primitive.vertices[indices[2]!];
        if (!a || !b || !c) throw new Error("Triangle strip referenced a missing vertex.");
        const triangleKey = rendererTriangleKey(a, b, c);
        if (staticTriangles.has(triangleKey)) {
          suppressedTriangleCount += 1;
          continue;
        }
        staticTriangles.add(triangleKey);
      }
      for (const vertexIndex of indices) {
        const vertex = primitive.vertices[vertexIndex];
        if (!vertex) throw new Error("Triangle strip referenced a missing vertex.");
        if (billboard && primitive.placementOffset) {
          group.positions.push(
            -(vertex.position.x - primitive.placementOffset.x),
            vertex.position.y - primitive.placementOffset.y,
            vertex.position.z - primitive.placementOffset.z,
          );
          group.anchors.push(1600 - primitive.placementOffset.x, primitive.placementOffset.y, primitive.placementOffset.z);
        } else {
          group.positions.push(1600 - vertex.position.x, vertex.position.y, vertex.position.z);
        }
        group.colors.push(fieldColorByte(vertex.dayColor.x), fieldColorByte(vertex.dayColor.y), fieldColorByte(vertex.dayColor.z));
        // VU1 MSCALF 8 reconstructs the warm transition as Day.r plus the
        // former Unknown.y/z channels, then blends Day/Warm/Night with the
        // outdoor environment weights. Unknown.x is not consumed by this
        // colour path, so do not invent a semantic for it in the compiled mesh.
        group.warmColors.push(fieldColorByte(vertex.dayColor.x), fieldColorByte(vertex.unknown.y), fieldColorByte(vertex.unknown.z));
        group.nightColors.push(fieldColorByte(vertex.nightColor.x), fieldColorByte(vertex.nightColor.y), fieldColorByte(vertex.nightColor.z));
        const q = Math.abs(vertex.textureCoordinate.z) < 0.0001 ? 1 : vertex.textureCoordinate.z;
        group.uvs.push(vertex.textureCoordinate.x / q, vertex.textureCoordinate.y / q);
      }
      triangleCount += 1;
    }
  }
  const batches = [...groups.values()].map((group): CompiledFieldBatch => ({
    chunkIndex: group.chunkIndex,
    textureBasePointer: group.textureBasePointer,
    textureIndex: group.textureIndex,
    rgbaColorComponent: group.rgbaColorComponent,
    textureFunction: group.textureFunction,
    hasTransparency: group.hasTransparency,
    billboard: group.billboard,
    stableAtmosphere: group.stableAtmosphere,
    nightOnly: group.nightOnly,
    positions: new Float32Array(group.positions),
    anchors: new Float32Array(group.anchors),
    colors: new Uint8Array(group.colors),
    warmColors: new Uint8Array(group.warmColors),
    nightColors: new Uint8Array(group.nightColors),
    uvs: new Float32Array(group.uvs),
  }));
  return {
    vertexCount: triangleCount * 3,
    triangleCount,
    suppressedTriangleCount,
    primitiveCount: primitives.length,
    batches,
    textures,
    roads: compileFieldRoadNetwork(bytes, primitives),
  };
}

export function serializeCompiledField(mesh: CompiledFieldMesh): Uint8Array {
  const metadata = {
    vertexCount: mesh.vertexCount,
    triangleCount: mesh.triangleCount,
    suppressedTriangleCount: mesh.suppressedTriangleCount,
    primitiveCount: mesh.primitiveCount,
    roads: {
      triangleCount: mesh.roads.triangleCount,
      ribbonCount: mesh.roads.ribbonCount,
      pavedRibbonCount: mesh.roads.pavedRibbonCount,
      dirtRibbonCount: mesh.roads.dirtRibbonCount,
      unresolvedVertexCount: mesh.roads.unresolvedVertexCount,
      positionBytes: mesh.roads.positions.byteLength,
      kindBytes: mesh.roads.kinds.byteLength,
    },
    textures: mesh.textures.map((texture) => ({
      width: texture.width,
      height: texture.height,
      wrapS: texture.wrapS,
      wrapT: texture.wrapT,
      hasTransparency: texture.hasTransparency,
      rgbaBytes: texture.rgba.byteLength,
    })),
    batches: mesh.batches.map((batch) => ({
      chunkIndex: batch.chunkIndex,
      textureBasePointer: batch.textureBasePointer,
      textureIndex: batch.textureIndex,
      rgbaColorComponent: batch.rgbaColorComponent,
      textureFunction: batch.textureFunction,
      hasTransparency: batch.hasTransparency,
      billboard: batch.billboard,
      stableAtmosphere: batch.stableAtmosphere,
      nightOnly: batch.nightOnly,
      positionBytes: batch.positions.byteLength,
      anchorBytes: batch.anchors.byteLength,
      colorBytes: batch.colors.byteLength,
      warmColorBytes: batch.warmColors.byteLength,
      nightColorBytes: batch.nightColors.byteLength,
      uvBytes: batch.uvs.byteLength,
    })),
  };
  const json = new TextEncoder().encode(JSON.stringify(metadata));
  const headerBytes = align4(12 + json.byteLength);
  const payloadBytes = mesh.textures.reduce((sum, texture) => sum + texture.rgba.byteLength, 0)
    + mesh.batches.reduce((sum, batch) => sum + batch.positions.byteLength + batch.anchors.byteLength + batch.colors.byteLength + batch.warmColors.byteLength + batch.nightColors.byteLength + batch.uvs.byteLength, 0)
    + mesh.roads.positions.byteLength + mesh.roads.kinds.byteLength;
  const output = new Uint8Array(headerBytes + payloadBytes);
  const view = new DataView(output.buffer);
  output.set(new TextEncoder().encode("RTAFLD8!"), 0);
  view.setUint32(8, json.byteLength, true);
  output.set(json, 12);
  let cursor = headerBytes;
  for (const texture of mesh.textures) { output.set(texture.rgba, cursor); cursor += texture.rgba.byteLength; }
  for (const batch of mesh.batches) {
    output.set(new Uint8Array(batch.positions.buffer, batch.positions.byteOffset, batch.positions.byteLength), cursor); cursor += batch.positions.byteLength;
    output.set(new Uint8Array(batch.anchors.buffer, batch.anchors.byteOffset, batch.anchors.byteLength), cursor); cursor += batch.anchors.byteLength;
    output.set(batch.colors, cursor); cursor += batch.colors.byteLength;
    output.set(batch.warmColors, cursor); cursor += batch.warmColors.byteLength;
    output.set(batch.nightColors, cursor); cursor += batch.nightColors.byteLength;
    output.set(new Uint8Array(batch.uvs.buffer, batch.uvs.byteOffset, batch.uvs.byteLength), cursor); cursor += batch.uvs.byteLength;
  }
  output.set(new Uint8Array(mesh.roads.positions.buffer, mesh.roads.positions.byteOffset, mesh.roads.positions.byteLength), cursor); cursor += mesh.roads.positions.byteLength;
  output.set(mesh.roads.kinds, cursor);
  return output;
}

export function deserializeCompiledField(bytes: Uint8Array): CompiledFieldMesh {
  const data = new BinaryView(bytes);
  if (data.length < 12 || data.ascii(0, 8) !== "RTAFLD8!") throw new Error("Compiled field cache has an invalid signature.");
  const jsonLength = data.u32(8);
  const metadata = JSON.parse(new TextDecoder().decode(data.span(12, jsonLength))) as {
    vertexCount: number; triangleCount: number; suppressedTriangleCount?: number; primitiveCount: number;
    roads: { triangleCount: number; ribbonCount: number; pavedRibbonCount: number; dirtRibbonCount: number; unresolvedVertexCount: number; positionBytes: number; kindBytes: number };
    textures: Array<{ width: number; height: number; wrapS: number; wrapT: number; hasTransparency: boolean; rgbaBytes: number }>;
    batches: Array<{ chunkIndex: number; textureBasePointer: number; textureIndex: number; rgbaColorComponent: boolean; textureFunction: number; hasTransparency: boolean; billboard: boolean; stableAtmosphere: boolean; nightOnly: boolean; positionBytes: number; anchorBytes: number; colorBytes: number; warmColorBytes: number; nightColorBytes: number; uvBytes: number }>;
  };
  let cursor = align4(12 + jsonLength);
  const textures = metadata.textures.map((texture): CompiledFieldTexture => {
    const rgba = data.slice(cursor, texture.rgbaBytes); cursor += texture.rgbaBytes;
    return { ...texture, rgba };
  });
  const batches = metadata.batches.map((batch): CompiledFieldBatch => {
    const positionBytes = data.slice(cursor, batch.positionBytes); cursor += batch.positionBytes;
    const anchorBytes = data.slice(cursor, batch.anchorBytes); cursor += batch.anchorBytes;
    const colors = data.slice(cursor, batch.colorBytes); cursor += batch.colorBytes;
    const warmColors = data.slice(cursor, batch.warmColorBytes); cursor += batch.warmColorBytes;
    const nightColors = data.slice(cursor, batch.nightColorBytes); cursor += batch.nightColorBytes;
    const uvBytes = data.slice(cursor, batch.uvBytes); cursor += batch.uvBytes;
    return {
      chunkIndex: batch.chunkIndex,
      textureBasePointer: batch.textureBasePointer,
      textureIndex: batch.textureIndex,
      rgbaColorComponent: batch.rgbaColorComponent,
      textureFunction: batch.textureFunction,
      hasTransparency: batch.hasTransparency,
      billboard: batch.billboard,
      stableAtmosphere: batch.stableAtmosphere,
      nightOnly: batch.nightOnly,
      positions: new Float32Array(positionBytes.buffer, positionBytes.byteOffset, positionBytes.byteLength / 4),
      anchors: new Float32Array(anchorBytes.buffer, anchorBytes.byteOffset, anchorBytes.byteLength / 4),
      colors,
      warmColors,
      nightColors,
      uvs: new Float32Array(uvBytes.buffer, uvBytes.byteOffset, uvBytes.byteLength / 4),
    };
  });
  const roadPositionBytes = data.slice(cursor, metadata.roads.positionBytes); cursor += metadata.roads.positionBytes;
  const roadKinds = data.slice(cursor, metadata.roads.kindBytes); cursor += metadata.roads.kindBytes;
  const roads: CompiledRoadNetwork = {
    triangleCount: metadata.roads.triangleCount,
    positions: new Float32Array(roadPositionBytes.buffer, roadPositionBytes.byteOffset, roadPositionBytes.byteLength / 4),
    kinds: roadKinds,
    ribbonCount: metadata.roads.ribbonCount,
    pavedRibbonCount: metadata.roads.pavedRibbonCount,
    dirtRibbonCount: metadata.roads.dirtRibbonCount,
    unresolvedVertexCount: metadata.roads.unresolvedVertexCount,
  };
  if (cursor !== data.length) throw new Error("Compiled field cache length is invalid.");
  return {
    vertexCount: metadata.vertexCount,
    triangleCount: metadata.triangleCount,
    suppressedTriangleCount: metadata.suppressedTriangleCount ?? 0,
    primitiveCount: metadata.primitiveCount,
    batches,
    textures,
    roads,
  };
}

function readChunkPrimitives(bytes: Uint8Array, header: FieldHeader, chunk: FieldChunk): FieldRenderPrimitive[] {
  const chainStart = header.renderMeshes.offset + chunk.relativeOffset;
  const packets = readDmaChain(bytes, chainStart, chunk.length);
  const output: FieldRenderPrimitive[] = [];
  let currentMaterial: FieldMaterial | undefined;
  let primitiveIndex = 0;
  for (const packet of packets) {
    if (packet.tag.id !== DmaTagId.Cnt) continue;
    const tagOffset = chainStart + packet.relativeOffset;
    const payloadOffset = tagOffset + 16;
    const instructions = readVifPacket(bytes, tagOffset, packet.tag);
    for (let index = 0; index < instructions.length; index += 1) {
      const instruction = instructions[index];
      if (!instruction) continue;
      currentMaterial = tryReadMaterial(bytes, payloadOffset, instruction) ?? currentMaterial;
      if (!currentMaterial) continue;
      const vertexUnpack = instructions[index + 1];
      const execute = instructions[index + 2];
      if (!vertexUnpack || !execute) continue;

      if (isMeshSequence(instruction, vertexUnpack, execute)) {
        const gifTag = readGifTag(bytes, payloadOffset + instruction.dataOffset);
        if (effectiveVifCount(vertexUnpack.code.count) !== gifTag.loopCount * vectorsPerVertex) {
          throw new Error(`Field chunk ${chunk.index} primitive ${primitiveIndex} has a mismatched vertex count.`);
        }
        output.push({
          chunkIndex: chunk.index,
          chunkX: chunk.x,
          chunkZ: chunk.z,
          primitiveIndex: primitiveIndex++,
          material: currentMaterial,
          gifTag,
          vertices: readVertices(bytes, payloadOffset + vertexUnpack.dataOffset, gifTag.loopCount),
        });
      } else if (chunk.global && isBillboardSequence(instruction, vertexUnpack, execute)) {
        const gifTag = readGifTag(bytes, payloadOffset + instruction.dataOffset);
        if (effectiveVifCount(vertexUnpack.code.count) !== 1 + gifTag.loopCount * vectorsPerVertex) continue;
        const offset = readVec3(new BinaryView(bytes), payloadOffset + vertexUnpack.dataOffset);
        const vertices = readVertices(bytes, payloadOffset + vertexUnpack.dataOffset + bytesPerVector3, gifTag.loopCount)
          .map((vertex) => ({ ...vertex, position: addVec3(vertex.position, offset) }));
        output.push({
          chunkIndex: chunk.index,
          chunkX: chunk.x,
          chunkZ: chunk.z,
          primitiveIndex: primitiveIndex++,
          material: currentMaterial,
          gifTag,
          vertices,
          placementOffset: offset,
        });
      }
    }
  }
  return output;
}

function tryReadMaterial(bytes: Uint8Array, payloadOffset: number, instruction: VifInstruction): FieldMaterial | undefined {
  const count = effectiveVifCount(instruction.code.count);
  if (instruction.kind !== "unpack" || instruction.code.command !== v3_32 || count < 4 || count > 5) return undefined;
  const data = new BinaryView(bytes);
  const registers: FieldMaterialRegister[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = payloadOffset + instruction.dataOffset + index * bytesPerVector3;
    const value = BigInt(data.u32(offset + 4)) << 32n | BigInt(data.u32(offset));
    const register = data.u32(offset + 8);
    registers.push({ register, value });
  }
  return decodeFieldMaterialRegisters(registers);
}

/**
 * Decode HG2's compact four/five-register field-material update. Keeping this
 * pure makes the important MIPTBP1_2 shape regression-testable without needing
 * an original field file or a synthetic DMA/VIF chain.
 */
export function decodeFieldMaterialRegisters(registers: readonly FieldMaterialRegister[]): FieldMaterial | undefined {
  if (registers.length < 4 || registers.length > 5) return undefined;
  let materialGifTagRaw: bigint | undefined;
  let tex1: bigint | undefined;
  let tex0: bigint | undefined;
  let clamp: bigint | undefined;
  let mipTbp1: bigint | undefined;
  for (const entry of registers) {
    if (entry.register === 0x0e) materialGifTagRaw = entry.value;
    else if (entry.register === 0x15) tex1 = entry.value;
    else if (entry.register === 0x07) tex0 = entry.value;
    else if (entry.register === 0x09) clamp = entry.value;
    else if (entry.register === 0x35) mipTbp1 = entry.value;
    else return undefined;
  }
  if (materialGifTagRaw === undefined || tex1 === undefined || tex0 === undefined || clamp === undefined || (registers.length === 5 && mipTbp1 === undefined)) return undefined;
  const materialGifTag = decodeGifTagWords(materialGifTagRaw, 0x0en);
  if (materialGifTag.format !== 0 || materialGifTag.registerCount !== 1 || gifRegister(materialGifTag, 0) !== 0x0e || materialGifTag.loopCount !== registers.length - 1) return undefined;
  return {
    materialGifTagRaw,
    materialGifTag,
    tex1,
    tex0Raw: tex0,
    tex0: decodeTex0(tex0),
    clampRaw: clamp,
    clamp: decodeClamp(clamp),
    ...(mipTbp1 === undefined ? {} : { mipTbp1 }),
  };
}

function decodeTex0(value: bigint): GsTex0 {
  const widthExponent = Number((value >> 26n) & 0xfn);
  const heightExponent = Number((value >> 30n) & 0xfn);
  return {
    textureBasePointer: Number(value & 0x3fffn),
    textureBufferWidth: Number((value >> 14n) & 0x3fn),
    pixelStorageFormat: Number((value >> 20n) & 0x3fn),
    width: 1 << widthExponent,
    height: 1 << heightExponent,
    rgbaColorComponent: ((value >> 34n) & 1n) !== 0n,
    textureFunction: Number((value >> 35n) & 0x3n),
    clutBasePointer: Number((value >> 37n) & 0x3fffn),
    clutPixelStorageFormat: Number((value >> 51n) & 0xfn),
    clutStorageMode: ((value >> 55n) & 1n) !== 0n,
    clutEntryOffset: Number((value >> 56n) & 0x1fn),
  };
}

function decodeClamp(value: bigint): GsClamp {
  return { wrapModeS: Number(value & 0x3n), wrapModeT: Number((value >> 2n) & 0x3n) };
}

function readVertices(bytes: Uint8Array, offset: number, count: number): FieldRenderVertex[] {
  const data = new BinaryView(bytes);
  const output: FieldRenderVertex[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = offset + index * vectorsPerVertex * bytesPerVector3;
    output.push({
      position: readVec3(data, base),
      dayColor: readVec3(data, base + 12),
      unknown: readVec3(data, base + 24),
      nightColor: readVec3(data, base + 36),
      textureCoordinate: readVec3(data, base + 48),
    });
  }
  return output;
}

function readVec3(data: BinaryView, offset: number): Vec3 {
  return { x: data.f32(offset), y: data.f32(offset + 4), z: data.f32(offset + 8) };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function isMeshSequence(gif: VifInstruction, vertices: VifInstruction, execute: VifInstruction): boolean {
  return isSequence(gif, vertices, execute, fieldMeshVuProgram);
}

function isBillboardSequence(gif: VifInstruction, vertices: VifInstruction, execute: VifInstruction): boolean {
  return isSequence(gif, vertices, execute, fieldBillboardVuProgram);
}

function isSequence(gif: VifInstruction, vertices: VifInstruction, execute: VifInstruction, program: number): boolean {
  return gif.kind === "unpack" && gif.code.command === v4_32 && effectiveVifCount(gif.code.count) === 1
    && vertices.kind === "unpack" && vertices.code.command === v3_32
    && execute.kind === "mscalf" && execute.code.immediate === program;
}

function fieldColorByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255 / 128)));
}

/**
 * Renderer-equivalent triangle key used only for narrowly scoped duplicate
 * suppression inside one exact HG2 chunk/material state. Position is quantized
 * to one millimetre and UV to 1e-5, matching the reference renderer regression.
 */
export function rendererTriangleKey(a: FieldRenderVertex, b: FieldRenderVertex, c: FieldRenderVertex): string {
  return `${rendererVertexKey(a)}|${rendererVertexKey(b)}|${rendererVertexKey(c)}`;
}

function rendererVertexKey(vertex: FieldRenderVertex): string {
  const q = Math.abs(vertex.textureCoordinate.z) < 0.0001 ? 1 : vertex.textureCoordinate.z;
  return [
    Math.round((1600 - vertex.position.x) * 1000),
    Math.round(vertex.position.y * 1000),
    Math.round(vertex.position.z * 1000),
    fieldColorByte(vertex.dayColor.x),
    fieldColorByte(vertex.dayColor.y),
    fieldColorByte(vertex.dayColor.z),
    fieldColorByte(vertex.unknown.y),
    fieldColorByte(vertex.unknown.z),
    fieldColorByte(vertex.nightColor.x),
    fieldColorByte(vertex.nightColor.y),
    fieldColorByte(vertex.nightColor.z),
    Math.round(vertex.textureCoordinate.x / q * 100_000),
    Math.round(vertex.textureCoordinate.y / q * 100_000),
  ].join(",");
}

export function rendererStaticTriangleGroupKey(chunkIndex: number, textureEnabled: boolean, material: FieldMaterial): string {
  return [
    chunkIndex,
    textureEnabled ? 1 : 0,
    material.materialGifTagRaw.toString(16),
    material.tex1.toString(16),
    material.tex0Raw.toString(16),
    material.clampRaw.toString(16),
    material.mipTbp1?.toString(16) ?? "-",
  ].join(":");
}

function isNightLightBillboard(primitive: FieldRenderPrimitive): boolean {
  if (!primitive.placementOffset || primitive.vertices.length === 0) return false;
  const average = (night: boolean): number => primitive.vertices.reduce((sum, vertex) => {
    const color = night ? vertex.nightColor : vertex.dayColor;
    return sum + (color.x + color.y + color.z) / 3;
  }, 0) / primitive.vertices.length;
  return average(true) >= 180 && average(false) <= 110;
}

function materialTextureKey(material: FieldMaterial): string {
  const texture = material.tex0;
  return [texture.textureBasePointer, texture.textureBufferWidth, texture.pixelStorageFormat, texture.width, texture.height,
    texture.clutBasePointer, texture.clutPixelStorageFormat, texture.clutStorageMode ? 1 : 0, texture.clutEntryOffset,
    material.clamp.wrapModeS, material.clamp.wrapModeT].join(":");
}

function decodeTextureOrFallback(memory: GsLocalMemory, tex0: GsTex0): { width: number; height: number; rgba: Uint8Array; hasTransparency: boolean } {
  try {
    return memory.decodeTexture(tex0);
  } catch {
    const width = 16, height = 16, rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4, magenta = ((x >> 2) + (y >> 2)) % 2 === 0;
      rgba[offset] = magenta ? 255 : 0; rgba[offset + 1] = 0; rgba[offset + 2] = magenta ? 255 : 0; rgba[offset + 3] = 255;
    }
    return { width, height, rgba, hasTransparency: false };
  }
}

function align4(value: number): number { return (value + 3) & ~3; }
