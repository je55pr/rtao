import * as THREE from "three";
import { deserializeCompiledField, type CompiledFieldMesh } from "../../formats/fieldGeometry";

export interface RaceCoursePresentationStats {
  readonly courseId: number;
  readonly triangleCount: number;
  readonly primitiveCount: number;
  readonly batchCount: number;
  readonly textureCount: number;
}

/**
 * Presentation-only wrapper around the already compiled HG2 course geometry.
 * It deliberately owns no collision, lap, navigation, or race-state behavior.
 */
export class RaceCourseModel extends THREE.Group {
  readonly stats: RaceCoursePresentationStats;
  private readonly ownedTextures: THREE.Texture[] = [];

  constructor(courseId: number, compiled: CompiledFieldMesh) {
    super();
    if (!Number.isInteger(courseId) || courseId < 0 || courseId > 14) {
      throw new RangeError(`Ordinary race course ID ${courseId} lies outside C00..C14.`);
    }
    this.name = `COURSE/C${courseId.toString().padStart(2, "0")}`;
    const textures = compiled.textures.map((source) => this.createTexture(source));
    const bounds = new THREE.Box3();
    compiled.batches.forEach((batch, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(batch.positions, 3));
      if (batch.billboard) geometry.setAttribute("anchor", new THREE.BufferAttribute(batch.anchors, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(batch.colors, 3, true));
      geometry.setAttribute("uv", new THREE.BufferAttribute(batch.uvs, 2));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (geometry.boundingBox) bounds.union(geometry.boundingBox);

      const material = new THREE.MeshBasicMaterial({
        map: batch.textureIndex >= 0 ? textures[batch.textureIndex] ?? null : null,
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true,
        transparent: batch.hasTransparency,
        alphaTest: batch.hasTransparency ? 1 / 255 : 0,
        depthWrite: true,
      });
      if (batch.billboard) configureHorizontalBillboard(material);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${this.name} batch ${index}`;
      mesh.renderOrder = batch.hasTransparency ? 2 : 1;
      mesh.userData.stableAtmosphere = batch.stableAtmosphere;
      mesh.userData.nightOnly = batch.nightOnly;
      if (batch.billboard) mesh.frustumCulled = false;
      this.add(mesh);
    });
    this.userData.bounds = bounds.isEmpty() ? undefined : bounds.clone();
    this.stats = {
      courseId,
      triangleCount: compiled.triangleCount,
      primitiveCount: compiled.primitiveCount,
      batchCount: compiled.batches.length,
      textureCount: compiled.textures.length,
    };
  }

  static fromBytes(courseId: number, bytes: Uint8Array): RaceCourseModel {
    return new RaceCourseModel(courseId, deserializeCompiledField(bytes));
  }

  get bounds(): THREE.Box3 | undefined {
    const bounds = this.userData.bounds as THREE.Box3 | undefined;
    return bounds?.clone();
  }

  dispose(): void {
    this.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedTextures.length = 0;
    this.removeFromParent();
  }

  private createTexture(source: CompiledFieldMesh["textures"][number]): THREE.DataTexture {
    const texture = new THREE.DataTexture(
      source.rgba,
      source.width,
      source.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = source.wrapS === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapT = source.wrapT === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.ownedTextures.push(texture);
    return texture;
  }
}

function configureHorizontalBillboard(material: THREE.MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "attribute vec3 anchor;\nvoid main() {")
      .replace(
        "#include <begin_vertex>",
        `vec3 toCamera = cameraPosition - anchor;
        toCamera.y = 0.0;
        float cameraDistance = max(length(toCamera), 0.0001);
        vec3 forward = toCamera / cameraDistance;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
        vec3 transformed = anchor + right * position.x
          + vec3(0.0, position.y, 0.0) + forward * position.z;`,
      );
  };
  material.customProgramCacheKey = () => "rta-race-horizontal-billboard-v1";
}
