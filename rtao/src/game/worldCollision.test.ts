import { describe, expect, it } from "vitest";
import { allWorldFieldNumbers, fieldNumberFromAddress } from "./worldTopology";
import { DrivingWorld, FieldCollisionSampler, flatFieldCollision, nativeDrivingSurfaceFromCollisionFlags } from "./worldCollision";
import type { CompiledFieldCollision } from "../formats/fieldCollision";
import type { CompiledFieldMesh } from "../formats/fieldGeometry";
import { nativeRaceIdentity, type NativeRaceVector } from "./nativeRaceMath";

describe("world collision", () => {
  it("samples a reflected field surface", () => {
    const sampler = new FieldCollisionSampler(flatFieldCollision(12, 0x42));
    expect(sampler.sampleClosest(800, 800, 10)).toEqual({ y: 12, surfaceFlags: 0x42 });
    expect(sampler.sampleClosest(-10, 800, 10)).toBeUndefined();
  });

  it("resolves a four-wheel footprint across the Z torus seam", () => {
    const world = new DrivingWorld();
    for (const fieldNumber of allWorldFieldNumbers()) world.addCompiledField(fieldNumber, flatFieldCollision(7, fieldNumber));
    const top = fieldNumberFromAddress(5, 0);
    const resolved = world.resolveFootprint(top, { x: 960, y: 7, z: -0.2 }, 0, 7);
    expect(resolved).toBeDefined();
    expect(resolved?.position.z).toBeCloseTo(1599.8);
    expect(resolved?.y).toBe(7);
  });

  it("keeps PAL auxiliary surfaces out of selected ground while retaining auxiliary contact", () => {
    const world = new DrivingWorld();
    const collision = auxiliaryBarrierCollision(0, 0.8);
    world.addCompiledField(223, collision);
    const sampler = new FieldCollisionSampler(collision);
    expect(sampler.sampleClosest(800, 800, 0)).toEqual({ y: 0, surfaceFlags: 0 });
    expect(sampler.sampleAuxiliaryHeight(800, 800)).toBeCloseTo(0.8, 6);
    const resolved = world.resolveFootprint(223, { x: 800, y: 0, z: 800 }, 0, 0);
    expect(resolved).toMatchObject({ y: 0, surfaceFlags: 0, hasGroundSupport: true });
    expect(resolved?.auxiliaryY).toBeCloseTo(0.8, 6);
    expect(world.drivingSurface(223, { x: 800, y: 0, z: 800 })).toBe("dry");
  });

  it("retains auxiliary-only contact without inventing ordinary ground support", () => {
    const world = new DrivingWorld();
    world.addCompiledField(223, auxiliaryOnlyCollision(0.8));
    const resolved = world.resolveFootprint(223, { x: 800, y: 0, z: 800 }, 0, 0);
    expect(resolved).toMatchObject({ y: 0, surfaceFlags: 0, hasGroundSupport: false });
    expect(resolved?.auxiliaryY).toBeCloseTo(0.8, 6);
    expect(world.drivingSurface(223, { x: 800, y: 0, z: 800 })).toBe("other");
  });

  it("does not guess field surfaces from legacy texture pointers", () => {
    const world = new DrivingWorld();
    world.addCompiledField(223, flatFieldCollision(0, 0x111));
    world.addCompiledFieldSurface(223, surfaceMesh(14515));
    expect(world.drivingSurface(223, { x: 800, y: 0, z: 800 })).toBe("dirt");

    world.addCompiledField(220, flatFieldCollision(0, 0x006));
    world.addCompiledFieldSurface(220, surfaceMesh(14515));
    expect(world.drivingSurface(220, { x: 800, y: 0, z: 800 })).toBe("other");
  });

  it("decodes the collision low nibble in native tyre-table order", () => {
    expect(nativeDrivingSurfaceFromCollisionFlags(0x550)).toBe("dry");
    expect(nativeDrivingSurfaceFromCollisionFlags(0x111)).toBe("dirt");
    expect(nativeDrivingSurfaceFromCollisionFlags(0x002)).toBe("wet");
    expect(nativeDrivingSurfaceFromCollisionFlags(0x313)).toBe("grass");
    expect(nativeDrivingSurfaceFromCollisionFlags(0x444)).toBe("snow");
    expect(nativeDrivingSurfaceFromCollisionFlags(0x455)).toBe("ice");
    expect(nativeDrivingSurfaceFromCollisionFlags(0x006)).toBeUndefined();
  });

  it("applies authored road precedence before the native collision selector", () => {
    const world = new DrivingWorld();
    world.addCompiledField(203, flatFieldCollision(0, 0x444));
    world.addCompiledFieldSurface(203, surfaceMesh(14535));
    expect(world.drivingSurface(203, { x: 800, y: 0, z: 800 })).toBe("snow");
    world.addCompiledFieldSurface(203, surfaceMesh(14535, 0));
    expect(world.drivingSurface(203, { x: 800, y: 0, z: 800 })).toBe("paved-road");
    world.addCompiledFieldSurface(203, surfaceMesh(14535, 1));
    expect(world.drivingSurface(203, { x: 800, y: 0, z: 800 })).toBe("dirt");
  });

  it("uses collision selectors even when no render-surface cache is loaded", () => {
    const world = new DrivingWorld();
    world.addCompiledField(113, flatFieldCollision(0, 0x00000455));
    expect(world.drivingSurface(113, { x: 800, y: 0, z: 800 })).toBe("ice");
    expect(world.drivingSurface(203, { x: 800, y: 0, z: 800 })).toBe("other");
  });

  it("resolves auxiliary front contact through ordinary field seams", () => {
    const world = new DrivingWorld();
    const origin = fieldNumberFromAddress(5, 0);
    const acrossNorthSeam = fieldNumberFromAddress(4, 7);
    world.addCompiledField(origin, flatFieldCollision(0, 0));
    world.addCompiledField(acrossNorthSeam, auxiliaryBarrierCollision(0, 0.4));
    const resolved = world.resolveFootprint(origin, { x: 960, y: 0, z: 0.2 }, Math.PI, 0);
    expect(resolved?.auxiliaryY).toBeCloseTo(0.4, 6);
  });

  it("resolves native surfaces through ordinary field seams", () => {
    const world = new DrivingWorld();
    const origin = fieldNumberFromAddress(5, 0);
    const acrossNorthSeam = fieldNumberFromAddress(4, 7);
    world.addCompiledField(origin, flatFieldCollision(0, 0x444));
    world.addCompiledField(acrossNorthSeam, flatFieldCollision(0, 0x455));
    world.addCompiledFieldSurface(origin, surfaceMesh(14535));
    world.addCompiledFieldSurface(acrossNorthSeam, surfaceMesh(14535));

    expect(world.drivingSurface(origin, { x: 960, y: 0, z: 0.2 })).toBe("snow");
    expect(world.drivingSurface(origin, { x: 960, y: 0, z: -0.2 })).toBe("ice");
  });

  it("adds only enabled slot-11 runtime obstacle groups to the authored outdoor mask", () => {
    const world = new DrivingWorld();
    const left: NativeRaceVector = [-0.5, 0, 0.5, 0];
    const right: NativeRaceVector = [0.5, 0, 0.5, 0];
    const position: NativeRaceVector = [0, 0, 0, 1];
    const data = { minimumX: -1, maximumX: 1 };
    world.setNativeOutdoorObstaclePoints(223, [left]);
    const groups = [
      { enabled: false, points: [left] },
      { enabled: true, points: [right] },
    ];
    world.setNativeOutdoorObstacleRuntime(223, 10, groups);
    expect(world.queryNativeObstacle(223, position, nativeRaceIdentity(), 1, data)).toBe(1);

    world.setNativeOutdoorObstacleRuntime(223, 11, groups);
    expect(world.queryNativeObstacle(223, position, nativeRaceIdentity(), 1, data)).toBe(3);

    world.setNativeOutdoorObstacleRuntime(223, 11, [
      { enabled: false, points: [left] },
      { enabled: false, points: [right] },
    ]);
    expect(world.queryNativeObstacle(223, position, nativeRaceIdentity(), 1, data)).toBe(1);

    world.setNativeOutdoorObstacleRuntime(223, 11,
      Array.from({ length: 27 }, (_, index) => ({ enabled: index === 26, points: [right] })));
    expect(world.queryNativeObstacle(223, position, nativeRaceIdentity(), 1, data)).toBe(1);
  });

  it("samples special-outdoor native collision without a texture or road guess", () => {
    const world = new DrivingWorld();
    world.addCompiledSpecialOutdoor(16, flatFieldCollision(50, 0x00002550));
    const point = { x: 800, y: 50, z: 800 };
    expect(world.sampleSpecialOutdoorGround(16, point, 50)).toEqual({ y: 50, surfaceFlags: 0x00002550 });
    expect(world.specialOutdoorDrivingSurface(16, point, 50)).toBe("dry");

    world.addCompiledSpecialOutdoorSurface(16, surfaceMesh(14515));
    expect(world.specialOutdoorDrivingSurface(16, point, 50)).toBe("dry");
  });
});

function surfaceMesh(textureBasePointer: number, roadKind?: number): CompiledFieldMesh {
  return {
    vertexCount: 6,
    triangleCount: 2,
    suppressedTriangleCount: 0,
    primitiveCount: 1,
    textures: [],
    batches: [{
      chunkIndex: 27,
      textureBasePointer,
      textureIndex: -1,
      rgbaColorComponent: false,
      textureFunction: -1,
      hasTransparency: false,
      billboard: false,
      stableAtmosphere: true,
      nightOnly: false,
      positions: new Float32Array([0, 0, 0, 1600, 0, 0, 0, 0, 1600, 1600, 0, 0, 1600, 0, 1600, 0, 0, 1600]),
      anchors: new Float32Array(),
      colors: new Uint8Array(18),
      warmColors: new Uint8Array(18),
      nightColors: new Uint8Array(18),
      uvs: new Float32Array(12),
    }],
    roads: roadKind === undefined ? {
      triangleCount: 0, positions: new Float32Array(), kinds: new Uint8Array(), ribbonCount: 0,
      pavedRibbonCount: 0, dirtRibbonCount: 0, unresolvedVertexCount: 0,
    } : {
      triangleCount: 2,
      positions: new Float32Array([700, 700, 900, 700, 700, 900, 900, 700, 900, 900, 700, 900]),
      kinds: new Uint8Array([roadKind, roadKind]),
      ribbonCount: 1,
      pavedRibbonCount: roadKind === 0 ? 1 : 0,
      dirtRibbonCount: roadKind === 1 ? 1 : 0,
      unresolvedVertexCount: 0,
    },
  };
}

function auxiliaryOnlyCollision(extraY: number): CompiledFieldCollision {
  return {
    triangleCount: 2,
    positions: new Float32Array([
      0, extraY, 0, 1600, extraY, 0, 0, extraY, 1600,
      1600, extraY, 0, 1600, extraY, 1600, 0, extraY, 1600,
    ]),
    surfaceFlags: new Uint32Array([0x1000_0000, 0x1000_0000]),
  };
}

function auxiliaryBarrierCollision(groundY: number, extraY: number): CompiledFieldCollision {
  return {
    triangleCount: 4,
    positions: new Float32Array([
      0, groundY, 0, 1600, groundY, 0, 0, groundY, 1600,
      1600, groundY, 0, 1600, groundY, 1600, 0, groundY, 1600,
      0, extraY, 0, 1600, extraY, 0, 0, extraY, 1600,
      1600, extraY, 0, 1600, extraY, 1600, 0, extraY, 1600,
    ]),
    surfaceFlags: new Uint32Array([0, 0, 0x1000_0000, 0x1000_0000]),
  };
}
