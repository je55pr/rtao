import { BinaryView } from "../core/binary";
import { readCollisionChunkDirectory, readFieldHeader } from "./field";
import { readGifTag } from "./ps2";

export interface CompiledFieldCollision {
  readonly triangleCount: number;
  /** Reflected render-space XYZ, nine floats per triangle. */
  readonly positions: Float32Array;
  readonly surfaceFlags: Uint32Array;
}

const float4Bytes = 16;

export function compileFieldCollision(bytes: Uint8Array): CompiledFieldCollision {
  const header = readFieldHeader(bytes);
  const chunks = readCollisionChunkDirectory(bytes, header);
  const data = new BinaryView(bytes);
  const positions: number[] = [];
  const surfaceFlags: number[] = [];

  for (const chunk of chunks.chunks) {
    let cursor = header.collision.offset + chunk.relativeOffset;
    const end = cursor + chunk.length;
    for (let primitiveIndex = 0; primitiveIndex < chunk.declaredPacketCount; primitiveIndex += 1) {
      if (cursor + 16 > end) throw new Error(`Collision chunk ${chunk.index} ended before primitive ${primitiveIndex}.`);
      const gif = readGifTag(bytes, cursor);
      const vertexCount = gif.loopCount;
      if (vertexCount < 3) throw new Error(`Collision chunk ${chunk.index} primitive ${primitiveIndex} has fewer than three vertices.`);
      cursor += 16;
      const vertices: Array<readonly [number, number, number]> = [];
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        vertices.push([1600 - data.f32(cursor), data.f32(cursor + 4), data.f32(cursor + 8)]);
        cursor += float4Bytes;
      }
      cursor += (vertexCount - 2) * float4Bytes;
      const flags = Number((gif.registers >> 32n) & 0xffff_ffffn);
      if ((gif.primitive & 0x7) !== 4) continue;
      for (let index = 0; index < vertexCount - 2; index += 1) {
        const order = (index & 1) === 0 ? [index, index + 1, index + 2] : [index + 1, index, index + 2];
        for (const vertexIndex of order) {
          const vertex = vertices[vertexIndex];
          if (!vertex) throw new Error("Collision strip referenced a missing vertex.");
          positions.push(vertex[0], vertex[1], vertex[2]);
        }
        surfaceFlags.push(flags);
      }
    }
    if (cursor > end) throw new Error(`Collision chunk ${chunk.index} overran its declared range.`);
  }

  return {
    triangleCount: surfaceFlags.length,
    positions: new Float32Array(positions),
    surfaceFlags: new Uint32Array(surfaceFlags),
  };
}

export function serializeCompiledCollision(collision: CompiledFieldCollision): Uint8Array {
  if (collision.positions.length !== collision.triangleCount * 9 || collision.surfaceFlags.length !== collision.triangleCount) {
    throw new Error("Compiled collision arrays do not match their triangle count.");
  }
  const output = new Uint8Array(16 + collision.positions.byteLength + collision.surfaceFlags.byteLength);
  const view = new DataView(output.buffer);
  output.set(new TextEncoder().encode("RTACOL1!"), 0);
  view.setUint32(8, collision.triangleCount, true);
  output.set(new Uint8Array(collision.positions.buffer, collision.positions.byteOffset, collision.positions.byteLength), 16);
  output.set(new Uint8Array(collision.surfaceFlags.buffer, collision.surfaceFlags.byteOffset, collision.surfaceFlags.byteLength), 16 + collision.positions.byteLength);
  return output;
}

export function deserializeCompiledCollision(bytes: Uint8Array): CompiledFieldCollision {
  const data = new BinaryView(bytes);
  if (data.length < 16 || data.ascii(0, 8) !== "RTACOL1!") throw new Error("Compiled collision cache has an invalid signature.");
  const triangleCount = data.u32(8);
  const positionBytes = triangleCount * 9 * 4;
  const flagBytes = triangleCount * 4;
  if (16 + positionBytes + flagBytes !== data.length) throw new Error("Compiled collision cache length is invalid.");
  const positions = data.slice(16, positionBytes);
  const flags = data.slice(16 + positionBytes, flagBytes);
  return {
    triangleCount,
    positions: new Float32Array(positions.buffer, positions.byteOffset, triangleCount * 9),
    surfaceFlags: new Uint32Array(flags.buffer, flags.byteOffset, triangleCount),
  };
}
