import * as THREE from "three";
import type { ShopInteriorBackdrop } from "../formats/shopInterior";
import type { Q62CarModel } from "./carView";
import type { CaptureSize } from "./captureScenes";
import type { CarPartsAppearance } from "./parts";
import { renderPng } from "./renderCapture";

const sceneryCutoutHeight = 224;
const floorCrop = { x: 512, y: 320, width: 64, height: 64 } as const;
const platformUnderlayCrop = { x: 576, y: 256, width: 64, height: 64 } as const;
const platformRingCrop = { x: 576, y: 320, width: 64, height: 64 } as const;

const staffPosition = new THREE.Vector3(-1.75, 0.02, 2.1);
const staffYaw = 112.5 * Math.PI / 180;
const platformPosition = new THREE.Vector3(1.2, 0, 5.2);
const playerPosition = new THREE.Vector3(1.195234, 0.02, 5.203379);
const playerYaw = 87 * Math.PI / 32768;

export interface ShopInteriorDynamicLayer {
  readonly playerCar: Q62CarModel;
  readonly staffCar: Q62CarModel;
}

/**
 * Generic development view for one authored SHOP slot. This deliberately shows
 * the decoded 640x384 atlas as-is; it is not presented as a finished HG2 room.
 * It gives unreconstructed interiors an immediate truthful visual foothold while
 * scene-specific geometry/compositing is recovered separately.
 */
export class ShopInteriorBackdropView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private readonly resizeObserver: ResizeObserver;
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private readonly atlasAspect: number;
  private disposed = false;

  constructor(private readonly host: HTMLElement, backdrop: ShopInteriorBackdrop, label: string) {
    this.atlasAspect = backdrop.width / backdrop.height;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x171917, 1);
    this.renderer.domElement.className = "factory-canvas";
    this.renderer.domElement.setAttribute("aria-label", `${label} authored SHOP atlas preview`);
    this.host.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x171917);
    const texture = this.track(canvasTexture(new Uint8ClampedArray(backdrop.rgba), backdrop.width, backdrop.height));
    const material = this.track(new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    const plane = new THREE.Mesh(this.track(new THREE.PlaneGeometry(this.atlasAspect * 2, 2)), material);
    plane.name = `${label} authored SHOP atlas`;
    this.scene.add(plane);
    this.camera.position.z = 1;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  async capturePng(size: CaptureSize): Promise<Blob> {
    return renderPng(this.renderer, size.width, size.height, () => this.renderer.render(this.scene, this.camera));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    for (const resource of this.resources) resource.dispose();
    this.resources.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    const hostAspect = width / height;
    if (hostAspect >= this.atlasAspect) {
      this.camera.left = -hostAspect;
      this.camera.right = hostAspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
    } else {
      const halfHeight = this.atlasAspect / hostAspect;
      this.camera.left = -this.atlasAspect;
      this.camera.right = this.atlasAspect;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T {
    this.resources.push(resource);
    return resource;
  }
}

/**
 * Shared fixed-camera SHOP room composition observed across the authored slots:
 * a repeated floor swatch underneath the screen-space scenery cutout. Q's
 * Factory layers its platform/live cars on top of the same base presentation.
 */
export class ShopInteriorRoomView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly overlayScene = new THREE.Scene();
  private readonly carScene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private readonly resizeObserver: ResizeObserver;
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private playerCar: Q62CarModel | undefined;
  private staffCar: Q62CarModel | undefined;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    backdrop: ShopInteriorBackdrop,
    label: string,
    dynamicLayer?: ShopInteriorDynamicLayer,
  ) {
    if (backdrop.width !== 640 || backdrop.height !== 384) throw new Error(`${label} requires its authored 640x384 SHOP atlas.`);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xd6e1ce, 1);
    this.renderer.autoClear = false;
    this.renderer.domElement.className = "factory-canvas";
    this.renderer.domElement.setAttribute("aria-label", `${label} reconstructed SHOP room preview`);
    this.host.append(this.renderer.domElement);

    this.camera = createShopInteriorCamera();
    this.scene.background = new THREE.Color(0xd6e1ce);
    const floorTexture = this.track(textureFromCrop(backdrop, floorCrop));
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(16, 16);
    const floor = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(20, 20)),
      this.track(new THREE.MeshBasicMaterial({ map: floorTexture, color: 0xffffff, side: THREE.DoubleSide })),
    );
    floor.name = `${label} tiled SHOP floor`;
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const scenery = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(2, 2)),
      this.track(new THREE.MeshBasicMaterial({
        map: this.track(textureFromScenery(backdrop)),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })),
    );
    scenery.name = `${label} authored SHOP scenery cutout`;
    this.overlayScene.add(scenery);
    this.overlayCamera.position.z = 1;

    if (dynamicLayer) {
      this.addBlobShadow(staffPosition, 1.28, 0.78, -staffYaw);
      this.addBlobShadow(playerPosition, 1.2, 0.72, -playerYaw);
      this.staffCar = dynamicLayer.staffCar;
      this.staffCar.position.copy(staffPosition);
      this.staffCar.rotation.y = staffYaw;
      this.staffCar.name = `${label} staff car`;
      this.carScene.add(this.staffCar);
      this.setPlayerCar(dynamicLayer.playerCar, `${label} player car`);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  async capturePng(size: CaptureSize): Promise<Blob> {
    return renderPng(this.renderer, size.width, size.height, () => this.render());
  }

  /** Replace only the foreground player body while retaining room/staff state. */
  setPlayerCar(playerCar: Q62CarModel, name = "Body Shop player preview"): void {
    if (this.disposed) {
      playerCar.dispose();
      return;
    }
    if (this.playerCar === playerCar) return;
    this.playerCar?.dispose();
    this.playerCar = playerCar;
    playerCar.position.copy(playerPosition);
    playerCar.rotation.y = playerYaw + Math.PI;
    playerCar.name = name;
    this.carScene.add(playerCar);
    this.render();
  }

  setPlayerPartsAppearance(appearance: CarPartsAppearance): void {
    this.playerCar?.setPartsAppearance(appearance);
    this.render();
  }

  setPlayerNativeTyreAppearance(selector: number): void {
    this.playerCar?.setNativeTyreAppearance(selector);
    this.render();
  }

  setPlayerPaints(primary: readonly [number, number, number], secondary: readonly [number, number, number]): void {
    this.playerCar?.setPaints(primary, secondary);
    this.render();
  }

  setPlayerWheelColor(color: readonly [number, number, number], colorIndex = 0): void {
    this.playerCar?.setNativeWheelColor(color, colorIndex);
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.playerCar?.dispose();
    this.staffCar?.dispose();
    this.playerCar = undefined;
    this.staffCar = undefined;
    for (const resource of this.resources) resource.dispose();
    this.resources.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private render(): void {
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.overlayScene, this.overlayCamera);
    if (this.playerCar || this.staffCar) {
      this.renderer.clearDepth();
      this.renderer.render(this.carScene, this.camera);
    }
  }

  private resize(): void {
    this.renderer.setSize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight), false);
    this.render();
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T {
    this.resources.push(resource);
    return resource;
  }

  private addBlobShadow(position: THREE.Vector3, radiusX: number, radiusZ: number, yaw: number): void {
    const geometry = this.track(new THREE.CircleGeometry(1, 48));
    geometry.scale(radiusX, radiusZ, 1);
    const material = this.track(new THREE.MeshBasicMaterial({
      color: 0x30443b,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const shadow = new THREE.Mesh(geometry, material);
    shadow.rotation.set(-Math.PI / 2, 0, yaw);
    shadow.position.copy(position).setY(0.031);
    this.scene.add(shadow);
  }
}

/**
 * Q's Factory is a hybrid scene: the SHOP atlas contributes the authored
 * machinery/sign cutout and floor/platform materials, while both cars are live
 * decoded meshes. The fixed presentation is intentionally isolated from the
 * outdoor renderer so entering the factory never mutates world state.
 */
export class QFactoryInteriorView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly overlayScene = new THREE.Scene();
  private readonly carScene = new THREE.Scene();
  private readonly overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private readonly resizeObserver: ResizeObserver;
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private readonly platformUnderlay: THREE.Mesh;
  private frameHandle = 0;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    backdrop: ShopInteriorBackdrop,
    private readonly playerCar: Q62CarModel,
    private readonly staffCar: Q62CarModel,
  ) {
    if (backdrop.width !== 640 || backdrop.height !== 384) throw new Error("Q's Factory requires its authored 640x384 atlas.");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xd6e1ce, 1);
    this.renderer.autoClear = false;
    this.renderer.domElement.className = "factory-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Q's Factory reconstructed scene");
    this.host.append(this.renderer.domElement);

    this.camera = createShopInteriorCamera();

    this.scene.background = new THREE.Color(0xd6e1ce);
    const floorTexture = this.track(textureFromCrop(backdrop, floorCrop));
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(16, 16);
    const floorMaterial = this.track(new THREE.MeshBasicMaterial({ map: floorTexture, color: 0xffffff, side: THREE.DoubleSide }));
    const floorGeometry = this.track(new THREE.PlaneGeometry(20, 20));
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.name = "Q's Factory tiled floor";
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const underlayTexture = this.track(textureFromCrop(backdrop, platformUnderlayCrop));
    const underlayMaterial = this.track(new THREE.MeshBasicMaterial({
      map: underlayTexture,
      transparent: true,
      alphaTest: 1 / 255,
      side: THREE.DoubleSide,
      depthWrite: true,
    }));
    this.platformUnderlay = new THREE.Mesh(this.track(new THREE.PlaneGeometry(3.75, 3.75)), underlayMaterial);
    this.platformUnderlay.name = "Q's Factory platform underlay";
    this.platformUnderlay.rotation.x = -Math.PI / 2;
    this.platformUnderlay.position.copy(platformPosition).setY(0.012);
    this.scene.add(this.platformUnderlay);

    const ringTexture = this.track(textureFromCrop(backdrop, platformRingCrop));
    const ringMaterial = this.track(new THREE.MeshBasicMaterial({
      map: ringTexture,
      transparent: true,
      alphaTest: 1 / 255,
      side: THREE.DoubleSide,
      depthWrite: true,
    }));
    const ring = new THREE.Mesh(this.track(new THREE.PlaneGeometry(3.75, 3.75)), ringMaterial);
    ring.name = "Q's Factory yellow platform ring";
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(platformPosition).setY(0.024);
    this.scene.add(ring);

    this.addBlobShadow(staffPosition, 1.28, 0.78, -staffYaw);
    this.addBlobShadow(playerPosition, 1.2, 0.72, -playerYaw);
    this.staffCar.position.copy(staffPosition);
    this.staffCar.rotation.y = staffYaw;
    this.staffCar.name = "Q's Factory staff car";
    this.carScene.add(this.staffCar);
    this.playerCar.position.copy(playerPosition);
    this.playerCar.rotation.y = playerYaw + Math.PI;
    this.playerCar.name = "Q's Factory player car";
    this.carScene.add(this.playerCar);

    const sceneryTexture = this.track(textureFromScenery(backdrop));
    const sceneryMaterial = this.track(new THREE.MeshBasicMaterial({
      map: sceneryTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const scenery = new THREE.Mesh(this.track(new THREE.PlaneGeometry(2, 2)), sceneryMaterial);
    scenery.name = "Q's Factory authored machinery and sign cutout";
    this.overlayScene.add(scenery);
    this.overlayCamera.position.z = 1;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  setPlayerPartsAppearance(appearance: CarPartsAppearance): void {
    this.playerCar.setPartsAppearance(appearance);
  }

  setPlayerNativeTyreAppearance(selector: number): void {
    this.playerCar.setNativeTyreAppearance(selector);
  }

  async capturePng(size: CaptureSize, animationTimeMs = 0): Promise<Blob> {
    const previousRotation = this.platformUnderlay.rotation.z;
    try {
      return await renderPng(this.renderer, size.width, size.height, () => this.renderAt(animationTimeMs));
    } finally {
      this.platformUnderlay.rotation.z = previousRotation;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.playerCar.dispose();
    this.staffCar.dispose();
    for (const resource of this.resources) resource.dispose();
    this.resources.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly frame = (time: number): void => {
    if (this.disposed) return;
    this.renderAt(time);
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private renderAt(time: number): void {
    this.platformUnderlay.rotation.z = -time * 0.00018;
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.overlayScene, this.overlayCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.carScene, this.camera);
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
  }

  private addBlobShadow(position: THREE.Vector3, radiusX: number, radiusZ: number, yaw: number): void {
    const geometry = this.track(new THREE.CircleGeometry(1, 48));
    geometry.scale(radiusX, radiusZ, 1);
    const material = this.track(new THREE.MeshBasicMaterial({
      color: 0x30443b,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const shadow = new THREE.Mesh(geometry, material);
    shadow.rotation.set(-Math.PI / 2, 0, yaw);
    shadow.position.copy(position).setY(0.031);
    this.scene.add(shadow);
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T {
    this.resources.push(resource);
    return resource;
  }
}

function createShopInteriorCamera(): THREE.PerspectiveCamera {
  // The original render uses independent PAL X/Y projection factors. A normal
  // perspective camera with this authored projection aspect reproduces those
  // scales before the 640x384 logical image is presented at 4:3.
  const verticalFov = 2 * Math.atan(1 / ((3564 * 0.53) / (384 * 0.5))) * 180 / Math.PI;
  const projectionAspect = ((3564 * 0.53) / (384 * 0.5)) / ((3564 * 0.8) / (640 * 0.5));
  const camera = new THREE.PerspectiveCamera(verticalFov, projectionAspect, 3, 65_536);
  camera.position.set(28.59, 19.26, -29.03);
  camera.lookAt(1.35, 1.05, 1.8);
  // HG2 applies a GS screen-X convention after the view/projection transform.
  // Mirror only the live 3D layer; authored screen-space scenery is already in
  // final display order.
  camera.projectionMatrix.elements[0] = -(camera.projectionMatrix.elements[0] ?? 1);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}

function textureFromScenery(backdrop: ShopInteriorBackdrop): THREE.CanvasTexture {
  const rgba = new Uint8ClampedArray(backdrop.rgba);
  for (let y = sceneryCutoutHeight; y < backdrop.height; y += 1) {
    for (let x = 0; x < backdrop.width; x += 1) rgba[(y * backdrop.width + x) * 4 + 3] = 0;
  }
  return canvasTexture(rgba, backdrop.width, backdrop.height);
}

function textureFromCrop(
  backdrop: ShopInteriorBackdrop,
  crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): THREE.CanvasTexture {
  const rgba = new Uint8ClampedArray(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y += 1) {
    const source = ((crop.y + y) * backdrop.width + crop.x) * 4;
    const target = y * crop.width * 4;
    rgba.set(backdrop.rgba.subarray(source, source + crop.width * 4), target);
  }
  return canvasTexture(rgba, crop.width, crop.height);
}

function canvasTexture(rgba: Uint8ClampedArray, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create a 2D canvas for a SHOP texture.");
  const imagePixels = new Uint8ClampedArray(new ArrayBuffer(rgba.byteLength));
  imagePixels.set(rgba);
  context.putImageData(new ImageData(imagePixels, width, height), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
