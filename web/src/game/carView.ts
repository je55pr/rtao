import * as THREE from "three";
import { decodeNativeWheelAssets, decodeQ62Assets, nativeWheelSelectorCount, type CarPrimitive, type CarVertex, type NativeWheelAssets } from "../formats/carGeometry";
import { defaultPartsAppearance, type CarPartsAppearance } from "./parts";

const frontLeftCenter = new THREE.Vector3(-0.741544, 0.33, 0.68);
const frontRightCenter = new THREE.Vector3(0.741544, 0.33, 0.68);
const rearLeftCenter = new THREE.Vector3(-0.724481, 0.38, -0.66);
const rearRightCenter = new THREE.Vector3(0.724481, 0.38, -0.66);
const rearSourceCenterX = 0.7229365;

// Executable table 0x002a1e70, used only when native config flag 0x0400
// (uniquely produced by tyre selector 1:11 / Big Tyre) is active. TIRE.BIN
// sections 4/5 carry their own lateral offset, so these are the authored
// transform origins rather than the final visible tyre centres.
const bigFrontLeftTransform = new THREE.Vector3(-0.4, 0.55, 0.68);
const bigFrontRightTransform = new THREE.Vector3(0.4, 0.55, 0.68);
const bigRearLeftTransform = new THREE.Vector3(-0.4, 0.55, -0.66);
const bigRearRightTransform = new THREE.Vector3(0.4, 0.55, -0.66);
const nativeBigTyreSelector = 11;
// PAL car transform stores an additional +0.85 Y translation when config flag
// 0x0400 (uniquely Big Tyre) is active. The wheel/contact meshes are rendered
// on their own authored ground-contact transforms, so the browser mirrors the
// observed native separation by lifting the chassis/accessories, not the tyres.
export const nativeBigTyreBodyLift = 0.85;
export function nativeTyreBodyLift(selector: number): number {
  return validNativeTyreSelector(selector) === nativeBigTyreSelector ? nativeBigTyreBodyLift : 0;
}

export interface CarModelOptions {
  readonly name?: string;
  readonly primaryPaint?: readonly [number, number, number];
  readonly secondaryPaint?: readonly [number, number, number];
  /** Original close-detail CARS/WHEEL.BIN bank. TIRE.BIN remains the fallback/LOD source. */
  readonly wheelBytes?: Uint8Array;
  /** Native category-1 selector byte. Big Tyre is selector 11. */
  readonly nativeTyreSelector?: number;
  /** Native configuration byte +6. */
  readonly nativeWheelSelector?: number;
  /** Exact native wheel-paint RGB after palette/intensity lookup (close WHEEL.BIN path). */
  readonly wheelColor?: readonly [number, number, number];
  /** Native configuration byte +5 / wheel-paint index, also used as the TIRE PSMT4 CLUT bank. */
  readonly wheelColorIndex?: number;
}

export class Q62CarModel extends THREE.Group {
  triangleCount: number;
  primitiveCount: number;
  readonly localBounds: { readonly minimum: readonly [number, number, number]; readonly maximum: readonly [number, number, number] };
  private readonly frontSteering: THREE.Group[] = [];
  private readonly wheelSpinners: THREE.Group[] = [];
  private readonly wheelRoots: THREE.Group[] = [];
  private readonly partsAccessories = new THREE.Group();
  private readonly bodyPrimitives: CarPrimitive[];
  private readonly bodyTexture: THREE.Texture;
  private readonly tireTexture: THREE.Texture;
  private readonly tireTextures: readonly THREE.Texture[];
  private readonly fallbackFrontLeft: CarPrimitive[];
  private readonly fallbackFrontRight: CarPrimitive[];
  private readonly fallbackRearLeft: CarPrimitive[];
  private readonly fallbackRearRight: CarPrimitive[];
  private readonly bigLeft: CarPrimitive[];
  private readonly bigRight: CarPrimitive[];
  private readonly nativeWheelAssets?: NativeWheelAssets;
  private nativeTyreSelector: number;
  private nativeWheelSelector: number;
  private nativeWheelColor: readonly [number, number, number];
  private nativeWheelColorIndex: number;
  private wheelTriangleCount = 0;
  private readonly bodyTriangleCount: number;
  private bodyGroup: THREE.Group | undefined;
  private paints: { primary: readonly [number, number, number]; secondary: readonly [number, number, number] };

  constructor(carBytes: Uint8Array, tireBytes: Uint8Array, options: CarModelOptions = {}) {
    super();
    this.name = options.name ?? "Q62 player car";
    this.paints = {
      primary: options.primaryPaint ?? [238, 151, 179] as const,
      secondary: options.secondaryPaint ?? [226, 129, 165] as const,
    };
    const assets = decodeQ62Assets(carBytes, tireBytes);
    this.bodyPrimitives = assets.body;
    this.bodyTexture = createTexture(assets.bodyTexture);
    this.tireTextures = Object.freeze(assets.tireTextures.map(createTexture));
    this.tireTexture = this.tireTextures[0] ?? createTexture(assets.tireTexture);
    this.nativeWheelAssets = options.wheelBytes ? decodeNativeWheelAssets(options.wheelBytes) : undefined;
    this.nativeTyreSelector = validNativeTyreSelector(options.nativeTyreSelector ?? 0);
    this.nativeWheelSelector = validNativeWheelSelector(options.nativeWheelSelector ?? 0);
    this.nativeWheelColor = options.wheelColor ? [...options.wheelColor] : [178, 178, 178];
    this.nativeWheelColorIndex = validNativeWheelColorIndex(options.wheelColorIndex ?? 0);
    this.fallbackFrontLeft = assets.frontLeft;
    this.fallbackFrontRight = assets.frontRight;
    this.fallbackRearLeft = assets.rearPair.filter((primitive) => averageX(primitive) < 0);
    this.fallbackRearRight = assets.rearPair.filter((primitive) => averageX(primitive) >= 0);
    this.bigLeft = assets.bigLeft;
    this.bigRight = assets.bigRight;
    const body = this.rebuildBody();
    this.bodyTriangleCount = body.triangles;
    this.rebuildWheels();
    this.partsAccessories.name = `${this.name} selected parts preview`;
    this.add(this.partsAccessories);
    this.syncNativeTyreRideHeight();
    this.setPartsAppearance(defaultPartsAppearance);
    this.triangleCount = this.bodyTriangleCount + this.wheelTriangleCount;
    this.primitiveCount = assets.body.length + this.currentWheelPrimitiveCount();
    const bounds = new THREE.Box3().setFromObject(this);
    this.localBounds = {
      minimum: [bounds.min.x, bounds.min.y, bounds.min.z],
      maximum: [bounds.max.x, bounds.max.y, bounds.max.z],
    };
  }

  setWheelState(steeringAngle: number, spinAngle: number): void {
    for (const steering of this.frontSteering) steering.rotation.y = steeringAngle;
    for (const spinner of this.wheelSpinners) spinner.rotation.x = spinAngle;
  }

  setPaints(primary: readonly [number, number, number], secondary: readonly [number, number, number]): void {
    if (samePaint(this.paints.primary, primary) && samePaint(this.paints.secondary, secondary)) return;
    this.paints = { primary: [...primary], secondary: [...secondary] };
    this.rebuildBody();
  }

  /** Applies the native tyre selector without touching ownership/save state. */
  setNativeTyreAppearance(selector: number): void {
    const nextSelector = validNativeTyreSelector(selector);
    if (this.nativeTyreSelector === nextSelector) return;
    const wasBig = this.nativeTyreSelector === nativeBigTyreSelector;
    const isBig = nextSelector === nativeBigTyreSelector;
    this.nativeTyreSelector = nextSelector;
    if (wasBig !== isBig) {
      this.rebuildWheels();
      this.syncNativeTyreRideHeight();
    }
  }

  get usesNativeBigTyre(): boolean { return this.nativeTyreSelector === nativeBigTyreSelector; }

  /** Applies the original WHEEL.BIN selector and palette colour without touching ownership/save state. */
  setNativeWheelAppearance(selector: number, color: readonly [number, number, number] = this.nativeWheelColor, colorIndex = this.nativeWheelColorIndex): void {
    const nextSelector = validNativeWheelSelector(selector);
    const nextColor = [...color] as readonly [number, number, number];
    const nextColorIndex = validNativeWheelColorIndex(colorIndex);
    if (this.nativeWheelSelector === nextSelector && samePaint(this.nativeWheelColor, nextColor) && this.nativeWheelColorIndex === nextColorIndex) return;
    this.nativeWheelSelector = nextSelector;
    this.nativeWheelColor = nextColor;
    this.nativeWheelColorIndex = nextColorIndex;
    this.rebuildWheels();
  }

  setNativeWheelColor(color: readonly [number, number, number], colorIndex = this.nativeWheelColorIndex): void {
    this.setNativeWheelAppearance(this.nativeWheelSelector, color, colorIndex);
  }

  /**
   * Applies the temporary browser-port parts preview. These deliberately simple
   * meshes make every cosmetic category observable while the original accessory
   * asset formats and RPG ownership rules are still being reconstructed.
   */
  setPartsAppearance(appearance: CarPartsAppearance): void {
    this.clearPartsAccessories();
    const mappedSelector = nativeWheelSelectorForStyle(appearance.wheelStyle);
    if (this.nativeWheelAssets && mappedSelector !== undefined && mappedSelector !== this.nativeWheelSelector) {
      this.nativeWheelSelector = mappedSelector;
      this.rebuildWheels();
    }
    // Big Tyre has an executable-selected authored TIRE.BIN path; never apply the
    // older development wheelScale approximation on top of it.
    if (!this.usesNativeBigTyre) for (const spinner of this.wheelSpinners) spinner.scale.setScalar(appearance.wheelScale);
    // Exact WHEEL.BIN geometry replaces the old browser-only caps for the mapped
    // Normal/Mesh/Spoke selectors. Unmapped Dish remains an explicit dev preview.
    if (!this.nativeWheelAssets || mappedSelector === undefined) this.addWheelCaps(appearance.wheelStyle, appearance.wheelScale);
    this.addHeadlights(appearance.lightColor);
    this.addWing(appearance.wing);
    this.addSpecialPart(appearance.special);
    this.addOption(appearance.option);
    this.addSticker(appearance.sticker);
  }

  dispose(): void {
    this.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
        material.dispose();
      }
    });
    this.removeFromParent();
  }


  private syncNativeTyreRideHeight(): void {
    const lift = nativeTyreBodyLift(this.nativeTyreSelector);
    if (this.bodyGroup) this.bodyGroup.position.y = lift;
    this.partsAccessories.position.y = lift;
  }

  private rebuildWheels(): void {
    for (const root of this.wheelRoots.splice(0)) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      root.removeFromParent();
    }
    this.frontSteering.length = 0;
    this.wheelSpinners.length = 0;

    let triangles = 0;
    if (this.usesNativeBigTyre) {
      // PAL renderer branch at 0x00223188 selects TIRE.BIN sections 4/5 when
      // config flag 0x0400 is active, alternating the authored left/right meshes
      // over the four transforms from table 0x002a1e70. It bypasses WHEEL.BIN.
      const tireTexture = this.tireTextures[this.nativeWheelColorIndex] ?? this.tireTexture;
      triangles += this.createWheel(this.bigLeft, tireTexture, bigFrontLeftTransform, [0, 0, 0], true).triangles;
      triangles += this.createWheel(this.bigRight, tireTexture, bigFrontRightTransform, [0, 0, 0], true).triangles;
      triangles += this.createWheel(this.bigLeft, tireTexture, bigRearLeftTransform, [0, 0, 0], false).triangles;
      triangles += this.createWheel(this.bigRight, tireTexture, bigRearRightTransform, [0, 0, 0], false).triangles;
    } else if (this.nativeWheelAssets) {
      const selected = this.nativeWheelAssets.choices[this.nativeWheelSelector] ?? this.nativeWheelAssets.choices[0] ?? [];
      const primitives = [...this.nativeWheelAssets.common, ...selected];
      for (const [center, steering, mirrorX] of [
        [frontLeftCenter, true, false],
        [frontRightCenter, true, true],
        [rearLeftCenter, false, false],
        [rearRightCenter, false, true],
      ] as const) {
        triangles += this.createNativeWheel(primitives, center, steering, mirrorX).triangles;
      }
    } else {
      const tireTexture = this.tireTextures[this.nativeWheelColorIndex] ?? this.tireTexture;
      triangles += this.createWheel(this.fallbackFrontLeft, tireTexture, frontLeftCenter, [0, 0, 0], true).triangles;
      triangles += this.createWheel(this.fallbackFrontRight, tireTexture, frontRightCenter, [0, 0, 0], true).triangles;
      triangles += this.createWheel(this.fallbackRearLeft, tireTexture, rearLeftCenter, [-rearSourceCenterX, 0, 0], false).triangles;
      triangles += this.createWheel(this.fallbackRearRight, tireTexture, rearRightCenter, [rearSourceCenterX, 0, 0], false).triangles;
    }
    this.wheelTriangleCount = triangles;
    if (this.bodyTriangleCount !== undefined) this.triangleCount = this.bodyTriangleCount + triangles;
    if (this.bodyPrimitives) this.primitiveCount = this.bodyPrimitives.length + this.currentWheelPrimitiveCount();
  }

  private currentWheelPrimitiveCount(): number {
    if (this.usesNativeBigTyre) return 2 * (this.bigLeft.length + this.bigRight.length);
    if (this.nativeWheelAssets) {
      return 4 * (this.nativeWheelAssets.common.length + (this.nativeWheelAssets.choices[this.nativeWheelSelector]?.length ?? 0));
    }
    return this.fallbackFrontLeft.length + this.fallbackFrontRight.length + this.fallbackRearLeft.length + this.fallbackRearRight.length;
  }

  private createNativeWheel(
    primitives: CarPrimitive[],
    center: THREE.Vector3,
    steering: boolean,
    mirrorX: boolean,
  ): { triangles: number } {
    const steeringGroup = new THREE.Group();
    steeringGroup.position.copy(center);
    const spinner = new THREE.Group();
    const built = buildPrimitiveGroup(primitives, this.tireTexture, [0, 0, 0], false, undefined, this.nativeWheelColor);
    if (mirrorX) built.group.scale.x = -1;
    spinner.add(built.group);
    steeringGroup.add(spinner);
    this.add(steeringGroup);
    this.wheelRoots.push(steeringGroup);
    if (steering) this.frontSteering.push(steeringGroup);
    this.wheelSpinners.push(spinner);
    return { triangles: built.triangles };
  }

  private createWheel(
    primitives: CarPrimitive[],
    texture: THREE.Texture,
    center: THREE.Vector3,
    sourceCenter: readonly [number, number, number],
    steering: boolean,
  ): { triangles: number } {
    const steeringGroup = new THREE.Group();
    steeringGroup.position.copy(center);
    const spinner = new THREE.Group();
    const built = buildPrimitiveGroup(primitives, texture, sourceCenter, false);
    spinner.add(built.group);
    steeringGroup.add(spinner);
    this.add(steeringGroup);
    this.wheelRoots.push(steeringGroup);
    if (steering) this.frontSteering.push(steeringGroup);
    this.wheelSpinners.push(spinner);
    return { triangles: built.triangles };
  }

  private rebuildBody(): { group: THREE.Group; triangles: number } {
    if (this.bodyGroup) {
      this.bodyGroup.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      this.bodyGroup.removeFromParent();
    }
    const body = buildPrimitiveGroup(this.bodyPrimitives, this.bodyTexture, [0, 0, 0], true, this.paints);
    body.group.name = `${this.name} body`;
    this.bodyGroup = body.group;
    this.add(body.group);
    this.syncNativeTyreRideHeight();
    return body;
  }

  private addWheelCaps(style: CarPartsAppearance["wheelStyle"], scale: number): void {
    if (style === "normal") return;
    const radius = (style === "dish" ? 0.23 : 0.19) * scale;
    for (const center of [frontLeftCenter, frontRightCenter, rearLeftCenter, rearRightCenter]) {
      const cap = new THREE.Group();
      cap.name = `${style} wheel cap`;
      cap.position.copy(center);
      // The authored tyre mesh extends farther laterally than the recovered
      // wheel centre. Keep the provisional cosmetic face just outside the tyre
      // so equipment changes remain visible in both Q's Factory and outdoor
      // regression captures instead of being depth-hidden inside the rubber.
      cap.position.x += Math.sign(center.x) * 0.23;
      this.partsAccessories.add(cap);

      if (style === "dish") {
        const face = accessoryMesh(new THREE.CylinderGeometry(radius, radius, 0.025, 20), 0x6ec4d6);
        face.rotation.z = Math.PI / 2;
        cap.add(face);
        continue;
      }

      const faceColor = style === "mesh" ? 0xd8a92c : 0xe8edf2;
      const ring = accessoryMesh(new THREE.TorusGeometry(radius * 0.82, 0.022, 6, style === "mesh" ? 12 : 20), faceColor);
      ring.rotation.y = Math.PI / 2;
      cap.add(ring);
      const spokeCount = style === "mesh" ? 8 : 5;
      const spokeColor = style === "mesh" ? 0x8a6820 : 0x59616a;
      for (let spoke = 0; spoke < spokeCount; spoke += 1) {
        const bar = accessoryMesh(new THREE.BoxGeometry(0.024, radius * 1.38, 0.018), spokeColor);
        bar.rotation.x = spoke * Math.PI / spokeCount;
        cap.add(bar);
      }
      const hub = accessoryMesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, 0.03, 12), faceColor);
      hub.rotation.z = Math.PI / 2;
      cap.add(hub);
    }
  }

  private addHeadlights(color: number): void {
    for (const x of [-0.48, 0.48]) {
      const light = accessoryMesh(new THREE.BoxGeometry(0.35, 0.15, 0.035), color);
      light.name = "selected headlight lens";
      light.position.set(x, 0.54, 1.345);
      this.partsAccessories.add(light);
    }
  }

  private addWing(style: CarPartsAppearance["wing"]): void {
    if (style === "none") return;
    const width = style === "flight" ? 2.2 : style === "high" ? 1.72 : 1.48;
    const height = style === "low" ? 0.88 : 1.17;
    const color = style === "flight" ? 0xf1cb39 : 0xd35a7c;
    const blade = accessoryMesh(new THREE.BoxGeometry(width, 0.08, style === "flight" ? 0.42 : 0.25), color);
    blade.name = `${style} selected rear wing`;
    blade.position.set(0, height, -1.19);
    this.partsAccessories.add(blade);
    for (const x of [-width * 0.3, width * 0.3]) {
      const mount = accessoryMesh(new THREE.BoxGeometry(0.08, Math.max(0.18, height - 0.72), 0.08), 0x744152);
      mount.position.set(x, (height + 0.7) * 0.5, -1.18);
      this.partsAccessories.add(mount);
    }
  }

  private addSpecialPart(style: CarPartsAppearance["special"]): void {
    if (style === "none") return;
    if (style === "turbine") {
      const turbine = accessoryMesh(new THREE.CylinderGeometry(0.24, 0.3, 0.42, 16), 0x536b78);
      turbine.name = "selected jet turbine";
      turbine.rotation.x = Math.PI / 2;
      turbine.position.set(0, 0.49, -1.42);
      this.partsAccessories.add(turbine);
      return;
    }
    const hub = accessoryMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 12), 0x665a50);
    hub.name = "selected propeller";
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 0.58, -1.45);
    this.partsAccessories.add(hub);
    for (const angle of [0, Math.PI / 2]) {
      const blade = accessoryMesh(new THREE.BoxGeometry(0.08, 0.82, 0.035), 0xf2d45b);
      blade.position.z = -0.16;
      blade.rotation.z = angle;
      hub.add(blade);
    }
  }

  private addOption(style: CarPartsAppearance["option"]): void {
    if (style === "none") return;
    if (style === "police") {
      const base = accessoryMesh(new THREE.BoxGeometry(0.72, 0.07, 0.12), 0x303640);
      base.name = "selected police light bar";
      base.position.set(0, 1.22, -0.04);
      this.partsAccessories.add(base);
      for (const [x, color] of [[-0.2, 0xef3f48], [0.2, 0x3e80ef]] as const) {
        const lens = accessoryMesh(new THREE.BoxGeometry(0.3, 0.11, 0.15), color);
        lens.position.set(x, 0.08, 0);
        base.add(lens);
      }
      return;
    }
    const board = accessoryMesh(new THREE.BoxGeometry(0.94, 0.48, 0.07), 0xf3df5f);
    board.name = "selected roof billboard";
    board.position.set(0, 1.38, -0.08);
    this.partsAccessories.add(board);
    for (const x of [-0.32, 0.32]) {
      const mount = accessoryMesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), 0x534b44);
      mount.position.set(x, -0.34, 0);
      board.add(mount);
    }
  }

  private addSticker(style: CarPartsAppearance["sticker"]): void {
    if (style === "none") return;
    const colors = { stripe: 0xf4df4a, factory: 0x4aa054, star: 0xffb72f } as const;
    const width = style === "stripe" ? 0.18 : style === "factory" ? 0.62 : 0.4;
    const length = style === "stripe" ? 1.65 : 0.42;
    const sticker = accessoryMesh(new THREE.BoxGeometry(width, 0.018, length), colors[style]);
    sticker.name = `${style} selected body sticker`;
    sticker.position.set(0, 1.115, style === "stripe" ? 0.25 : 0.02);
    if (style === "star") sticker.rotation.y = Math.PI / 4;
    this.partsAccessories.add(sticker);
  }

  private clearPartsAccessories(): void {
    for (const child of [...this.partsAccessories.children]) {
      child.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      child.removeFromParent();
    }
  }
}

function accessoryMesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}

function buildPrimitiveGroup(
  primitives: CarPrimitive[],
  texture: THREE.Texture,
  sourceCenter: readonly [number, number, number],
  carShading: boolean,
  paints: { readonly primary: readonly [number, number, number]; readonly secondary: readonly [number, number, number] } | undefined = {
    primary: [238, 151, 179], secondary: [226, 129, 165],
  },
  wheelPaint?: readonly [number, number, number],
): { group: THREE.Group; triangles: number } {
  const group = new THREE.Group();
  let triangles = 0;
  for (const textured of [false, true]) {
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
    for (const primitive of primitives) {
      if (primitive.primitiveType !== 4 || primitive.vertices.length < 3 || primitive.textured !== textured) continue;
      for (let index = 0; index < primitive.vertices.length - 2; index += 1) {
        const a = (index & 1) === 0 ? index : index + 1;
        const b = (index & 1) === 0 ? index + 1 : index;
        const c = index + 2;
        for (const vertexIndex of [a, b, c]) {
          const vertex = primitive.vertices[vertexIndex];
          if (!vertex) continue;
          positions.push(
            vertex.position[0] - sourceCenter[0],
            vertex.position[1] - sourceCenter[1],
            vertex.position[2] - sourceCenter[2],
          );
          const color = carShading ? shadeCar(vertex, primitive.colorSelection, paints!) : wheelColor(vertex, textured, primitive.colorSelection, wheelPaint);
          colors.push(color[0], color[1], color[2]);
          if (textured) uvs.push(...carTextureUv(vertex.texture));
        }
        triangles += 1;
      }
    }
    if (positions.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    if (textured) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: textured ? texture : null,
      transparent: textured,
      alphaTest: textured ? 0.25 : 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = true;
    group.add(mesh);
  }
  return { group, triangles };
}

/** Three.js DataTexture uses HG2 car V coordinates directly; the XNA V flip must not be inherited here. */
export function carTextureUv(texture: readonly [number, number, number]): readonly [number, number] {
  return [texture[0], texture[1]];
}

function shadeCar(
  vertex: CarVertex,
  selection: number,
  paints: { readonly primary: readonly [number, number, number]; readonly secondary: readonly [number, number, number] },
): readonly [number, number, number] {
  const primaryPaint = paints.primary.map((channel) => channel / 255) as unknown as readonly [number, number, number];
  const secondaryPaint = paints.secondary.map((channel) => channel / 255) as unknown as readonly [number, number, number];
  const paint = selection === 0 ? [1, 1, 1] as const : ((selection & 1) !== 0 ? primaryPaint : secondaryPaint);
  const normal = new THREE.Vector3(...vertex.normal).normalize();
  const primary = new THREE.Vector3(0.707106769, 0.707106769, 0);
  const secondary = new THREE.Vector3(-0.447221488, 0.447221488, -0.774587572);
  const diffuse = 0.44 + 0.66 * Math.max(0, normal.dot(primary)) + 0.275 * Math.max(0, normal.dot(secondary));
  const highlight = 0.66 * vertex.texture[2] * Math.pow(Math.max(0, normal.z), 8);
  return [0, 1, 2].map((axis) => Math.min(1, Math.max(0, ((vertex.color[axis] ?? 0) * (paint[axis] ?? 1) * diffuse + highlight) / 255))) as unknown as readonly [number, number, number];
}

function wheelColor(
  vertex: CarVertex,
  textured: boolean,
  selection: number,
  wheelPaint?: readonly [number, number, number],
): readonly [number, number, number] {
  if (textured) return [1, 1, 1];
  if (!wheelPaint || selection === 0) return [vertex.color[0] / 255, vertex.color[1] / 255, vertex.color[2] / 255];
  return [0, 1, 2].map((axis) => ((vertex.color[axis] ?? 0) / 255) * ((wheelPaint[axis] ?? 255) / 255)) as unknown as readonly [number, number, number];
}

function nativeWheelSelectorForStyle(style: CarPartsAppearance["wheelStyle"]): number | undefined {
  switch (style) {
    case "normal": return 0;
    case "mesh": return 1;
    case "spoke": return 2;
    default: return undefined;
  }
}

function validNativeTyreSelector(selector: number): number {
  if (!Number.isInteger(selector) || selector < 0 || selector > 12) {
    throw new RangeError(`Native tyre selector ${selector} lies outside 0..12.`);
  }
  return selector;
}

function validNativeWheelColorIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= 12) {
    throw new RangeError(`Native wheel-colour index ${index} lies outside 0..11.`);
  }
  return index;
}

function validNativeWheelSelector(selector: number): number {
  if (!Number.isInteger(selector) || selector < 0 || selector >= nativeWheelSelectorCount) {
    throw new RangeError(`Native wheel selector ${selector} lies outside 0..${nativeWheelSelectorCount - 1}.`);
  }
  return selector;
}

function createTexture(decoded: { width: number; height: number; rgba: Uint8Array }): THREE.DataTexture {
  const texture = new THREE.DataTexture(decoded.rgba, decoded.width, decoded.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function averageX(primitive: CarPrimitive): number {
  return primitive.vertices.reduce((sum, vertex) => sum + vertex.position[0], 0) / Math.max(1, primitive.vertices.length);
}

function samePaint(a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
