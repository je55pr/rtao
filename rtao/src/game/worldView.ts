import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { deserializeCompiledField, type CompiledFieldBatch, type CompiledFieldMesh } from "../formats/fieldGeometry";
import type { FieldObjectAsset } from "../formats/fieldObjects";
import type { SkyTextureSet } from "../formats/skyTexture";
import type { CaptureSize, CarVisualCaptureScene, FieldOverviewCaptureScene, WorldOverviewCaptureScene } from "./captureScenes";
import { renderPng } from "./renderCapture";
import { fieldExtent, relativeRenderTranslation } from "./worldTopology";
import { authenticFieldVisibilityProfile, hg2TimeUnits, outdoorAtmosphere, type OutdoorVisibilityMode, visibilityProfile } from "./fieldLighting";

export interface WorldViewStats {
  readonly sectors: number;
  readonly triangles: number;
  readonly primitives: number;
}

interface SectorRenderResources {
  readonly group: THREE.Group;
  readonly textures: THREE.Texture[];
  readonly materials: THREE.Material[];
  readonly triangles: number;
  readonly primitives: number;
  dynamic?: SectorDynamicResources;
}

interface SectorDynamicResources {
  readonly geometries: THREE.BufferGeometry[];
  readonly material: THREE.Material;
  readonly texture: THREE.Texture | undefined;
  /** Objects animated each frame (host approximations — see the constants). */
  readonly animated: AnimatedDynamicObject[];
}

interface AnimatedDynamicObject {
  readonly object: THREE.Object3D;
  readonly motion: "rotor-spin" | "crown-sway";
  /** Deterministic per-instance offset so identical objects animate out of step. */
  readonly phaseSeed: number;
  readonly groupIndex: number;
}

/**
 * HOST APPROXIMATIONS for FLD dynamic-object animation. The Extra[1] geometry and
 * textures are evidence-backed, but the per-frame object matrix (spin, sway,
 * facing, scale) is composed by EE object-update code that is not yet decoded —
 * the same gap the C# reference notes for the palm-crown sway. These constants
 * are tuned to read like the original, not recovered from `SLES_513.56`.
 * See docs/archaeology/FIELD_DYNAMIC_OBJECTS_2026-09-06.md.
 */
const approximateRotorSpinRadiansPerSecond = 1.15;
const approximateRotorFacingYaw = 0;
const approximateRotorScale = 0.42;
/** Palm-crown sway, ported from the C# reference's PalmCrownMesh. */
const crownSway = { swayHz: 1.45, swayAmplitude: 0.045, crossHz: 1.07, crossAmplitude: 0.022, groupPhaseStep: 0.42 };

interface WorldActorRenderState {
  readonly object: THREE.Object3D;
  fieldNumber: number;
  position: { x: number; y: number; z: number };
  yaw: number;
}

export class WorldView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(54, 1, 1, 40_000);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly worldGroup = new THREE.Group();
  private readonly sectors = new Map<number, SectorRenderResources>();
  private readonly actors = new Map<string, WorldActorRenderState>();
  private readonly horizon: THREE.Mesh;
  private sky: THREE.Mesh | undefined;
  private nightSky: THREE.Mesh | undefined;
  private timeOfDayUnits = hg2TimeUnits(12);
  private visibilityMode: OutdoorVisibilityMode = "extended";
  private vehicle: THREE.Object3D | undefined;
  private readonly chaseTarget = new THREE.Vector3();
  private chaseReady = false;
  private originFieldNumber = 223;
  private frameHandle = 0;
  private readonly animatedDynamicObjects: AnimatedDynamicObject[] = [];
  private lastFrameTimestamp = 0;
  private animationSeconds = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x84b8d8, 1);
    this.renderer.domElement.className = "world-canvas";
    this.host.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x91c2dc);
    this.scene.fog = null;
    this.scene.add(this.worldGroup);
    this.camera.position.set(1180, 310, 1120);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(800, 28, 800);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 25_000;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.update();

    this.horizon = new THREE.Mesh(
      new THREE.CylinderGeometry(22_000, 22_000, 12_000, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xb9d9df, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false }),
    );
    this.horizon.position.set(800, -3000, 800);
    this.horizon.renderOrder = -10_002;
    this.scene.add(this.horizon);
    this.applyOutdoorState();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.frame();
  }

  startWorld(): void {
    this.disposeWorld();
    this.originFieldNumber = 223;
  }

  addCompiledField(fieldNumber: number, bytes: Uint8Array): WorldViewStats {
    return this.addCompiledFieldMesh(fieldNumber, deserializeCompiledField(bytes));
  }

  addCompiledFieldMesh(fieldNumber: number, compiled: CompiledFieldMesh): WorldViewStats {
    if (this.sectors.has(fieldNumber)) throw new Error(`FLD/${fieldNumber.toString().padStart(3, "0")} is already loaded.`);
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
    const materialMap = new Map<string, THREE.MeshBasicMaterial>();
    const group = new THREE.Group();
    group.name = `FLD/${fieldNumber.toString().padStart(3, "0")}`;

    compiled.batches.forEach((batch, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(batch.positions, 3));
      if (batch.billboard) geometry.setAttribute("anchor", new THREE.BufferAttribute(batch.anchors, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(batch.colors, 3, true));
      geometry.setAttribute("warmColor", new THREE.BufferAttribute(batch.warmColors, 3, true));
      geometry.setAttribute("nightColor", new THREE.BufferAttribute(batch.nightColors, 3, true));
      geometry.setAttribute("uv", new THREE.BufferAttribute(batch.uvs, 2));
      setBatchBounds(geometry, batch);

      const materialBaseKey = `${batch.textureIndex}|${batch.textureFunction}|${batch.rgbaColorComponent ? 1 : 0}|${batch.hasTransparency ? 1 : 0}|${batch.billboard ? 1 : 0}`;
      const approximateMaterialKey = `${materialBaseKey}|approx`;
      let approximateMaterial = materialMap.get(approximateMaterialKey);
      if (!approximateMaterial) {
        approximateMaterial = createFieldMaterial(batch, textures, "approximate");
        materialMap.set(approximateMaterialKey, approximateMaterial);
      }
      const approximateMesh = new THREE.Mesh(geometry, approximateMaterial);
      approximateMesh.name = `${group.name} batch ${index}`;
      approximateMesh.userData.rtaNightOnly = batch.nightOnly;
      approximateMesh.userData.rtaRenderPath = batch.billboard ? "all" : "approximate";
      // HG2's chunk-64 static layer contains facade/backing fills which sit
      // underneath local cutout/detail geometry. Keep that proven ordering while
      // still submitting every alpha-bearing batch after opaque geometry.
      approximateMesh.renderOrder = batch.hasTransparency ? 2 : (!batch.billboard && batch.chunkIndex === 64 ? 0 : 1);
      group.add(approximateMesh);

      // The real outdoor pass uses context-2 TEST with AFAIL=RGB_ONLY at AREF=127.
      // WebGL cannot disable depth writes conditionally per fragment, so Original
      // PS2 mode emulates that state with two adjacent draws over one geometry:
      // passing-alpha fragments establish colour+depth; failed-alpha fragments
      // blend RGB with depth writes disabled. Extended/Unlimited retain the fast
      // single-draw approximation above.
      if (!batch.billboard) {
        for (const pass of ["authentic-depth", "authentic-rgb"] as const) {
          const materialKey = `${materialBaseKey}|${pass}`;
          let material = materialMap.get(materialKey);
          if (!material) {
            material = createFieldMaterial(batch, textures, pass);
            materialMap.set(materialKey, material);
          }
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = `${group.name} batch ${index} ${pass}`;
          mesh.userData.rtaNightOnly = batch.nightOnly;
          mesh.userData.rtaRenderPath = pass;
          mesh.renderOrder = 1000 + index * 2 + (pass === "authentic-rgb" ? 1 : 0);
          group.add(mesh);
        }
      }
    });

    const offset = relativeRenderTranslation(this.originFieldNumber, fieldNumber);
    group.position.set(offset.x, 0, offset.y);
    this.worldGroup.add(group);
    this.sectors.set(fieldNumber, {
      group,
      textures,
      materials: [...materialMap.values()],
      triangles: compiled.triangleCount,
      primitives: compiled.primitiveCount,
    });
    this.applyOutdoorState();
    return this.stats();
  }

  finishWorld(): WorldViewStats {
    if (this.sectors.size === 0) throw new Error("The compiled world contains no sectors.");
    this.showWorldOverview();
    return this.stats();
  }

  /**
   * Attaches a field's Extra[1] dynamic-object instances — FLD/213's spinning
   * wind-turbine rotors, or FLD/220/221's swaying coastal palm crowns. Geometry,
   * texture and the MSCALF-4 format are evidence-backed; the animation, facing and
   * scale are host approximations (see the constants above).
   */
  addFieldDynamicObjects(fieldNumber: number, asset: FieldObjectAsset, anchors: readonly { x: number; y: number; z: number }[]): void {
    const sector = this.sectors.get(fieldNumber);
    if (!sector || sector.dynamic || asset.meshes.length === 0 || anchors.length === 0) return;
    if (asset.kind !== "turbine-rotor" && asset.kind !== "palm-crown") return;

    const geometries = asset.meshes.map((mesh) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
      geometry.computeBoundingSphere();
      return geometry;
    });

    let texture: THREE.Texture | undefined;
    if (asset.texture) {
      texture = new THREE.DataTexture(asset.texture.rgba, asset.texture.width, asset.texture.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }

    const material = createDynamicObjectMaterial(texture);
    const animated: AnimatedDynamicObject[] = [];

    anchors.forEach((anchor, instanceIndex) => {
      const mount = new THREE.Group();
      mount.position.set(anchor.x, anchor.y, anchor.z);
      // Deterministic per-instance phase from the C# palm-crown formula, reused
      // for the rotors so a wind farm does not spin in perfect lockstep.
      const phaseSeed = instanceIndex * 0.73 + anchor.x * 0.011 + anchor.z * 0.007;

      if (asset.kind === "turbine-rotor") {
        mount.rotation.y = approximateRotorFacingYaw;
        mount.scale.setScalar(approximateRotorScale);
        const rotor = new THREE.Group();
        for (const geometry of geometries) rotor.add(new THREE.Mesh(geometry, material));
        mount.add(rotor);
        animated.push({ object: rotor, motion: "rotor-spin", phaseSeed, groupIndex: 0 });
      } else {
        // Each authored frond group sways as a unit, trailing the previous group
        // by a small phase.
        geometries.forEach((geometry, groupIndex) => {
          const frondGroup = new THREE.Group();
          frondGroup.add(new THREE.Mesh(geometry, material));
          mount.add(frondGroup);
          animated.push({ object: frondGroup, motion: "crown-sway", phaseSeed, groupIndex });
        });
      }

      sector.group.add(mount);
    });

    this.animatedDynamicObjects.push(...animated);
    sector.dynamic = { geometries, material, texture, animated };
  }

  setSky(textures: SkyTextureSet): void {
    if (this.sky) {
      this.sky.geometry.dispose();
      disposeSkyMaterial(this.sky.material);
      this.sky.removeFromParent();
    }
    if (this.nightSky) {
      this.nightSky.geometry.dispose();
      disposeSkyMaterial(this.nightSky.material);
      this.nightSky.removeFromParent();
    }

    const dayTexture = new THREE.DataTexture(textures.day.rgba, textures.day.width, textures.day.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.wrapS = THREE.RepeatWrapping;
    dayTexture.wrapT = THREE.ClampToEdgeWrapping;
    dayTexture.magFilter = THREE.LinearFilter;
    dayTexture.minFilter = THREE.LinearFilter;
    dayTexture.generateMipmaps = false;
    dayTexture.needsUpdate = true;
    this.sky = new THREE.Mesh(
      buildSkyHemisphere(),
      new THREE.MeshBasicMaterial({ map: dayTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: false }),
    );
    this.sky.name = "SYS/SORA.GSL daytime sky";
    this.sky.renderOrder = -10_000;
    this.scene.add(this.sky);

    const nightTexture = new THREE.DataTexture(textures.night.rgba, textures.night.width, textures.night.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.wrapS = THREE.RepeatWrapping;
    nightTexture.wrapT = THREE.ClampToEdgeWrapping;
    nightTexture.magFilter = THREE.LinearFilter;
    nightTexture.minFilter = THREE.LinearFilter;
    nightTexture.generateMipmaps = false;
    nightTexture.needsUpdate = true;
    this.nightSky = new THREE.Mesh(
      buildNightSkyBand(),
      new THREE.MeshBasicMaterial({ map: nightTexture, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: false }),
    );
    this.nightSky.name = "SYS/SORA.GSL star/moon strip";
    this.nightSky.renderOrder = -9_999;
    this.scene.add(this.nightSky);
    this.applyOutdoorState();
  }

  setTimeOfDay(units: number): void {
    this.timeOfDayUnits = units;
    this.applyOutdoorState();
  }

  setVisibilityMode(mode: OutdoorVisibilityMode): void {
    this.visibilityMode = mode;
    this.applyOutdoorState();
  }

  addWorldActor(id: string, object: THREE.Object3D, fieldNumber: number, position: { x: number; y: number; z: number }, yaw: number): void {
    if (this.actors.has(id)) throw new Error(`World actor '${id}' is already attached.`);
    const state: WorldActorRenderState = { object, fieldNumber, position, yaw };
    this.actors.set(id, state);
    this.scene.add(object);
    this.positionActor(state);
  }

  updateWorldActor(id: string, fieldNumber: number, position: { x: number; y: number; z: number }, yaw: number): void {
    const state = this.actors.get(id);
    if (!state) return;
    state.fieldNumber = fieldNumber;
    state.position = position;
    state.yaw = yaw;
    this.positionActor(state);
  }

  clearWorldActors(): void {
    for (const actor of this.actors.values()) actor.object.removeFromParent();
    this.actors.clear();
  }

  startDriving(vehicle: THREE.Object3D, fieldNumber: number, position: { x: number; y: number; z: number }, yaw: number): void {
    this.vehicle?.removeFromParent();
    this.vehicle = vehicle;
    this.scene.add(vehicle);
    this.controls.enabled = false;
    this.horizon.visible = this.shouldShowHorizon();
    this.applyOutdoorState();
    this.chaseReady = false;
    this.updateDriving(fieldNumber, position, yaw, 0, 0, true);
  }

  updateDriving(
    fieldNumber: number,
    position: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    roll: number,
    snap = false,
    cameraLift = 6.1,
  ): void {
    if (!this.vehicle) return;
    if (this.originFieldNumber !== fieldNumber) {
      this.originFieldNumber = fieldNumber;
      this.positionSectors();
      snap = true;
    }
    this.vehicle.position.set(position.x, position.y + 0.02, position.z);
    this.vehicle.rotation.order = "YXZ";
    this.vehicle.rotation.set(-pitch, yaw, roll);
    const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
    // Peach's dense roofs can sit directly behind the authored spawn. A slightly
    // elevated chase pose keeps the player car visible without clipping the town.
    const desiredCamera = new THREE.Vector3(position.x - forwardX * 7.8, position.y + cameraLift, position.z - forwardZ * 7.8);
    const desiredTarget = new THREE.Vector3(position.x, position.y + 0.72, position.z);
    if (snap || !this.chaseReady) {
      this.camera.position.copy(desiredCamera);
      this.chaseTarget.copy(desiredTarget);
      this.chaseReady = true;
    } else {
      this.camera.position.lerp(desiredCamera, 0.13);
      this.chaseTarget.lerp(desiredTarget, 0.17);
    }
    this.camera.lookAt(this.chaseTarget);
    this.horizon.position.set(position.x, -3000, position.z);
  }

  stopDriving(): void {
    this.vehicle?.removeFromParent();
    this.vehicle = undefined;
    this.chaseReady = false;
    this.controls.enabled = true;
    this.showWorldOverview();
  }

  focusField(fieldNumber: number): boolean {
    const selected = this.sectors.get(fieldNumber);
    if (!selected) return false;
    this.controls.enabled = true;
    this.originFieldNumber = fieldNumber;
    this.positionSectors();
    const bounds = new THREE.Box3().setFromObject(selected.group);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const horizontalExtent = Math.max(size.x, size.z, fieldExtent);
    this.applyOutdoorState();
    this.horizon.visible = this.shouldShowHorizon();
    this.horizon.position.set(center.x, -3000, center.z);
    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + horizontalExtent * 0.32,
      center.y + Math.max(260, size.y * 1.55, horizontalExtent * 0.2),
      center.z + horizontalExtent * 0.32,
    );
    this.controls.update();
    return true;
  }

  showWorldOverview(): void {
    if (this.sectors.size === 0) return;
    this.controls.enabled = true;
    this.originFieldNumber = 223;
    this.positionSectors();
    const bounds = new THREE.Box3().setFromObject(this.worldGroup);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const horizontalExtent = Math.max(size.x, size.z, fieldExtent);
    this.applyOutdoorState();
    this.horizon.visible = false;
    this.horizon.position.set(center.x, -3000, center.z);
    this.controls.target.set(center.x, Math.max(0, center.y * 0.3), center.z);
    this.camera.position.set(
      center.x + horizontalExtent * 0.48,
      center.y + horizontalExtent * 0.82,
      center.z + horizontalExtent * 0.62,
    );
    this.controls.update();
  }

  async capturePng(
    scene: WorldOverviewCaptureScene | FieldOverviewCaptureScene,
    size: CaptureSize = scene.size,
    includeActors = false,
  ): Promise<Blob> {
    const previousOrigin = this.originFieldNumber;
    const previousTimeOfDayUnits = this.timeOfDayUnits;
    const previousVisibilityMode = this.visibilityMode;
    const previousFog = this.scene.fog;
    const previousHorizonVisible = this.horizon.visible;
    const previousHorizonPosition = this.horizon.position.clone();
    const previousSkyPosition = this.sky?.position.clone();
    const previousNightSkyPosition = this.nightSky?.position.clone();
    const previousActorVisibility = new Map<THREE.Object3D, boolean>();
    for (const actor of this.actors.values()) {
      previousActorVisibility.set(actor.object, actor.object.visible);
      if (!includeActors) actor.object.visible = false;
    }
    const previousVehicleVisible = this.vehicle?.visible;
    if (this.vehicle) this.vehicle.visible = false;

    try {
      this.timeOfDayUnits = scene.timeOfDayUnits ?? hg2TimeUnits(12);
      this.visibilityMode = scene.visibilityMode ?? "extended";
      this.applyOutdoorState();
      const captureCamera = scene.kind === "world-overview"
        ? this.prepareWorldCaptureCamera(size)
        : this.prepareFieldCaptureCamera(scene, size);
      if (!captureCamera) throw new Error(`FLD/${scene.kind === "field-overview" ? scene.fieldNumber.toString().padStart(3, "0") : "???"} is not loaded for capture.`);
      this.sky?.position.copy(captureCamera.position);
      this.nightSky?.position.copy(captureCamera.position);
      return await renderPng(this.renderer, size.width, size.height, () => {
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, captureCamera);
      });
    } finally {
      this.originFieldNumber = previousOrigin;
      this.timeOfDayUnits = previousTimeOfDayUnits;
      this.visibilityMode = previousVisibilityMode;
      this.positionSectors();
      this.applyOutdoorState();
      this.scene.fog = previousFog;
      this.horizon.visible = previousHorizonVisible;
      this.horizon.position.copy(previousHorizonPosition);
      if (this.sky && previousSkyPosition) this.sky.position.copy(previousSkyPosition);
      if (this.nightSky && previousNightSkyPosition) this.nightSky.position.copy(previousNightSkyPosition);
      for (const [object, visible] of previousActorVisibility) object.visible = visible;
      if (this.vehicle && previousVehicleVisible !== undefined) this.vehicle.visible = previousVehicleVisible;
    }
  }

  async captureCarPng(
    scene: CarVisualCaptureScene,
    vehicle: THREE.Object3D,
    size: CaptureSize = scene.size,
  ): Promise<Blob> {
    if (!this.sectors.has(scene.fieldNumber)) {
      throw new Error(`FLD/${scene.fieldNumber.toString().padStart(3, "0")} is not loaded for car visual capture.`);
    }
    const previousOrigin = this.originFieldNumber;
    const previousTimeOfDayUnits = this.timeOfDayUnits;
    const previousVisibilityMode = this.visibilityMode;
    const previousFog = this.scene.fog;
    const previousHorizonVisible = this.horizon.visible;
    const previousHorizonPosition = this.horizon.position.clone();
    const previousSkyPosition = this.sky?.position.clone();
    const previousNightSkyPosition = this.nightSky?.position.clone();
    const previousActorVisibility = new Map<THREE.Object3D, boolean>();
    const previousVehicleParent = vehicle.parent;
    const previousVehiclePosition = vehicle.position.clone();
    const previousVehicleRotation = vehicle.rotation.clone();
    const previousVehicleVisible = vehicle.visible;
    for (const actor of this.actors.values()) {
      previousActorVisibility.set(actor.object, actor.object.visible);
      actor.object.visible = false;
    }

    try {
      this.originFieldNumber = scene.fieldNumber;
      this.positionSectors();
      this.timeOfDayUnits = scene.timeOfDayUnits ?? hg2TimeUnits(12);
      this.visibilityMode = scene.visibilityMode ?? "authentic";
      this.applyOutdoorState();
      if (vehicle.parent !== this.scene) this.scene.add(vehicle);
      vehicle.visible = true;
      vehicle.position.set(...scene.vehicle.position);
      vehicle.rotation.order = "YXZ";
      vehicle.rotation.set(-(scene.vehicle.pitch ?? 0), scene.vehicle.yaw, scene.vehicle.roll ?? 0);
      const carCamera = captureCamera(
        this.camera,
        size,
        new THREE.Vector3(...scene.camera.position),
        new THREE.Vector3(...scene.camera.target),
      );
      this.horizon.visible = this.shouldShowHorizon();
      this.horizon.position.set(scene.vehicle.position[0], -3000, scene.vehicle.position[2]);
      this.sky?.position.copy(carCamera.position);
      this.nightSky?.position.copy(carCamera.position);
      return await renderPng(this.renderer, size.width, size.height, () => {
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, carCamera);
      });
    } finally {
      this.originFieldNumber = previousOrigin;
      this.timeOfDayUnits = previousTimeOfDayUnits;
      this.visibilityMode = previousVisibilityMode;
      this.positionSectors();
      this.applyOutdoorState();
      this.scene.fog = previousFog;
      this.horizon.visible = previousHorizonVisible;
      this.horizon.position.copy(previousHorizonPosition);
      if (this.sky && previousSkyPosition) this.sky.position.copy(previousSkyPosition);
      if (this.nightSky && previousNightSkyPosition) this.nightSky.position.copy(previousNightSkyPosition);
      for (const [object, visible] of previousActorVisibility) object.visible = visible;
      vehicle.position.copy(previousVehiclePosition);
      vehicle.rotation.copy(previousVehicleRotation);
      vehicle.visible = previousVehicleVisible;
      if (previousVehicleParent && vehicle.parent !== previousVehicleParent) previousVehicleParent.add(vehicle);
      else if (!previousVehicleParent) vehicle.removeFromParent();
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeWorld();
    this.horizon.geometry.dispose();
    const horizonMaterials = Array.isArray(this.horizon.material) ? this.horizon.material : [this.horizon.material];
    for (const material of horizonMaterials) material.dispose();
    if (this.sky) {
      this.sky.geometry.dispose();
      disposeSkyMaterial(this.sky.material);
    }
    if (this.nightSky) {
      this.nightSky.geometry.dispose();
      disposeSkyMaterial(this.nightSky.material);
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private stats(): WorldViewStats {
    let triangles = 0;
    let primitives = 0;
    for (const sector of this.sectors.values()) {
      triangles += sector.triangles;
      primitives += sector.primitives;
    }
    return { sectors: this.sectors.size, triangles, primitives };
  }

  private prepareWorldCaptureCamera(size: CaptureSize): THREE.PerspectiveCamera | undefined {
    if (this.sectors.size === 0) return undefined;
    this.originFieldNumber = 223;
    this.positionSectors();
    const bounds = new THREE.Box3().setFromObject(this.worldGroup);
    if (bounds.isEmpty()) return undefined;
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3());
    const horizontalExtent = Math.max(extent.x, extent.z, fieldExtent);
    this.applyOutdoorState();
    this.horizon.visible = false;
    this.horizon.position.set(center.x, -3000, center.z);
    const target = new THREE.Vector3(center.x, Math.max(0, center.y * 0.3), center.z);
    return captureCamera(
      this.camera,
      size,
      new THREE.Vector3(
        center.x + horizontalExtent * 0.48,
        center.y + horizontalExtent * 0.82,
        center.z + horizontalExtent * 0.62,
      ),
      target,
    );
  }

  private prepareFieldCaptureCamera(scene: FieldOverviewCaptureScene, size: CaptureSize): THREE.PerspectiveCamera | undefined {
    const selected = this.sectors.get(scene.fieldNumber);
    if (!selected) return undefined;
    this.originFieldNumber = scene.fieldNumber;
    this.positionSectors();
    const bounds = new THREE.Box3().setFromObject(selected.group);
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3());
    const horizontalExtent = Math.max(extent.x, extent.z, fieldExtent);
    this.applyOutdoorState();
    this.horizon.visible = this.shouldShowHorizon();
    const target = scene.camera
      ? new THREE.Vector3(...scene.camera.target)
      : center;
    this.horizon.position.set(target.x, -3000, target.z);
    const position = scene.camera
      ? new THREE.Vector3(...scene.camera.position)
      : new THREE.Vector3(
        center.x + horizontalExtent * 0.32,
        center.y + Math.max(260, extent.y * 1.55, horizontalExtent * 0.2),
        center.z + horizontalExtent * 0.32,
      );
    return captureCamera(this.camera, size, position, target);
  }

  private positionSectors(): void {
    for (const [fieldNumber, sector] of this.sectors) {
      const offset = relativeRenderTranslation(this.originFieldNumber, fieldNumber);
      sector.group.position.set(offset.x, 0, offset.y);
    }
    for (const actor of this.actors.values()) this.positionActor(actor);
    this.worldGroup.updateMatrixWorld(true);
  }

  private positionActor(actor: WorldActorRenderState): void {
    const offset = relativeRenderTranslation(this.originFieldNumber, actor.fieldNumber);
    actor.object.position.set(offset.x + actor.position.x, actor.position.y + 0.02, offset.y + actor.position.z);
    actor.object.rotation.set(0, actor.yaw, 0);
  }

  private shouldShowHorizon(): boolean {
    return outdoorAtmosphere(this.timeOfDayUnits).weights.night < 0.999;
  }

  private applyOutdoorState(): void {
    const atmosphere = outdoorAtmosphere(this.timeOfDayUnits);
    const weights = new THREE.Vector3(atmosphere.weights.day, atmosphere.weights.warm, atmosphere.weights.night);

    for (const sector of this.sectors.values()) {
      for (const material of sector.materials) {
        const target = material.userData.rtaTimeWeights as THREE.Vector3 | undefined;
        target?.copy(weights);
      }
      sector.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const path = object.userData.rtaRenderPath as string | undefined;
        const renderPathVisible = path === undefined || path === "all" || (this.visibilityMode === "authentic"
          ? path === "authentic-depth" || path === "authentic-rgb"
          : path === "approximate");
        const timeVisible = object.userData.rtaNightOnly !== true || atmosphere.weights.night > 0.0001;
        object.visible = renderPathVisible && timeVisible;
      });
    }

    const fog = rgbColor(atmosphere.fogColor);
    const background = rgbColor(atmosphere.backgroundColor);
    this.scene.background = background;
    this.renderer.setClearColor(background, 1);
    // Ordinary fields reproduce HG2's separate linear GS-fog and VU-alpha
    // stages in their material shader. THREE.Fog cannot represent both starts.
    this.scene.fog = null;
    for (const sector of this.sectors.values()) {
      for (const material of sector.materials) {
        const atmosphereTarget = material.userData.rtaAtmosphereColor as THREE.Color | undefined;
        atmosphereTarget?.copy(fog);
        const distances = material.userData.rtaAtmosphereDistances as THREE.Vector4 | undefined;
        const usesOrdinaryFieldAtmosphere = material.userData.rtaUsesOrdinaryFieldAtmosphere === true;
        const usesStableAtmosphere = material.userData.rtaUsesStableAtmosphere === true;
        if (!distances) continue;

        if (!usesOrdinaryFieldAtmosphere) {
          distances.w = 0;
          continue;
        }

        const visibility = this.visibilityMode === "authentic"
          ? authenticFieldVisibilityProfile(this.timeOfDayUnits, usesStableAtmosphere)
          : visibilityProfile(this.visibilityMode);
        if (
          visibility.fogFullDistance !== null
          && visibility.alphaFullDistance !== null
          && visibility.farDistance !== null
        ) {
          distances.set(visibility.fogFullDistance, visibility.alphaFullDistance, visibility.farDistance, 1);
        } else {
          distances.w = 0;
        }
      }
    }

    const horizonMaterial = this.horizon.material;
    if (horizonMaterial instanceof THREE.MeshBasicMaterial) horizonMaterial.color.copy(fog);

    const dayOpacity = Math.max(0, Math.min(1, Math.max(atmosphere.weights.day, atmosphere.weights.warm)));
    if (this.sky?.material instanceof THREE.MeshBasicMaterial) {
      this.sky.material.opacity = dayOpacity;
      this.sky.visible = dayOpacity > 0.0001;
    }
    if (this.nightSky?.material instanceof THREE.MeshBasicMaterial) {
      this.nightSky.material.opacity = Math.max(0, Math.min(1, atmosphere.weights.night / 1.1));
      this.nightSky.visible = atmosphere.weights.night > 0.0001;
    }
  }

  private disposeWorld(): void {
    this.vehicle?.removeFromParent();
    this.vehicle = undefined;
    this.clearWorldActors();
    for (const sector of this.sectors.values()) {
      sector.group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of sector.materials) material.dispose();
      for (const texture of sector.textures) texture.dispose();
      if (sector.dynamic) {
        for (const geometry of sector.dynamic.geometries) geometry.dispose();
        sector.dynamic.material.dispose();
        sector.dynamic.texture?.dispose();
      }
      this.worldGroup.remove(sector.group);
    }
    this.sectors.clear();
    this.animatedDynamicObjects.length = 0;
    this.lastFrameTimestamp = 0;
    this.animationSeconds = 0;
  }

  private readonly frame = (): void => {
    if (this.controls.enabled) this.controls.update();
    this.sky?.position.copy(this.camera.position);
    this.nightSky?.position.copy(this.camera.position);
    const now = performance.now();
    if (this.animatedDynamicObjects.length > 0) {
      // HOST APPROXIMATION: rotor spin and crown sway (see the constants above).
      // Drive both from a clock that only advances on rendered frames so a
      // backgrounded pane does not jump the animation on return.
      const deltaSeconds = this.lastFrameTimestamp > 0 ? Math.min(0.1, (now - this.lastFrameTimestamp) / 1000) : 0;
      this.animationSeconds += deltaSeconds;
      const t = this.animationSeconds;
      const spinStep = approximateRotorSpinRadiansPerSecond * deltaSeconds;
      for (const entry of this.animatedDynamicObjects) {
        if (entry.motion === "rotor-spin") {
          entry.object.rotation.z += spinStep;
        } else {
          const phase = entry.phaseSeed + entry.groupIndex * crownSway.groupPhaseStep;
          entry.object.rotation.z = Math.sin(t * crownSway.swayHz + phase) * crownSway.swayAmplitude;
          entry.object.rotation.x = Math.sin(t * crownSway.crossHz + phase + 1.1) * crownSway.crossAmplitude;
        }
      }
    }
    this.lastFrameTimestamp = now;
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

function disposeSkyMaterial(material: THREE.Material | THREE.Material[]): void {
  for (const item of Array.isArray(material) ? material : [material]) {
    if (item instanceof THREE.MeshBasicMaterial) item.map?.dispose();
    item.dispose();
  }
}

/**
 * Field dynamic objects run VU program 4 but, like the palm crowns in the C#
 * reference, without the car render path's lighting setup — the authored vertex
 * colour is the GS-neutral 128 and the retained mesh is drawn texture-only with
 * alpha test. Any daylight response is part of the undecoded object matrix.
 */
function createDynamicObjectMaterial(texture: THREE.Texture | undefined): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture ?? null,
    transparent: texture !== undefined,
    alphaTest: texture !== undefined ? 0.25 : 0,
    side: THREE.DoubleSide,
    fog: false,
  });
}

type FieldRenderPath = "approximate" | "authentic-depth" | "authentic-rgb";

function createFieldMaterial(batch: CompiledFieldBatch, textures: THREE.Texture[], renderPath: FieldRenderPath): THREE.MeshBasicMaterial {
  const timeWeights = new THREE.Vector3(1.1, 0, 0);
  const atmosphereColor = new THREE.Color(1, 1, 1);
  // x=fog-full depth, y=alpha-full depth, z=far depth, w=enabled.
  // Ordinary MSCALF 8 batches preserve HG2's authored memory-20 vs memory-21
  // selector. Billboards execute MSCALF 6 and remain outside this profile.
  const atmosphereDistances = new THREE.Vector4(290, 544, 800, batch.billboard ? 0 : 1);
  const authentic = renderPath !== "approximate";
  const material = new THREE.MeshBasicMaterial({
    map: batch.textureIndex >= 0 ? textures[batch.textureIndex] : null,
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: false,
    transparent: authentic || batch.hasTransparency,
    alphaTest: authentic ? 0 : (batch.hasTransparency ? 1 / 255 : 0),
    depthWrite: renderPath !== "authentic-rgb",
  });
  material.userData.rtaTimeWeights = timeWeights;
  material.userData.rtaAtmosphereColor = atmosphereColor;
  material.userData.rtaAtmosphereDistances = atmosphereDistances;
  material.userData.rtaUsesOrdinaryFieldAtmosphere = !batch.billboard;
  material.userData.rtaUsesStableAtmosphere = batch.stableAtmosphere;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rtaTimeWeights = { value: timeWeights };
    shader.uniforms.rtaAtmosphereColor = { value: atmosphereColor };
    shader.uniforms.rtaAtmosphereDistances = { value: atmosphereDistances };
    let vertexDeclarations =
      "attribute vec3 warmColor;\nattribute vec3 nightColor;\nuniform vec3 rtaTimeWeights;\nvarying float vRtaViewDepth;";
    if (batch.billboard) vertexDeclarations += "\nattribute vec3 anchor;";
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${vertexDeclarations}\nvoid main() {`)
      .replace(
        "#include <color_vertex>",
        "#include <color_vertex>\n#ifdef USE_COLOR\n  vColor.xyz = color * rtaTimeWeights.x + warmColor * rtaTimeWeights.y + nightColor * rtaTimeWeights.z;\n#endif",
      );
    if (batch.billboard) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 localCamera = cameraPosition - vec3(modelMatrix[3]);
        vec3 toCamera = localCamera - anchor;
        toCamera.y = 0.0;
        float cameraDistance = max(length(toCamera), 0.0001);
        vec3 forward = toCamera / cameraDistance;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
        vec3 transformed = anchor + right * position.x + vec3(0.0, position.y, 0.0) + forward * position.z;`,
      );
    }
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n  vRtaViewDepth = max(0.0, -mvPosition.z);",
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `vec3 rtaLinearToSrgb(vec3 value) {
          bvec3 cutoff = lessThanEqual(value, vec3(0.0031308));
          vec3 low = value * 12.92;
          vec3 high = pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
          return mix(high, low, cutoff);
        }
        vec3 rtaSrgbToLinear(vec3 value) {
          bvec3 cutoff = lessThanEqual(value, vec3(0.04045));
          vec3 low = value / 12.92;
          vec3 high = pow((value + vec3(0.055)) / 1.055, vec3(2.4));
          return mix(high, low, cutoff);
        }
        uniform vec3 rtaAtmosphereColor;
        uniform vec4 rtaAtmosphereDistances;
        varying float vRtaViewDepth;
        void main() {`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float rtaFogSpan = max(rtaAtmosphereDistances.z - rtaAtmosphereDistances.x, 0.0001);
        float rtaAlphaSpan = max(rtaAtmosphereDistances.z - rtaAtmosphereDistances.y, 0.0001);
        float rtaFogSource = clamp((rtaAtmosphereDistances.z - vRtaViewDepth) / rtaFogSpan, 0.0, 1.0);
        float rtaAlphaSource = clamp((rtaAtmosphereDistances.z - vRtaViewDepth) / rtaAlphaSpan, 0.0, 1.0);
        vec3 rtaAtmosphereEncoded = rtaLinearToSrgb(rtaAtmosphereColor);
        vec3 rtaOutgoingEncoded = rtaLinearToSrgb(outgoingLight);
        ${renderPath === "approximate" ? `// Fast browser visibility path: approximate the framebuffer destination as
        // the same atmospheric colour and collapse fog then alpha to one factor.
        float rtaSourceFactor = mix(1.0, rtaFogSource * rtaAlphaSource, rtaAtmosphereDistances.w);
        vec3 rtaCompositedEncoded = mix(rtaAtmosphereEncoded, rtaOutgoingEncoded, rtaSourceFactor);
        outgoingLight = rtaSrgbToLinear(rtaCompositedEncoded);` : `// Authentic field path: GS fog modifies source RGB first; ALPHA_2 then
        // blends that result against the *actual* framebuffer destination.
        float rtaFogFactor = mix(1.0, rtaFogSource, rtaAtmosphereDistances.w);
        vec3 rtaFoggedEncoded = mix(rtaAtmosphereEncoded, rtaOutgoingEncoded, rtaFogFactor);
        outgoingLight = rtaSrgbToLinear(rtaFoggedEncoded);
        float rtaFinalAlpha = clamp(diffuseColor.a * rtaAlphaSource, 0.0, 1.0);
        const float rtaGsAlphaReference = 127.0 / 128.0;
        ${renderPath === "authentic-depth" ? `if (rtaFinalAlpha < rtaGsAlphaReference) discard;` : `if (rtaFinalAlpha >= rtaGsAlphaReference || rtaFinalAlpha <= 0.0) discard;`}
        diffuseColor.a = rtaFinalAlpha;`}
        #include <opaque_fragment>`,
      );

    // HG2's field VU writes RGB in the GS 0..128 modulation domain. The
    // compiled Uint8 vertex attributes already convert raw/128 into a normal
    // 0..1 factor, so vColor is *already* the TEX0.TFX=MODULATE multiplier.
    // Do not apply another 255/128 factor here (an earlier archaeology
    // experiment did so and consequently made the world nearly twice as bright).
    //
    // The GS modulates in display-byte space, whereas Three normally multiplies
    // an sRGB texture after decoding it to linear light. Round-trip the sampled
    // texture to encoded sRGB, apply the already-normalised GS factor there,
    // then decode once so Three's final output transfer writes the intended byte.
    // Untextured TME=0 geometry uses the VU RGB directly as its display colour;
    // convert the raw/128 factor back to raw/255 before decoding to linear.
    const usesGsModulate = batch.textureIndex >= 0 && batch.textureFunction === 0;
    const usesDirectGsVertexColor = batch.textureIndex < 0;
    if (usesGsModulate || usesDirectGsVertexColor) {
      if (usesGsModulate) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
              vec4 rtaMapLinear = texture2D(map, vMapUv);
              vec3 rtaTextureEncoded = rtaLinearToSrgb(rtaMapLinear.rgb);
              vec3 rtaModulatedEncoded = clamp(rtaTextureEncoded * vColor.rgb, 0.0, 1.0);
              diffuseColor.rgb *= rtaSrgbToLinear(rtaModulatedEncoded);
              diffuseColor.a *= rtaMapLinear.a;
            #endif`,
          )
          .replace("#include <color_fragment>", "");
      } else {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `vec3 rtaVertexEncoded = clamp(vColor.rgb * (128.0 / 255.0), 0.0, 1.0);
          diffuseColor.rgb *= rtaSrgbToLinear(rtaVertexEncoded);`,
        );
      }
    }
  };
  material.customProgramCacheKey = () => `rta-field-atmosphere-v5-${renderPath}-tfx${batch.textureFunction}-${batch.textureIndex >= 0 ? "textured" : "direct"}-${batch.billboard ? "billboard" : "static"}`;
  return material;
}


function captureCamera(
  source: THREE.PerspectiveCamera,
  size: CaptureSize,
  position: THREE.Vector3,
  target: THREE.Vector3,
): THREE.PerspectiveCamera {
  const camera = source.clone();
  camera.aspect = size.width / size.height;
  camera.position.copy(position);
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

function setBatchBounds(geometry: THREE.BufferGeometry, batch: CompiledFieldBatch): void {
  if (!batch.billboard) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return;
  }
  const bounds = new THREE.Box3();
  const minimum = new THREE.Vector3();
  const maximum = new THREE.Vector3();
  for (let index = 0; index < batch.positions.length; index += 3) {
    const x = batch.positions[index] ?? 0;
    const y = batch.positions[index + 1] ?? 0;
    const z = batch.positions[index + 2] ?? 0;
    const anchorX = batch.anchors[index] ?? 0;
    const anchorY = batch.anchors[index + 1] ?? 0;
    const anchorZ = batch.anchors[index + 2] ?? 0;
    const radius = Math.hypot(x, z);
    minimum.set(anchorX - radius, anchorY + y, anchorZ - radius);
    maximum.set(anchorX + radius, anchorY + y, anchorZ + radius);
    bounds.expandByPoint(minimum);
    bounds.expandByPoint(maximum);
  }
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
}

function rgbColor(color: { r: number; g: number; b: number }): THREE.Color {
  // GS environment values are display-byte values; Three stores linear colour.
  return new THREE.Color().setRGB(color.r / 255, color.g / 255, color.b / 255, THREE.SRGBColorSpace);
}

function buildNightSkyBand(): THREE.BufferGeometry {
  const azimuthSegments = 96;
  const elevationSegments = 16;
  const radius = 7900;
  const lowerElevation = -0.10;
  // The 1024x128 SORA night asset is a strip/overlay, not a zenith texture.
  // A deliberately narrow provisional band keeps authored one-pixel stars at
  // plausible screen size and avoids pole-collapse streaks. Exact HG2 sky
  // geometry is still under archaeology; do not treat 0.25 rad as disc truth.
  const upperElevation = 0.25;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let elevationIndex = 0; elevationIndex <= elevationSegments; elevationIndex += 1) {
    const t = elevationIndex / elevationSegments;
    const elevation = lowerElevation + (upperElevation - lowerElevation) * t;
    const horizontal = Math.cos(elevation) * radius;
    const y = Math.sin(elevation) * radius;
    const v = 1 - t;
    for (let azimuthIndex = 0; azimuthIndex <= azimuthSegments; azimuthIndex += 1) {
      const u = azimuthIndex / azimuthSegments;
      const azimuth = u * Math.PI * 2;
      positions.push(-Math.sin(azimuth) * horizontal, y, -Math.cos(azimuth) * horizontal);
      uvs.push(u, v);
    }
  }
  const stride = azimuthSegments + 1;
  for (let elevation = 0; elevation < elevationSegments; elevation += 1) {
    for (let azimuth = 0; azimuth < azimuthSegments; azimuth += 1) {
      const a = elevation * stride + azimuth;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildSkyHemisphere(): THREE.BufferGeometry {
  const azimuthSegments = 64, elevationSegments = 12, radius = 8000, lowerElevation = -0.1;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let elevationIndex = 0; elevationIndex <= elevationSegments; elevationIndex += 1) {
    const t = elevationIndex / elevationSegments;
    const elevation = lowerElevation + (Math.PI / 2 - lowerElevation) * t;
    const horizontal = Math.cos(elevation) * radius, y = Math.sin(elevation) * radius;
    const v = elevation <= 0 ? 1 : 1 - elevation / (Math.PI / 2);
    for (let azimuthIndex = 0; azimuthIndex <= azimuthSegments; azimuthIndex += 1) {
      const u = azimuthIndex / azimuthSegments, azimuth = u * Math.PI * 2;
      positions.push(-Math.sin(azimuth) * horizontal, y, -Math.cos(azimuth) * horizontal);
      uvs.push(u, v);
    }
  }
  const stride = azimuthSegments + 1;
  for (let elevation = 0; elevation < elevationSegments; elevation += 1) {
    for (let azimuth = 0; azimuth < azimuthSegments; azimuth += 1) {
      const a = elevation * stride + azimuth, b = a + 1, c = a + stride, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
