import { describe, expect, it } from "vitest";
import { readCollisionChunkDirectory, readFieldHeader, readRenderChunkDirectory } from "./field";
import {
  decodeFieldMaterialRegisters,
  deserializeCompiledField,
  rendererStaticTriangleGroupKey,
  rendererTriangleKey,
  serializeCompiledField,
  type CompiledFieldMesh,
  type FieldMaterial,
  type FieldRenderVertex,
} from "./fieldGeometry";

describe("HG2 field sections", () => {
  it("ports the C# header and chunk-directory invariants", () => {
    const bytes = createSyntheticFieldDirectories();
    const header = readFieldHeader(bytes);
    expect(header.offsets).toEqual([16, 32, 432, 2000]);
    expect(header.sections).toHaveLength(3);
    const render = readRenderChunkDirectory(bytes, header);
    const collision = readCollisionChunkDirectory(bytes, header);
    expect(render.totalChunkCount).toBe(65);
    expect(render.chunks.at(-1)?.global).toBe(true);
    expect(collision.totalChunkCount).toBe(256);
    expect(collision.chunks.at(-1)?.global).toBe(false);
  });

  it("rejects a field whose EOF marker does not equal its byte length", () => {
    const bytes = createSyntheticFieldDirectories();
    new DataView(bytes.buffer).setUint32(12, 1996, true);
    expect(() => readFieldHeader(bytes)).toThrow(/EOF offset/);
  });
});

describe("compiled Three.js field cache", () => {
  it("round-trips texture, geometry, colour, and UV buffers", () => {
    const source: CompiledFieldMesh = {
      vertexCount: 3,
      triangleCount: 1,
      suppressedTriangleCount: 2,
      primitiveCount: 1,
      textures: [{
        width: 1,
        height: 1,
        wrapS: 0,
        wrapT: 1,
        hasTransparency: false,
        rgba: new Uint8Array([12, 34, 56, 255]),
      }],
      batches: [{
        chunkIndex: 0,
        textureBasePointer: 14515,
        textureIndex: 0,
        rgbaColorComponent: true,
        textureFunction: 0,
        hasTransparency: false,
        billboard: false,
        stableAtmosphere: true,
        nightOnly: false,
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        anchors: new Float32Array(),
        colors: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]),
        warmColors: new Uint8Array([255, 128, 64, 0, 255, 128, 64, 0, 255]),
        nightColors: new Uint8Array([64, 0, 0, 0, 64, 0, 0, 0, 64]),
        uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      }],
      roads: {
        triangleCount: 1,
        positions: new Float32Array([0, 0, 1, 0, 0, 1]),
        kinds: new Uint8Array([0]),
        ribbonCount: 1,
        pavedRibbonCount: 1,
        dirtRibbonCount: 0,
        unresolvedVertexCount: 0,
      },
    };
    const restored = deserializeCompiledField(serializeCompiledField(source));
    expect(restored.vertexCount).toBe(3);
    expect(restored.suppressedTriangleCount).toBe(2);
    expect([...restored.textures[0]!.rgba]).toEqual([12, 34, 56, 255]);
    expect([...restored.batches[0]!.positions]).toEqual([...source.batches[0]!.positions]);
    expect(restored.batches[0]!.stableAtmosphere).toBe(true);
    expect(restored.batches[0]!.nightOnly).toBe(false);
    expect(restored.batches[0]!.rgbaColorComponent).toBe(true);
    expect(restored.batches[0]!.textureFunction).toBe(0);
    expect([...restored.batches[0]!.warmColors]).toEqual([...source.batches[0]!.warmColors]);
    expect([...restored.batches[0]!.nightColors]).toEqual([...source.batches[0]!.nightColors]);
    expect([...restored.batches[0]!.uvs]).toEqual([...source.batches[0]!.uvs]);
    expect([...restored.roads.positions]).toEqual([...source.roads.positions]);
  });

  it("keys renderer-equivalent static triangles at the proven Fuji tolerances", () => {
    const base = triangleVertices(10);
    const subMillimetreNoise = triangleVertices(10.0004);
    const visibleOffset = triangleVertices(10.0006);
    expect(rendererTriangleKey(...base)).toBe(rendererTriangleKey(...subMillimetreNoise));
    expect(rendererTriangleKey(...base)).not.toBe(rendererTriangleKey(...visibleOffset));
  });

  it("scopes duplicate suppression to the exact source chunk and GS material state", () => {
    const material = testMaterial(0x1234n, 0x5678n);
    expect(rendererStaticTriangleGroupKey(64, true, material)).not.toBe(
      rendererStaticTriangleGroupKey(63, true, material),
    );
    expect(rendererStaticTriangleGroupKey(64, true, material)).not.toBe(
      rendererStaticTriangleGroupKey(64, false, material),
    );
    expect(rendererStaticTriangleGroupKey(64, true, material)).not.toBe(
      rendererStaticTriangleGroupKey(64, true, testMaterial(0x1235n, 0x5678n)),
    );
    expect(rendererStaticTriangleGroupKey(64, true, material)).not.toBe(
      rendererStaticTriangleGroupKey(64, true, testMaterial(0x1234n, 0x5679n)),
    );
  });
});

describe("HG2 field material updates", () => {
  it("preserves the optional fifth MIPTBP1_2 register used by the countryside asphalt", () => {
    const tex0 = 12201n | (2n << 14n) | (0x13n << 20n) | (7n << 26n) | (6n << 30n)
      | (1n << 34n) | (2n << 35n) | (0x3100n << 37n);
    const material = decodeFieldMaterialRegisters([
      { register: 0x0e, value: 0x1000000000008004n },
      { register: 0x15, value: 0x02n },
      { register: 0x07, value: tex0 },
      { register: 0x09, value: 0x01n },
      { register: 0x35, value: 0x100000000000AFBAn },
    ]);
    expect(material?.materialGifTag.loopCount).toBe(4);
    expect(material?.materialGifTag.registerCount).toBe(1);
    expect(material?.materialGifTag.registers).toBe(0x0en);
    expect(material?.tex0.textureBasePointer).toBe(12201);
    expect(material?.tex0.width).toBe(128);
    expect(material?.tex0.height).toBe(64);
    expect(material?.tex0.rgbaColorComponent).toBe(true);
    expect(material?.tex0.textureFunction).toBe(2);
    expect(material?.clamp).toEqual({ wrapModeS: 1, wrapModeT: 0 });
    expect(material?.mipTbp1).toBe(0x100000000000AFBAn);
  });

  it("does not mistake an unknown fifth register for a valid material update", () => {
    expect(decodeFieldMaterialRegisters([
      { register: 0x0e, value: 0x1000000000008004n },
      { register: 0x15, value: 2n },
      { register: 0x07, value: 3n },
      { register: 0x09, value: 4n },
      { register: 0x34, value: 5n },
    ])).toBeUndefined();
  });
});

function testMaterial(tex0Raw: bigint, clampRaw: bigint): FieldMaterial {
  return {
    materialGifTagRaw: 0x1000000000008003n,
    materialGifTag: { loopCount: 3, endOfPacket: true, primitiveEnabled: false, primitive: 0, format: 0, registerCount: 1, registers: 0x0en },
    tex1: 0x02n,
    tex0Raw,
    tex0: {
      textureBasePointer: 1,
      textureBufferWidth: 1,
      pixelStorageFormat: 0x13,
      width: 64,
      height: 64,
      rgbaColorComponent: true,
      textureFunction: 0,
      clutBasePointer: 2,
      clutPixelStorageFormat: 0,
      clutStorageMode: false,
      clutEntryOffset: 0,
    },
    clampRaw,
    clamp: { wrapModeS: 0, wrapModeT: 0 },
  };
}

function triangleVertices(firstX: number): [FieldRenderVertex, FieldRenderVertex, FieldRenderVertex] {
  const vertex = (x: number, z: number, u: number, v: number): FieldRenderVertex => ({
    position: { x, y: 20, z },
    dayColor: { x: 64, y: 96, z: 128 },
    unknown: { x: 0, y: 0, z: 0 },
    nightColor: { x: 32, y: 48, z: 64 },
    textureCoordinate: { x: u, y: v, z: 1 },
  });
  return [vertex(firstX, 30, 1, 3), vertex(11, 30, 1.1, 3), vertex(10, 31, 1, 3.1)];
}

function createSyntheticFieldDirectories(): Uint8Array {
  const bytes = new Uint8Array(2000);
  const view = new DataView(bytes.buffer);
  [16, 32, 432, 2000].forEach((value, index) => view.setUint32(index * 4, value, true));

  const renderSection = 32;
  for (let index = 0; index < 65; index += 1) {
    view.setUint32(renderSection + index * 4, 390, true);
    view.setUint16(renderSection + 65 * 4 + index * 2, 0, true);
  }
  const collisionSection = 432;
  for (let index = 0; index < 256; index += 1) {
    view.setUint32(collisionSection + index * 4, 1536, true);
    view.setUint16(collisionSection + 256 * 4 + index * 2, 0, true);
  }
  return bytes;
}
