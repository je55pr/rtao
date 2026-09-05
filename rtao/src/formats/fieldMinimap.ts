import { BinaryView } from "../core/binary";
import { readFieldHeader } from "./field";
import type { FieldRenderPrimitive, Vec3 } from "./fieldGeometry";
import { DmaTagId, effectiveVifCount, readDmaChain, readGifTag, readVifPacket, type GifTag } from "./ps2";

export interface FieldMinimapVertex {
  readonly position: Vec3;
  readonly color: Vec3;
}

export interface FieldMinimapPrimitive {
  readonly gifTag: GifTag;
  readonly vertices: FieldMinimapVertex[];
}

export type RoadSurfaceKind = "paved" | "dirt";

export interface CompiledRoadNetwork {
  readonly triangleCount: number;
  readonly positions: Float32Array;
  readonly kinds: Uint8Array;
  readonly ribbonCount: number;
  readonly pavedRibbonCount: number;
  readonly dirtRibbonCount: number;
  readonly unresolvedVertexCount: number;
}

const v3_32 = 0x68;
const v4_32 = 0x6c;
const minimapVuProgram = 10;
const vectorsPerVertex = 4;
const bytesPerVector3 = 12;
const roadMapColor = 88;
const dirtTextureBasePointer = 14634;

export function readFieldMinimapPrimitives(bytes: Uint8Array): FieldMinimapPrimitive[] {
  const header = readFieldHeader(bytes);
  const extra = header.extras[0];
  if (!extra) return [];
  const data = new BinaryView(bytes);
  const candidates = [...new Set([0x10, data.u32(extra.offset), data.u32(extra.offset + 4)])].sort((a, b) => a - b);
  for (const relativeOffset of candidates) {
    if (relativeOffset + 16 > extra.length) continue;
    const chainStart = extra.offset + relativeOffset;
    let packets;
    try {
      packets = readDmaChain(bytes, chainStart, extra.length - relativeOffset);
    } catch {
      continue;
    }
    const output: FieldMinimapPrimitive[] = [];
    let malformed = false;
    for (const packet of packets) {
      if (packet.tag.id !== DmaTagId.Cnt) continue;
      const tagOffset = chainStart + packet.relativeOffset;
      const payloadOffset = tagOffset + 16;
      let instructions;
      try {
        instructions = readVifPacket(bytes, tagOffset, packet.tag);
      } catch {
        malformed = true;
        break;
      }
      for (let index = 0; index + 2 < instructions.length; index += 1) {
        const gifUnpack = instructions[index];
        const vertexUnpack = instructions[index + 1];
        const execute = instructions[index + 2];
        if (!gifUnpack || !vertexUnpack || !execute ||
          gifUnpack.kind !== "unpack" || gifUnpack.code.command !== v4_32 || effectiveVifCount(gifUnpack.code.count) !== 1 ||
          vertexUnpack.kind !== "unpack" || vertexUnpack.code.command !== v3_32 ||
          execute.kind !== "mscalf" || execute.code.immediate !== minimapVuProgram) continue;
        const gifTag = readGifTag(bytes, payloadOffset + gifUnpack.dataOffset);
        if (effectiveVifCount(vertexUnpack.code.count) !== gifTag.loopCount * vectorsPerVertex) continue;
        output.push({
          gifTag,
          vertices: readVertices(data, payloadOffset + vertexUnpack.dataOffset, gifTag.loopCount),
        });
      }
    }
    if (!malformed && output.length > 0) return output;
  }
  return [];
}

export function compileFieldRoadNetwork(bytes: Uint8Array, renderPrimitives: FieldRenderPrimitive[]): CompiledRoadNetwork {
  const surface = new RawFieldSurfaceSampler(renderPrimitives);
  const positions: number[] = [];
  const kinds: number[] = [];
  let ribbonCount = 0, pavedRibbonCount = 0, dirtRibbonCount = 0, unresolvedVertexCount = 0;
  for (const primitive of readFieldMinimapPrimitives(bytes)) {
    if ((primitive.gifTag.primitive & 7) !== 4 || primitive.vertices.length < 3 || !isRoadPrimitive(primitive)) continue;
    const projected = primitive.vertices.map((vertex) => {
      const x = 1600 - vertex.position.x, z = vertex.position.z;
      const sample = surface.sampleHighest(x, z);
      if (!sample) unresolvedVertexCount += 1;
      return { x, y: sample?.y ?? 31, z };
    });
    let dirtSamples = 0;
    const pairCount = Math.floor(projected.length / 2);
    for (let pair = 0; pair < pairCount; pair += 1) {
      const a = projected[pair * 2], b = projected[Math.min(pair * 2 + 1, projected.length - 1)];
      if (!a || !b) continue;
      const underlay = surface.sampleHighest((a.x + b.x) * 0.5, (a.z + b.z) * 0.5);
      if (underlay?.textureBasePointer === dirtTextureBasePointer) dirtSamples += 1;
    }
    const dirt = dirtSamples > pairCount / 2;
    ribbonCount += 1;
    if (dirt) dirtRibbonCount += 1; else pavedRibbonCount += 1;
    for (let index = 0; index < projected.length - 2; index += 1) {
      const triangle = (index & 1) === 0 ? [index, index + 1, index + 2] : [index + 1, index, index + 2];
      for (const vertexIndex of triangle) {
        const vertex = projected[vertexIndex];
        if (!vertex) throw new Error("Minimap road strip referenced a missing vertex.");
        positions.push(vertex.x, vertex.z);
      }
      kinds.push(dirt ? 1 : 0);
    }
  }
  return {
    triangleCount: kinds.length,
    positions: new Float32Array(positions),
    kinds: new Uint8Array(kinds),
    ribbonCount,
    pavedRibbonCount,
    dirtRibbonCount,
    unresolvedVertexCount,
  };
}

function readVertices(data: BinaryView, offset: number, count: number): FieldMinimapVertex[] {
  const output: FieldMinimapVertex[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = offset + index * vectorsPerVertex * bytesPerVector3;
    output.push({ position: readVec3(data, base), color: readVec3(data, base + bytesPerVector3 * 2) });
  }
  return output;
}

function readVec3(data: BinaryView, offset: number): Vec3 {
  return { x: data.f32(offset), y: data.f32(offset + 4), z: data.f32(offset + 8) };
}

function isRoadPrimitive(primitive: FieldMinimapPrimitive): boolean {
  return primitive.vertices.every((vertex) =>
    Math.abs(vertex.color.x - roadMapColor) <= 0.01 &&
    Math.abs(vertex.color.y - roadMapColor) <= 0.01 &&
    Math.abs(vertex.color.z - 231) <= 0.01);
}

class RawFieldSurfaceSampler {
  private readonly byChunk = new Map<number, RawSurfaceTriangle[]>();

  constructor(primitives: FieldRenderPrimitive[]) {
    for (const primitive of primitives) {
      if (primitive.placementOffset || primitive.chunkIndex < 0 || primitive.chunkIndex >= 64 || (primitive.gifTag.primitive & 7) !== 4) continue;
      const key = (7 - primitive.chunkX) + primitive.chunkZ * 8;
      const list = this.byChunk.get(key) ?? [];
      for (let index = 0; index < primitive.vertices.length - 2; index += 1) {
        const indices = (index & 1) === 0 ? [index, index + 1, index + 2] : [index + 1, index, index + 2];
        const [a, b, c] = indices.map((vertexIndex) => primitive.vertices[vertexIndex]?.position);
        if (!a || !b || !c) continue;
        list.push({
          a: { x: 1600 - a.x, y: a.y, z: a.z }, b: { x: 1600 - b.x, y: b.y, z: b.z }, c: { x: 1600 - c.x, y: c.y, z: c.z },
          textureBasePointer: primitive.material.tex0.textureBasePointer,
        });
      }
      this.byChunk.set(key, list);
    }
  }

  sampleHighest(x: number, z: number): { y: number; textureBasePointer: number } | undefined {
    const chunkX = Math.max(0, Math.min(7, Math.floor(x / 200)));
    const chunkZ = Math.max(0, Math.min(7, Math.floor(z / 200)));
    let best: { y: number; textureBasePointer: number } | undefined;
    for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
      for (const triangle of this.byChunk.get(chunkX + dx + (chunkZ + dz) * 8) ?? []) {
        const y = sampleTriangleY(triangle.a, triangle.b, triangle.c, x, z);
        if (y !== undefined && (!best || y > best.y)) best = { y, textureBasePointer: triangle.textureBasePointer };
      }
    }
    return best;
  }
}

interface RawSurfaceTriangle { readonly a: Vec3; readonly b: Vec3; readonly c: Vec3; readonly textureBasePointer: number }

function sampleTriangleY(a: Vec3, b: Vec3, c: Vec3, x: number, z: number): number | undefined {
  const v0x = b.x - a.x, v0z = b.z - a.z, v1x = c.x - a.x, v1z = c.z - a.z, v2x = x - a.x, v2z = z - a.z;
  const determinant = v0x * v1z - v1x * v0z;
  if (Math.abs(determinant) < 0.00001) return undefined;
  const u = (v2x * v1z - v1x * v2z) / determinant, v = (v0x * v2z - v2x * v0z) / determinant;
  if (u < -0.002 || v < -0.002 || u + v > 1.002) return undefined;
  const y = a.y + u * (b.y - a.y) + v * (c.y - a.y);
  return Number.isFinite(y) ? y : undefined;
}
