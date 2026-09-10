import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { serializeCompiledField, type CompiledFieldBatch, type CompiledFieldMesh } from "../../formats/fieldGeometry";
import { RaceCourseModel } from "./courseModel";
import { RaceEntrantLayer, applyRaceCameraPose } from "./raceView";

function batch(billboard: boolean, x: number): CompiledFieldBatch {
  return {
    chunkIndex: 0,
    textureBasePointer: 0,
    textureIndex: 0,
    rgbaColorComponent: true,
    textureFunction: 0,
    hasTransparency: billboard,
    billboard,
    stableAtmosphere: false,
    nightOnly: false,
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0]),
    anchors: billboard ? new Float32Array([x, 0, 0, x, 0, 0, x, 0, 0]) : new Float32Array(),
    colors: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255]),
    warmColors: new Uint8Array(9),
    nightColors: new Uint8Array(9),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
  };
}

function compiledCourse(): CompiledFieldMesh {
  return {
    vertexCount: 6,
    triangleCount: 2,
    suppressedTriangleCount: 0,
    primitiveCount: 2,
    batches: [batch(false, 10), batch(true, 20)],
    textures: [{
      width: 1,
      height: 1,
      wrapS: 0,
      wrapT: 1,
      hasTransparency: false,
      rgba: new Uint8Array([255, 255, 255, 255]),
    }],
    roads: {
      triangleCount: 0,
      positions: new Float32Array(),
      kinds: new Uint8Array(),
      ribbonCount: 0,
      pavedRibbonCount: 0,
      dirtRibbonCount: 0,
      unresolvedVertexCount: 0,
    },
  };
}

describe("RaceCourseModel", () => {
  it("renders the compiled course cache without re-decoding course behavior", () => {
    const model = RaceCourseModel.fromBytes(0, serializeCompiledField(compiledCourse()));
    expect(model.name).toBe("COURSE/C00");
    expect(model.stats).toEqual({
      courseId: 0,
      triangleCount: 2,
      primitiveCount: 2,
      batchCount: 2,
      textureCount: 1,
    });
    expect(model.children).toHaveLength(2);
    expect(model.bounds?.min.x).toBe(10);
    expect(model.bounds?.max.x).toBe(21);

    const ordinary = model.children[0] as THREE.Mesh;
    const billboard = model.children[1] as THREE.Mesh;
    expect((ordinary.material as THREE.MeshBasicMaterial).map).toBeInstanceOf(THREE.DataTexture);
    expect(billboard.frustumCulled).toBe(false);
    expect((billboard.material as THREE.MeshBasicMaterial).customProgramCacheKey()).toBe(
      "rta-race-horizontal-billboard-v1",
    );
    model.dispose();
  });
});

describe("RaceEntrantLayer", () => {
  it("applies externally supplied poses without owning model disposal", () => {
    const layer = new RaceEntrantLayer();
    const player = new THREE.Group();
    const entrant = new THREE.Group();
    layer.setEntrants([
      { id: "player", object: player, pose: { position: [12, 3, 40], yaw: 0.5, pitch: 0.2, roll: -0.1 } },
      { id: "entrant-1", object: entrant, pose: { position: [8, 4, 9], yaw: -0.25 }, visible: false },
    ]);

    expect(player.position.toArray()).toEqual([12, 3, 40]);
    expect(player.rotation.order).toBe("YXZ");
    expect(player.rotation.x).toBeCloseTo(-0.2);
    expect(player.rotation.y).toBeCloseTo(0.5);
    expect(player.rotation.z).toBeCloseTo(-0.1);
    expect(entrant.visible).toBe(false);

    layer.updatePose("entrant-1", { position: [9, 5, 10], yaw: 1 });
    expect(entrant.position.toArray()).toEqual([9, 5, 10]);
    expect(entrant.rotation.y).toBeCloseTo(1);
    layer.clearEntrants();
    expect(player.parent).toBeNull();
    expect(entrant.parent).toBeNull();
  });

  it("rejects duplicate IDs before replacing the current presentation", () => {
    const layer = new RaceEntrantLayer();
    const retained = new THREE.Group();
    layer.setEntrants([{ id: "retained", object: retained, pose: { position: [0, 0, 0], yaw: 0 } }]);
    const replacement = new THREE.Group();
    expect(() => layer.setEntrants([
      { id: "duplicate", object: replacement, pose: { position: [1, 0, 0], yaw: 0 } },
      { id: "duplicate", object: new THREE.Group(), pose: { position: [2, 0, 0], yaw: 0 } },
    ])).toThrow(/Duplicate or empty race entrant ID/);
    expect(layer.entrant("retained")).toBe(retained);
    expect(retained.parent).toBe(layer);
  });
});

describe("applyRaceCameraPose", () => {
  it("pins a deterministic camera to an explicit course-space target", () => {
    const camera = new THREE.PerspectiveCamera(54, 4 / 3, 1, 20_000);
    applyRaceCameraPose(camera, { position: [10, 2, 3], target: [10, 2, -7] });
    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(camera.position.toArray()).toEqual([10, 2, 3]);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });
});
