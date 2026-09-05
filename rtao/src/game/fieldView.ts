import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { deserializeCompiledField } from "../formats/fieldGeometry";

export class FieldView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(54, 1, 1, 20_000);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private fieldGroup?: THREE.Group;
  private frameHandle = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x84b8d8, 1);
    this.renderer.domElement.className = "world-canvas";
    this.host.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x91c2dc);
    this.scene.fog = new THREE.Fog(0xa8cede, 950, 4400);
    this.camera.position.set(1180, 310, 1120);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(800, 28, 800);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 4200;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.update();

    const horizon = new THREE.Mesh(
      new THREE.CylinderGeometry(5200, 5200, 500, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xb9d9df, side: THREE.BackSide, fog: false }),
    );
    horizon.position.set(800, -220, 800);
    this.scene.add(horizon);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.frame();
  }

  loadCompiledField(bytes: Uint8Array): { triangles: number; primitives: number } {
    const compiled = deserializeCompiledField(bytes);
    this.disposeField();
    const textures = compiled.textures.map((source) => {
      const texture = new THREE.DataTexture(source.rgba, source.width, source.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = source.wrapS === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.wrapT = source.wrapT === 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    });
    const group = new THREE.Group();
    group.name = "FLD/223 Peach Town";
    const wholeBounds = new THREE.Box3();
    compiled.batches.forEach((batch, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(batch.positions, 3));
      if (batch.billboard) geometry.setAttribute("anchor", new THREE.BufferAttribute(batch.anchors, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(batch.colors, 3, true));
      geometry.setAttribute("uv", new THREE.BufferAttribute(batch.uvs, 2));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (geometry.boundingBox) wholeBounds.union(geometry.boundingBox);
      const material = new THREE.MeshBasicMaterial({
        map: batch.textureIndex >= 0 ? textures[batch.textureIndex] : null,
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true,
        transparent: batch.hasTransparency,
        alphaTest: batch.hasTransparency ? 1 / 255 : 0,
        depthWrite: true,
      });
      if (batch.billboard) {
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
              vec3 transformed = anchor + right * position.x + vec3(0.0, position.y, 0.0) + forward * position.z;`,
            );
        };
        material.customProgramCacheKey = () => "rta-horizontal-billboard-v1";
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Peach batch ${index}`;
      mesh.renderOrder = batch.hasTransparency ? 2 : 1;
      if (batch.billboard) mesh.frustumCulled = false;
      group.add(mesh);
    });
    group.userData.textures = textures;
    this.fieldGroup = group;
    this.scene.add(group);

    const bounds = wholeBounds.isEmpty() ? undefined : wholeBounds;
    if (bounds) {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      this.controls.target.copy(center);
      this.camera.position.set(center.x + size.x * 0.42, center.y + Math.max(180, size.y * 1.7), center.z + size.z * 0.42);
      this.controls.update();
    }
    return { triangles: compiled.triangleCount, primitives: compiled.primitiveCount };
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeField();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private disposeField(): void {
    if (!this.fieldGroup) return;
    this.fieldGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    const textures = this.fieldGroup.userData.textures as THREE.Texture[] | undefined;
    for (const texture of textures ?? []) texture.dispose();
    this.scene.remove(this.fieldGroup);
    this.fieldGroup = undefined;
  }

  private readonly frame = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
