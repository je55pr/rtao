import { deserializeCompiledCollision, type CompiledFieldCollision } from "../formats/fieldCollision";
import { deserializeCompiledField, type CompiledFieldBatch, type CompiledFieldMesh } from "../formats/fieldGeometry";
import type { CompiledRoadNetwork } from "../formats/fieldMinimap";
import { fieldExtent, normalizeRenderPosition } from "./worldTopology";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GroundSample {
  readonly y: number;
  readonly surfaceFlags: number;
}

export interface ResolvedFootprint extends GroundSample {
  readonly fieldNumber: number;
  readonly position: Vec3;
}

export type DrivingSurfaceKind = "paved-road" | "dry" | "dirt" | "wet" | "grass" | "snow" | "ice" | "other";

/**
 * HG2 stores three custom nibbles in the otherwise-unused upper half of each
 * collision GIF register word. The low nibble is the tyre-surface selector and
 * uses the PAL tyre-table order: Dry, Off-road, Wet, Grass, Snow, Ice.
 */
export function nativeDrivingSurfaceFromCollisionFlags(surfaceFlags: number): Exclude<DrivingSurfaceKind, "paved-road" | "other"> | undefined {
  const nativeSurface = surfaceFlags & 0xf;
  return (["dry", "dirt", "wet", "grass", "snow", "ice"] as const)[nativeSurface];
}

const chunkSize = 100;
const gridSize = 16;

export class FieldCollisionSampler {
  private readonly triangleIndicesByChunk = new Map<number, number[]>();

  constructor(readonly collision: CompiledFieldCollision) {
    for (let triangleIndex = 0; triangleIndex < collision.triangleCount; triangleIndex += 1) {
      this.register(triangleIndex);
    }
  }

  sampleClosest(x: number, z: number, referenceY: number): GroundSample | undefined {
    const chunkX = clampChunk(Math.floor(x / chunkSize));
    const chunkZ = clampChunk(Math.floor(z / chunkSize));
    let best: GroundSample | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const triangles = this.triangleIndicesByChunk.get(chunkKey(chunkX + dx, chunkZ + dz));
        if (!triangles) continue;
        for (const triangleIndex of triangles) {
          const y = this.sampleTriangleY(triangleIndex, x, z);
          if (y === undefined) continue;
          const distance = Math.abs(y - referenceY);
          if (!best || distance < bestDistance) {
            bestDistance = distance;
            best = { y, surfaceFlags: this.collision.surfaceFlags[triangleIndex] ?? 0 };
          }
        }
      }
    }
    return best;
  }

  sampleHighest(x: number, z: number): GroundSample | undefined {
    const chunkX = clampChunk(Math.floor(x / chunkSize));
    const chunkZ = clampChunk(Math.floor(z / chunkSize));
    let best: GroundSample | undefined;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const triangles = this.triangleIndicesByChunk.get(chunkKey(chunkX + dx, chunkZ + dz));
        if (!triangles) continue;
        for (const triangleIndex of triangles) {
          const y = this.sampleTriangleY(triangleIndex, x, z);
          if (y !== undefined && (!best || y > best.y)) best = { y, surfaceFlags: this.collision.surfaceFlags[triangleIndex] ?? 0 };
        }
      }
    }
    return best;
  }

  private register(triangleIndex: number): void {
    const offset = triangleIndex * 9;
    const positions = this.collision.positions;
    const ax = positions[offset] ?? 0, az = positions[offset + 2] ?? 0;
    const bx = positions[offset + 3] ?? 0, bz = positions[offset + 5] ?? 0;
    const cx = positions[offset + 6] ?? 0, cz = positions[offset + 8] ?? 0;
    const minX = clampChunk(Math.floor(Math.min(ax, bx, cx) / chunkSize));
    const maxX = clampChunk(Math.floor(Math.max(ax, bx, cx) / chunkSize));
    const minZ = clampChunk(Math.floor(Math.min(az, bz, cz) / chunkSize));
    const maxZ = clampChunk(Math.floor(Math.max(az, bz, cz) / chunkSize));
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const key = chunkKey(x, z);
        const list = this.triangleIndicesByChunk.get(key) ?? [];
        list.push(triangleIndex);
        this.triangleIndicesByChunk.set(key, list);
      }
    }
  }

  private sampleTriangleY(triangleIndex: number, x: number, z: number): number | undefined {
    const offset = triangleIndex * 9;
    const p = this.collision.positions;
    const ax = p[offset] ?? 0, ay = p[offset + 1] ?? 0, az = p[offset + 2] ?? 0;
    const bx = p[offset + 3] ?? 0, by = p[offset + 4] ?? 0, bz = p[offset + 5] ?? 0;
    const cx = p[offset + 6] ?? 0, cy = p[offset + 7] ?? 0, cz = p[offset + 8] ?? 0;
    const v0x = bx - ax, v0z = bz - az;
    const v1x = cx - ax, v1z = cz - az;
    const v2x = x - ax, v2z = z - az;
    const determinant = v0x * v1z - v1x * v0z;
    if (Math.abs(determinant) < 0.00001) return undefined;
    const u = (v2x * v1z - v1x * v2z) / determinant;
    const v = (v0x * v2z - v2x * v0z) / determinant;
    const epsilon = 0.002;
    if (u < -epsilon || v < -epsilon || u + v > 1 + epsilon) return undefined;
    const y = ay + u * (by - ay) + v * (cy - ay);
    return Number.isFinite(y) ? y : undefined;
  }
}

export class DrivingWorld {
  private readonly fields = new Map<number, FieldCollisionSampler>();
  private readonly surfaces = new Map<number, FieldDrivingSurfaceSampler>();

  addField(fieldNumber: number, bytes: Uint8Array): void {
    this.fields.set(fieldNumber, new FieldCollisionSampler(deserializeCompiledCollision(bytes)));
  }

  addCompiledField(fieldNumber: number, collision: CompiledFieldCollision): void {
    this.fields.set(fieldNumber, new FieldCollisionSampler(collision));
  }

  addFieldSurface(fieldNumber: number, bytes: Uint8Array): CompiledRoadNetwork {
    const mesh = deserializeCompiledField(bytes);
    this.surfaces.set(fieldNumber, new FieldDrivingSurfaceSampler(mesh));
    return mesh.roads;
  }

  addCompiledFieldSurface(fieldNumber: number, mesh: CompiledFieldMesh): void {
    this.surfaces.set(fieldNumber, new FieldDrivingSurfaceSampler(mesh));
  }

  get fieldCount(): number {
    return this.fields.size;
  }

  sampleGround(originFieldNumber: number, position: Vec3, referenceY: number): (GroundSample & { fieldNumber: number; localPosition: Vec3 }) | undefined {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: position.x, y: position.z });
    const sampler = this.fields.get(normalized.fieldNumber);
    const sample = sampler?.sampleClosest(normalized.localPosition.x, normalized.localPosition.y, referenceY);
    if (!sample) return undefined;
    return {
      ...sample,
      fieldNumber: normalized.fieldNumber,
      localPosition: { x: normalized.localPosition.x, y: sample.y, z: normalized.localPosition.y },
    };
  }

  sampleHighest(originFieldNumber: number, position: Vec3): GroundSample | undefined {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: position.x, y: position.z });
    return this.fields.get(normalized.fieldNumber)?.sampleHighest(normalized.localPosition.x, normalized.localPosition.y);
  }

  drivingSurface(originFieldNumber: number, position: Vec3, referenceY = position.y): DrivingSurfaceKind {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: position.x, y: position.z });
    const surfaceFlags = this.fields.get(normalized.fieldNumber)?.sampleClosest(normalized.localPosition.x, normalized.localPosition.y, referenceY)?.surfaceFlags;
    return this.surfaces.get(normalized.fieldNumber)?.kindAt(normalized.localPosition.x, normalized.localPosition.y, referenceY, surfaceFlags) ?? "paved-road";
  }

  resolveFootprint(originFieldNumber: number, candidate: Vec3, yaw: number, referenceY: number): ResolvedFootprint | undefined {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: candidate.x, y: candidate.z });
    const localCandidate = { x: normalized.localPosition.x, y: candidate.y, z: normalized.localPosition.y };
    const contacts: ReadonlyArray<readonly [number, number]> = [
      [-0.66, 0.68], [0.66, 0.68], [-0.66, -0.66], [0.66, -0.66],
    ];
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    let height = 0;
    for (const [localX, localZ] of contacts) {
      const point = {
        x: localCandidate.x + localX * cosine + localZ * sine,
        y: localCandidate.y,
        z: localCandidate.z - localX * sine + localZ * cosine,
      };
      const sample = this.sampleGround(normalized.fieldNumber, point, referenceY);
      if (!sample) return undefined;
      height += sample.y;
    }
    const centre = this.sampleGround(normalized.fieldNumber, localCandidate, referenceY);
    return {
      fieldNumber: normalized.fieldNumber,
      position: { x: localCandidate.x, y: height / contacts.length, z: localCandidate.z },
      y: height / contacts.length,
      surfaceFlags: centre?.surfaceFlags ?? 0,
    };
  }
}

class FieldDrivingSurfaceSampler {
  private readonly batchesByChunk = new Map<number, CompiledFieldBatch[]>();

  constructor(private readonly mesh: CompiledFieldMesh) {
    for (const batch of mesh.batches) {
      if (batch.billboard || batch.chunkIndex < 0 || batch.chunkIndex >= 64) continue;
      const sourceX = batch.chunkIndex % 8, z = Math.floor(batch.chunkIndex / 8);
      const key = 7 - sourceX + z * 8;
      const list = this.batchesByChunk.get(key) ?? [];
      list.push(batch);
      this.batchesByChunk.set(key, list);
    }
  }

  kindAt(x: number, z: number, referenceY: number, surfaceFlags?: number): DrivingSurfaceKind {
    const roadKind = this.roadKindAt(x, z);
    if (roadKind) return roadKind;
    if (surfaceFlags !== undefined) {
      const nativeSurface = nativeDrivingSurfaceFromCollisionFlags(surfaceFlags);
      if (nativeSurface) return nativeSurface;
    }
    const textureBasePointer = this.closestTextureAt(x, z, referenceY);
    if (textureBasePointer === 14515) return "grass";
    if (textureBasePointer === 14634) return "dirt";
    return "other";
  }

  private roadKindAt(x: number, z: number): DrivingSurfaceKind | undefined {
    const positions = this.mesh.roads.positions;
    for (let triangle = 0; triangle < this.mesh.roads.triangleCount; triangle += 1) {
      const offset = triangle * 6;
      if (containsTriangle2d(
        positions[offset] ?? 0, positions[offset + 1] ?? 0,
        positions[offset + 2] ?? 0, positions[offset + 3] ?? 0,
        positions[offset + 4] ?? 0, positions[offset + 5] ?? 0,
        x, z,
      )) return (this.mesh.roads.kinds[triangle] ?? 0) === 1 ? "dirt" : "paved-road";
    }
    return undefined;
  }

  private closestTextureAt(x: number, z: number, referenceY: number): number | undefined {
    const chunkX = Math.max(0, Math.min(7, Math.floor(x / 200))), chunkZ = Math.max(0, Math.min(7, Math.floor(z / 200)));
    let bestTexture: number | undefined, bestDistance = Number.POSITIVE_INFINITY;
    for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
      for (const batch of this.batchesByChunk.get(chunkX + dx + (chunkZ + dz) * 8) ?? []) {
        const positions = batch.positions;
        for (let offset = 0; offset + 8 < positions.length; offset += 9) {
          const y = sampleExpandedTriangleY(positions, offset, x, z);
          if (y === undefined) continue;
          const distance = Math.abs(y - referenceY);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestTexture = batch.textureBasePointer;
          }
        }
      }
    }
    return bestTexture;
  }
}

function sampleExpandedTriangleY(p: Float32Array, offset: number, x: number, z: number): number | undefined {
  const ax = p[offset] ?? 0, ay = p[offset + 1] ?? 0, az = p[offset + 2] ?? 0;
  const bx = p[offset + 3] ?? 0, by = p[offset + 4] ?? 0, bz = p[offset + 5] ?? 0;
  const cx = p[offset + 6] ?? 0, cy = p[offset + 7] ?? 0, cz = p[offset + 8] ?? 0;
  const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = x - ax, v2z = z - az;
  const determinant = v0x * v1z - v1x * v0z;
  if (Math.abs(determinant) < 0.00001) return undefined;
  const u = (v2x * v1z - v1x * v2z) / determinant, v = (v0x * v2z - v2x * v0z) / determinant;
  if (u < -0.002 || v < -0.002 || u + v > 1.002) return undefined;
  const y = ay + u * (by - ay) + v * (cy - ay);
  return Number.isFinite(y) ? y : undefined;
}

function containsTriangle2d(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, x: number, z: number): boolean {
  const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = x - ax, v2z = z - az;
  const determinant = v0x * v1z - v1x * v0z;
  if (Math.abs(determinant) < 0.00001) return false;
  const u = (v2x * v1z - v1x * v2z) / determinant, v = (v0x * v2z - v2x * v0z) / determinant;
  return u >= -0.01 && v >= -0.01 && u + v <= 1.01;
}

function chunkKey(x: number, z: number): number {
  return x + z * gridSize;
}

function clampChunk(value: number): number {
  return Math.max(0, Math.min(gridSize - 1, value));
}

export function flatFieldCollision(y = 0, surfaceFlags = 0): CompiledFieldCollision {
  return {
    triangleCount: 2,
    positions: new Float32Array([
      0, y, 0, fieldExtent, y, 0, 0, y, fieldExtent,
      fieldExtent, y, 0, fieldExtent, y, fieldExtent, 0, y, fieldExtent,
    ]),
    surfaceFlags: new Uint32Array([surfaceFlags, surfaceFlags]),
  };
}
