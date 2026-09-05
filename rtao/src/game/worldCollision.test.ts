import { describe, expect, it } from "vitest";
import { allWorldFieldNumbers, fieldNumberFromAddress } from "./worldTopology";
import { DrivingWorld, FieldCollisionSampler, flatFieldCollision, nativeDrivingSurfaceFromCollisionFlags } from "./worldCollision";
import type { CompiledFieldMesh } from "../formats/fieldGeometry";

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

  it("classifies field materials and lets authored road ribbons override them", () => {
    const world = new DrivingWorld();
    const grass = surfaceMesh(14515);
    world.addCompiledFieldSurface(223, grass);
    expect(world.drivingSurface(223, { x: 800, y: 0, z: 800 })).toBe("grass");
    world.addCompiledFieldSurface(223, surfaceMesh(14515, 1));
    expect(world.drivingSurface(223, { x: 800, y: 0, z: 800 })).toBe("dirt");
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

  it("uses native collision surfaces while retaining road-ribbon priority", () => {
    const world = new DrivingWorld();
    world.addCompiledField(203, flatFieldCollision(0, 0x444));
    world.addCompiledFieldSurface(203, surfaceMesh(14535));
    expect(world.drivingSurface(203, { x: 800, y: 0, z: 800 })).toBe("snow");
    world.addCompiledFieldSurface(203, surfaceMesh(14535, 0));
    expect(world.drivingSurface(203, { x: 800, y: 0, z: 800 })).toBe("paved-road");
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
