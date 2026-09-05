import { Elf32AddressSpace } from '../formats/elf32';
import type { NativeRaceCollisionPoint } from './nativeRaceCollision';
import { advanceNativeRaceGroundSupport } from './nativeRaceGroundSupport';

type Vec3 = readonly [number, number, number];
type Point = NativeRaceCollisionPoint;

export interface NativeRaceContactData {
  readonly probes: readonly Point[];
  readonly positionDivisor: number;
  readonly bigTyreThreshold: number;
  readonly yawScale: number;
}

/** PAL 0x21C388 and GP-relative constants; original bytes remain caller-owned. */
export function readNativeRaceContactData(executable: Uint8Array): NativeRaceContactData {
  const elf = new Elf32AddressSpace(executable), gp = 0x3dd7f0;
  return {
    probes: Array.from({ length: 7 }, (_, i) => [0, 4, 8, 12].map(j => elf.f32(0x2a1dd0 + i * 16 + j)) as unknown as Point),
    positionDivisor: elf.f32(gp - 32492), bigTyreThreshold: elf.f32(gp - 32488), yawScale: elf.f32(gp - 32484),
  };
}

export interface NativeRaceContactState {
  readonly position: Vec3;
  /** Previously stored car +0x94, distinct from newly extracted position Y. */
  readonly referenceY: number;
  readonly support: readonly number[];
  readonly supportDelta: readonly number[];
  readonly impulses: readonly number[];
  readonly unsupportedTicks: number;
  readonly runtimeFlags: number;
  /** Signed car +0x213. Its physical meaning is not assumed here. */
  readonly specialState: number;
  readonly yaw: number;
}

export interface NativeRaceContactInput {
  readonly state: NativeRaceContactState;
  readonly equipmentFlags: number;
  /** Flags through global 0x01824270, NOT necessarily this car's equipment. */
  readonly globalEquipmentFlags: number;
  readonly carFlags: number;
  readonly sceneFlags: number;
  readonly sceneByte0B: number;
  readonly sceneCommands: readonly [number, number];
  readonly localX: number;
  readonly localZ: number;
  /** a3 vector +8 and +12, separate from the a2 support vector. */
  readonly responseZ: number;
  readonly responseW: number;
  readonly verticalImpulse: number;
  readonly commands: number;
}

export interface NativeRaceContactDependencies {
  /** Required boundary: 0x275770 then 0x275990 using the PRE-update car matrix.
   * No identity/default transform is supplied by production code. */
  readonly transformProbe: (probe: Point, translation: Point, index: number) => Point;
  /** Selected query at GP-15968. Ordinary courses use NativeRaceCollisionSampler.query. */
  readonly query: (point: Point, sector: number, index: number) => {
    readonly point: Point; readonly flags: number; readonly ceilingY: number;
  };
}

const f = Math.fround;
const add = (a: number, b: number): number => (a + b) | 0;
const sub = (a: number, b: number): number => (a - b) | 0;
const div = (a: number, b: number): number => Math.trunc(a / b) | 0;

/**
 * Scalar caller 0x21C280..0x21C864: seven queries, support/history, height and
 * flag writes, and inputs to the orientation stage. VU transforms, cross/
 * normalization, 0x21A368, matrix constructors and inverse are composed by
 * advanceNativeRaceContact in nativeRaceMath. Playable movement remains gated.
 */
export function produceNativeRaceContacts(input: NativeRaceContactInput, data: NativeRaceContactData,
  dependencies: NativeRaceContactDependencies) {
  if (data.probes.length !== 7) throw new RangeError('Native contact requires seven authored probes.');
  const state = input.state;
  const [x, y, z] = state.position.map(n => n | 0);
  const translation = [f(f(add(x!, (z! & 0x02000000) >> 1) & 0x01ffffff) / data.positionDivisor),
    f(f(y!) / data.positionDivisor), f(f(z! & 0x01ffffff) / data.positionDivisor), 1] as const;
  const parity = div(z!, 0x02000000) & 1;
  const sector = ((div(x!, 0x01000000) - parity) & 2) + parity;
  const points: Point[] = [], heightWords: number[] = [], queryY: number[] = [], surfaces: number[] = [];
  let missFlags = 0;
  for (let i = 0; i < 7; i++) {
    const point = dependencies.transformProbe(data.probes[i]!, translation, i).map(f) as unknown as Point;
    heightWords.push(Math.trunc(f(point[1] * 32768)) | 0);
    const hit = dependencies.query(point, sector, i);
    points.push(hit.point.map(f) as unknown as Point);
    queryY.push(f(hit.ceilingY)); surfaces.push(hit.flags | 0);
    if ((hit.flags | 0) === -1) missFlags |= 1 << i;
  }
  const support = advanceNativeRaceGroundSupport({ ...input, ...state,
    pointY: points.map(p => p[1]), heightWords, queryY,
    verticalImpulse: (input.equipmentFlags & 8) !== 0 ? input.verticalImpulse : add(input.responseW, input.verticalImpulse),
  });
  for (let i = 0; i < 7; i++) points[i] = [points[i]![0], support.pointY[i]!, points[i]![2], points[i]![3]];
  const flags = missFlags | support.flags;
  const [h0, h1, h2] = support.heightWords;
  const weightedHeight = div(add(Math.imul(h0!, 33), Math.imul(div(add(h1!, h2!), 2), 34)), 67);
  let positionY = div(weightedHeight << 4, 25);
  const impulses = [...support.impulses];
  let runtimeFlags = state.runtimeFlags | 0, specialState = state.specialState << 24 >> 24;
  const soundRequests: number[] = [];
  if (!(flags & 0x100) && input.sceneByte0B !== 0 && (input.carFlags & 3)) {
    const command = input.sceneCommands[input.carFlags & 1]!;
    if (command & 0x1000) positionY = add(positionY, -4096);
    else if (command & 0x4000) positionY = add(positionY, 20971);
  }
  const threshold = (input.globalEquipmentFlags & 0x400) ? data.bigTyreThreshold : 0.5;
  const referenceY = f(state.referenceY), extraY = points[0]![3];
  if (referenceY < f(extraY - threshold)) {
    if (input.equipmentFlags & 0x100) {
      if (!(flags & 0x100)) {
        if (input.responseZ > 8192) {
          positionY = add(positionY, 1024);
          for (let i = 0; i < 3; i++) if (impulses[i] !== 0) impulses[i] = 1;
        } else positionY = add(positionY, div(input.responseZ, 8));
      }
    } else if (specialState <= 0) {
      for (let i = 0; i < 3; i++) impulses[i] = div(impulses[i]!, 2);
    }
    specialState = 1;
    surfaces[0] = surfaces[1] = surfaces[2] = (surfaces[0]! & 0x3000) | 0x100651;
  } else if (referenceY < extraY) {
    runtimeFlags |= 0x40;
    if (specialState === 0 && (input.carFlags & 3) && !(input.sceneFlags & 0x48)) soundRequests.push(40);
    specialState = -1;
  } else {
    if (specialState !== 0) runtimeFlags |= 0x40;
    specialState = 0;
  }
  let unsupportedTicks = 0;
  if ((support.support[0]! | support.support[1]! | support.support[2]!) === 0) {
    unsupportedTicks = add(state.unsupportedTicks, 1);
    if ((state.unsupportedTicks | 0) >= 65) {
      runtimeFlags |= 1;
      impulses.fill(div(add(add(impulses[0]!, impulses[1]!), impulses[2]!), 3));
    }
  }
  let adjustmentMode = (runtimeFlags & 1) | ((flags & 0x78) ? 1 : 0);
  if (input.equipmentFlags & 8) {
    if (input.commands & 0x8000) adjustmentMode = 64;
    if (input.commands & 0x2000) adjustmentMode = 128;
  }
  const yawRadians = f(f(f(state.yaw << 16 >> 16) * data.yawScale) * (1 / 32768));
  return {
    state: { ...state, position: [x!, positionY, z!] as Vec3, support: support.support,
      supportDelta: support.supportDelta, impulses, unsupportedTicks, runtimeFlags: runtimeFlags >>> 0, specialState },
    points, heightWords: support.heightWords, queryY, surfaces, missFlags, supportFlags: support.flags,
    flags: flags >> 3, impactRequests: support.impactRequests, soundRequests,
    orientation: {
      edgeA: [f(points[2]![0] - points[0]![0]), f(f(sub(h2!, h0!)) * (1 / 32768)), f(points[2]![2] - points[0]![2])] as Vec3,
      edgeB: [f(points[1]![0] - points[2]![0]), f(f(sub(h1!, h2!)) * (1 / 32768)), f(points[1]![2] - points[2]![2])] as Vec3,
      yawRadians, adjustmentMode,
    },
  };
}
