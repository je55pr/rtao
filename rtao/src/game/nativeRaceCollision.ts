import { readCollisionChunkDirectory, readFieldHeader } from '../formats/field';

export type NativeRaceCollisionPoint = readonly [number, number, number, number];

export interface NativeRaceCollisionResult {
  readonly flags: number;
  /** Offset of the selected authored plane record in the supplied bytes. */
  readonly planeOffset: number | null;
  readonly groundY: number;
  readonly ceilingY: number;
  readonly extraY: number;
}

const f = Math.fround;

/** PAL 0x207748. Uses authored strip order and plane coefficients, in native coordinates. */
export function queryNativeRaceCollisionChunk(
  bytes: Uint8Array, offset: number, packetCount: number, point: NativeRaceCollisionPoint,
): NativeRaceCollisionResult {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let groundY = -10000, ceilingY = 10000, extraY = 0, flags = -1;
  let planeOffset: number | null = null;
  const [x, y, z] = point.map(f);
  for (let packet = 0; packet < packetCount; packet++) {
    const vertexCount = data.getUint32(offset, true) & 0x7fff;
    if (vertexCount < 2) throw new Error('Native collision packet needs at least two vertices.');
    const packetEnd = offset + vertexCount * 32 - 16;
    if (packetEnd > bytes.byteLength) throw new Error('Native collision packet exceeds its input.');
    const surface = data.getInt32(offset + 12, true);
    const vertices = offset + 16, planes = vertices + vertexCount * 16;
    for (let triangle = 0; triangle < vertexCount - 2; triangle++) {
      const a = vertices + triangle * 16, b = a + 16, c = b + 16;
      const ax = data.getFloat32(a, true), az = data.getFloat32(a + 8, true);
      const bx = data.getFloat32(b, true), bz = data.getFloat32(b + 8, true);
      const cx = data.getFloat32(c, true), cz = data.getFloat32(c + 8, true);
      const edge0 = f(f(f(bz - az) * f(x! - bx)) - f(f(bx - ax) * f(z! - bz)));
      const edge1 = f(f(f(cz - bz) * f(x! - cx)) - f(f(cx - bx) * f(z! - cz)));
      const dx = f(x! - ax), dz = f(z! - az);
      const edge2 = f(f(f(az - cz) * dx) - f(f(ax - cx) * dz));
      const inside = triangle % 2 === 0
        ? edge0 >= 0 && edge1 >= 0 && edge2 >= 0
        : edge0 <= 0 && edge1 <= 0 && edge2 <= 0;
      if (!inside) continue;
      const plane = planes + triangle * 16;
      const height = f(data.getFloat32(a + 4, true) - f(
        f(dx * data.getFloat32(plane, true)) + f(dz * data.getFloat32(plane + 8, true)),
      ));
      if (surface < 0) {
        if (y! < height && height < ceilingY) ceilingY = height;
        if (height < y! && groundY < height) groundY = height;
      } else if (surface & 0x10000000) {
        extraY = height;
      } else if (height < ceilingY && groundY < height) {
        groundY = height;
        flags = surface;
        planeOffset = plane;
      }
    }
    offset = packetEnd;
  }
  return { flags, planeOffset, groundY, ceilingY, extraY };
}

/** PAL 0x208C50 uses one wrapped 100-unit cell; it does not search neighbours. */
export function nativeRaceCollisionCell(x: number, z: number): number {
  return (Math.trunc(f(f(x) / 100)) & 15) + ((Math.trunc(f(f(z) / 100)) & 15) << 4);
}

/** Retains original collision records, which the render-space triangle cache omits. */
export class NativeRaceCollisionSampler {
  private readonly bytes: Uint8Array;
  private readonly collisionOffset: number;
  private readonly chunks: ReturnType<typeof readCollisionChunkDirectory>['chunks'];

  constructor(fieldBytes: Uint8Array) {
    this.bytes = fieldBytes;
    const header = readFieldHeader(fieldBytes);
    this.collisionOffset = header.collision.offset;
    this.chunks = readCollisionChunkDirectory(fieldBytes, header).chunks;
  }

  query(point: NativeRaceCollisionPoint): NativeRaceCollisionResult & { point: NativeRaceCollisionPoint } {
    const chunk = this.chunks[nativeRaceCollisionCell(point[0], point[2])]!;
    const result = queryNativeRaceCollisionChunk(this.bytes, this.collisionOffset + chunk.relativeOffset,
      chunk.declaredPacketCount, point);
    return { ...result, point: result.flags >= 0
      ? [f(point[0]), result.groundY, f(point[2]), result.extraY]
      : [f(point[0]), f(point[1]), f(point[2]), f(point[3])] };
  }
}
