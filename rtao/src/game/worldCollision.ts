import { deserializeCompiledCollision, type CompiledFieldCollision } from "../formats/fieldCollision";
import { deserializeCompiledField, type CompiledFieldMesh } from "../formats/fieldGeometry";
import type { CompiledRoadNetwork } from "../formats/fieldMinimap";
import { fieldExtent, normalizeNativePosition, normalizeRenderPosition } from "./worldTopology";
import {
  NativeRaceCollisionSampler,
  type NativeRaceCollisionPoint,
} from "./nativeRaceCollision";
import {
  queryNativeRaceObstaclePoints,
  readNativeRaceObstaclePoints,
  type NativeRaceObstacleData,
} from "./nativeRaceObstacle";
import type { NativeRaceMatrix, NativeRaceVector } from "./nativeRaceMath";

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
  /** PAL 0x10000000 auxiliary-height channel, distinct from selected ground. */
  readonly auxiliaryY?: number;
  /** Browser bridge summary of ordinary wheel support; auxiliary contact can remain valid without it. */
  readonly hasGroundSupport: boolean;
}

export interface NativeOutdoorObstacleGroup {
  readonly enabled: boolean;
  readonly points: readonly NativeRaceVector[];
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
      const neighbourZ = chunkZ + dz;
      if (neighbourZ < 0 || neighbourZ >= gridSize) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbourX = chunkX + dx;
        if (neighbourX < 0 || neighbourX >= gridSize) continue;
        const triangles = this.triangleIndicesByChunk.get(chunkKey(neighbourX, neighbourZ));
        if (!triangles) continue;
        for (const triangleIndex of triangles) {
          const surfaceFlags = this.collision.surfaceFlags[triangleIndex] ?? 0;
          if ((surfaceFlags & 0x9000_0000) !== 0) continue;
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

  sampleAuxiliaryHeight(x: number, z: number): number | undefined {
    const chunkX = clampChunk(Math.floor(x / chunkSize));
    const chunkZ = clampChunk(Math.floor(z / chunkSize));
    const candidates = new Set<number>();
    for (let dz = -1; dz <= 1; dz += 1) {
      const neighbourZ = chunkZ + dz;
      if (neighbourZ < 0 || neighbourZ >= gridSize) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbourX = chunkX + dx;
        if (neighbourX < 0 || neighbourX >= gridSize) continue;
        for (const triangleIndex of this.triangleIndicesByChunk.get(chunkKey(neighbourX, neighbourZ)) ?? []) candidates.add(triangleIndex);
      }
    }
    let extraY: number | undefined;
    for (const triangleIndex of [...candidates].sort((a, b) => a - b)) {
      const surfaceFlags = this.collision.surfaceFlags[triangleIndex] ?? 0;
      if ((surfaceFlags & 0x1000_0000) === 0 || (surfaceFlags & 0x8000_0000) !== 0) continue;
      const y = this.sampleTriangleY(triangleIndex, x, z);
      if (y !== undefined) extraY = y;
    }
    return extraY;
  }

  sampleHighest(x: number, z: number): GroundSample | undefined {
    const chunkX = clampChunk(Math.floor(x / chunkSize));
    const chunkZ = clampChunk(Math.floor(z / chunkSize));
    let best: GroundSample | undefined;
    for (let dz = -1; dz <= 1; dz += 1) {
      const neighbourZ = chunkZ + dz;
      if (neighbourZ < 0 || neighbourZ >= gridSize) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbourX = chunkX + dx;
        if (neighbourX < 0 || neighbourX >= gridSize) continue;
        const triangles = this.triangleIndicesByChunk.get(chunkKey(neighbourX, neighbourZ));
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
  private readonly nativeFields = new Map<number, NativeRaceCollisionSampler>();
  private readonly nativeObstaclePoints = new Map<number, readonly NativeRaceVector[]>();
  private readonly nativeObstacleRuntime = new Map<number, { readonly slotValue: number; readonly groups: readonly NativeOutdoorObstacleGroup[] }>();
  private readonly surfaces = new Map<number, FieldDrivingSurfaceSampler>();
  private readonly specialOutdoorScenes = new Map<number, FieldCollisionSampler>();
  private readonly specialOutdoorSurfaces = new Map<number, FieldDrivingSurfaceSampler>();

  addField(fieldNumber: number, bytes: Uint8Array): void {
    this.fields.set(fieldNumber, new FieldCollisionSampler(deserializeCompiledCollision(bytes)));
  }

  /** Retains authored PAL packet/plane collision and base obstacle records for native outdoor contact. */
  addNativeField(fieldNumber: number, fieldBytes: Uint8Array): void {
    this.nativeFields.set(fieldNumber, new NativeRaceCollisionSampler(fieldBytes));
    this.nativeObstaclePoints.set(fieldNumber, readNativeRaceObstaclePoints(fieldBytes));
  }

  setNativeOutdoorObstaclePoints(fieldNumber: number, points: readonly NativeRaceVector[]): void {
    this.nativeObstaclePoints.set(fieldNumber, points);
  }

  setNativeOutdoorObstacleRuntime(
    fieldNumber: number,
    slotValue: number,
    groups: readonly NativeOutdoorObstacleGroup[],
  ): void {
    this.nativeObstacleRuntime.set(fieldNumber, { slotValue, groups: groups.slice(0, 26) });
  }

  hasNativeField(fieldNumber: number): boolean {
    return this.nativeFields.has(fieldNumber);
  }

  queryNativeContact(
    originFieldNumber: number,
    point: NativeRaceCollisionPoint,
  ): { readonly point: NativeRaceCollisionPoint; readonly flags: number; readonly ceilingY: number } {
    const normalized = normalizeNativePosition(originFieldNumber, { x: point[0], y: point[2] });
    if (!normalized) return { point, flags: -1, ceilingY: 10000 };
    const sampler = this.nativeFields.get(normalized.fieldNumber);
    if (!sampler) return { point, flags: -1, ceilingY: 10000 };
    const localPoint: NativeRaceCollisionPoint = [
      Math.fround(normalized.localPosition.x),
      Math.fround(point[1]),
      Math.fround(normalized.localPosition.y),
      Math.fround(point[3]),
    ];
    const hit = sampler.query(localPoint);
    return {
      point: hit.flags >= 0
        ? [Math.fround(point[0]), hit.point[1], Math.fround(point[2]), hit.point[3]]
        : point,
      flags: hit.flags,
      ceilingY: hit.ceilingY,
    };
  }

  queryNativeObstacle(
    fieldNumber: number,
    position: NativeRaceVector,
    inverseYaw: NativeRaceMatrix,
    height: number,
    data: NativeRaceObstacleData,
  ): number {
    let flags = queryNativeRaceObstaclePoints(
      this.nativeObstaclePoints.get(fieldNumber) ?? [],
      position,
      inverseYaw,
      height,
      data,
    );
    const runtime = this.nativeObstacleRuntime.get(fieldNumber);
    if (runtime?.slotValue === 11) {
      for (const group of runtime.groups) {
        if (group.enabled) flags |= queryNativeRaceObstaclePoints(group.points, position, inverseYaw, height, data);
      }
    }
    return flags;
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

  addCompiledSpecialOutdoor(areaCode: number, collision: CompiledFieldCollision): void {
    this.specialOutdoorScenes.set(areaCode, new FieldCollisionSampler(collision));
  }

  addCompiledSpecialOutdoorSurface(areaCode: number, mesh: CompiledFieldMesh): void {
    this.specialOutdoorSurfaces.set(areaCode, new FieldDrivingSurfaceSampler(mesh));
  }

  sampleSpecialOutdoorGround(areaCode: number, position: Vec3, referenceY: number): GroundSample | undefined {
    return this.specialOutdoorScenes.get(areaCode)?.sampleClosest(position.x, position.z, referenceY);
  }

  sampleSpecialOutdoorHighest(areaCode: number, position: Vec3): GroundSample | undefined {
    return this.specialOutdoorScenes.get(areaCode)?.sampleHighest(position.x, position.z);
  }

  specialOutdoorDrivingSurface(areaCode: number, position: Vec3, referenceY = position.y): DrivingSurfaceKind {
    const collision = this.specialOutdoorScenes.get(areaCode)?.sampleClosest(position.x, position.z, referenceY);
    const surfaceSampler = this.specialOutdoorSurfaces.get(areaCode);
    if (surfaceSampler) return surfaceSampler.kindAt(position.x, position.z, collision?.surfaceFlags);
    if (!collision) return "other";
    return nativeDrivingSurfaceFromCollisionFlags(collision.surfaceFlags) ?? "other";
  }

  resolveSpecialOutdoorFootprint(
    areaCode: number,
    candidate: Vec3,
    yaw: number,
    referenceY: number,
  ): Omit<ResolvedFootprint, "fieldNumber"> | undefined {
    const sampler = this.specialOutdoorScenes.get(areaCode);
    if (!sampler) return undefined;
    const contacts: ReadonlyArray<readonly [number, number]> = [
      [-0.66, 0.68], [0.66, 0.68], [-0.66, -0.66], [0.66, -0.66],
    ];
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    const support: GroundSample[] = [];
    for (const [localX, localZ] of contacts) {
      const sample = sampler.sampleClosest(
        candidate.x + localX * cosine + localZ * sine,
        candidate.z - localX * sine + localZ * cosine,
        referenceY,
      );
      if (sample) support.push(sample);
    }
    const frontCentreX = candidate.x + 0.68 * sine;
    const frontCentreZ = candidate.z + 0.68 * cosine;
    const auxiliaryY = sampler.sampleAuxiliaryHeight(frontCentreX, frontCentreZ);
    if (support.length !== contacts.length && auxiliaryY === undefined) return undefined;
    const centre = sampler.sampleClosest(candidate.x, candidate.z, referenceY);
    const y = support.length ? support.reduce((sum, sample) => sum + sample.y, 0) / support.length : referenceY;
    return {
      position: { x: candidate.x, y, z: candidate.z },
      y,
      surfaceFlags: centre?.surfaceFlags ?? support[0]?.surfaceFlags ?? 0,
      hasGroundSupport: support.length > 0,
      ...(auxiliaryY === undefined ? {} : { auxiliaryY }),
    };
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

  sampleAuxiliaryHeight(originFieldNumber: number, position: Vec3): number | undefined {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: position.x, y: position.z });
    return this.fields.get(normalized.fieldNumber)?.sampleAuxiliaryHeight(normalized.localPosition.x, normalized.localPosition.y);
  }

  drivingSurface(originFieldNumber: number, position: Vec3, referenceY = position.y): DrivingSurfaceKind {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: position.x, y: position.z });
    const collision = this.fields.get(normalized.fieldNumber)?.sampleClosest(normalized.localPosition.x, normalized.localPosition.y, referenceY);
    const surfaceSampler = this.surfaces.get(normalized.fieldNumber);
    if (surfaceSampler) return surfaceSampler.kindAt(normalized.localPosition.x, normalized.localPosition.y, collision?.surfaceFlags);
    if (!collision) return "other";
    return nativeDrivingSurfaceFromCollisionFlags(collision.surfaceFlags) ?? "other";
  }

  resolveFootprint(originFieldNumber: number, candidate: Vec3, yaw: number, referenceY: number): ResolvedFootprint | undefined {
    const normalized = normalizeRenderPosition(originFieldNumber, { x: candidate.x, y: candidate.z });
    const localCandidate = { x: normalized.localPosition.x, y: candidate.y, z: normalized.localPosition.y };
    const contacts: ReadonlyArray<readonly [number, number]> = [
      [-0.66, 0.68], [0.66, 0.68], [-0.66, -0.66], [0.66, -0.66],
    ];
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    const support: Array<GroundSample & { fieldNumber: number; localPosition: Vec3 }> = [];
    for (const [localX, localZ] of contacts) {
      const point = {
        x: localCandidate.x + localX * cosine + localZ * sine,
        y: localCandidate.y,
        z: localCandidate.z - localX * sine + localZ * cosine,
      };
      const sample = this.sampleGround(normalized.fieldNumber, point, referenceY);
      if (sample) support.push(sample);
    }
    const frontCentre = {
      x: localCandidate.x + 0.68 * sine,
      y: localCandidate.y,
      z: localCandidate.z + 0.68 * cosine,
    };
    const auxiliaryY = this.sampleAuxiliaryHeight(normalized.fieldNumber, frontCentre);
    if (support.length !== contacts.length && auxiliaryY === undefined) return undefined;
    const centre = this.sampleGround(normalized.fieldNumber, localCandidate, referenceY);
    const y = support.length ? support.reduce((sum, sample) => sum + sample.y, 0) / support.length : referenceY;
    return {
      fieldNumber: normalized.fieldNumber,
      position: { x: localCandidate.x, y, z: localCandidate.z },
      y,
      surfaceFlags: centre?.surfaceFlags ?? support[0]?.surfaceFlags ?? 0,
      hasGroundSupport: support.length > 0,
      ...(auxiliaryY === undefined ? {} : { auxiliaryY }),
    };
  }
}

class FieldDrivingSurfaceSampler {
  constructor(private readonly mesh: CompiledFieldMesh) {}

  kindAt(x: number, z: number, surfaceFlags?: number): DrivingSurfaceKind {
    const roadKind = this.roadKindAt(x, z);
    if (roadKind) return roadKind;
    if (surfaceFlags === undefined) return "other";
    return nativeDrivingSurfaceFromCollisionFlags(surfaceFlags) ?? "other";
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
}

function containsTriangle2d(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, x: number, z: number): boolean {
  const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = x - ax, v2z = z - az;
  const determinant = v0x * v1z - v1x * v0z;
  if (Math.abs(determinant) < 0.00001) return false;
  const u = (v2x * v1z - v1x * v2z) / determinant, v = (v0x * v2z - v2x * v0z) / determinant;
  return u >= -0.01 && v >= -0.01 && u + v <= 1.01;
}

/**
 * Flat grid key. Only injective while both axes are inside the grid: an
 * unclamped `x - 1` at column 0 aliases the last column of the previous row, so
 * every caller must range-check the neighbour before looking it up.
 */
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
