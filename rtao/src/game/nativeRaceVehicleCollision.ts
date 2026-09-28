import { Elf32AddressSpace } from "../formats/elf32";
import type { NativeRaceFrameState } from "./nativeRaceFrame";
import {
  transformNativeRaceVector,
  type NativeRaceVector,
} from "./nativeRaceMath";

export interface NativeRaceVehicleCollisionData {
  readonly lateralMinimum: number;
  readonly lateralMaximum: number;
  readonly forwardMinimum: number;
  readonly forwardMaximum: number;
  readonly broadphaseDistance: number;
  readonly directSeparationDistance: number;
  readonly minimumSeparationScale: number;
}

export interface NativeRaceVehicleCollisionCar {
  readonly carIndex: number;
  readonly state: NativeRaceFrameState;
}

export interface NativeRaceVehicleCollisionEvent {
  readonly firstCarIndex: number;
  readonly secondCarIndex: number;
  readonly distance: number;
  readonly firstContainsSecondPoint: boolean;
  readonly secondContainsFirstPoint: boolean;
}

export interface NativeRaceVehicleCollisionResult {
  readonly cars: readonly NativeRaceVehicleCollisionCar[];
  readonly contacts: readonly NativeRaceVehicleCollisionEvent[];
}

const f = Math.fround;
const gp = 0x3dd7f0;
const fixedScale = 32768;

// 0x21C280 writes seven transformed/query-adjusted contact probes starting at
// car +0x110. 0x218470 consumes probes 3..6 at +0x140..+0x170, so the dynamic
// pair task must use the retained frame snapshot rather than renderer wheel centres.
export function readNativeRaceVehicleCollisionData(executable: Uint8Array): NativeRaceVehicleCollisionData {
  const elf = new Elf32AddressSpace(executable);
  return {
    lateralMinimum: elf.f32(gp - 32668),
    lateralMaximum: elf.f32(gp - 32664),
    forwardMinimum: -1.5,
    forwardMaximum: 1.5,
    broadphaseDistance: elf.f32(gp - 32636),
    directSeparationDistance: elf.f32(gp - 32632),
    minimumSeparationScale: elf.f32(gp - 32628),
  };
}

export function nativeRaceVehicleCollisionHardpoints(state: NativeRaceFrameState): readonly NativeRaceVector[] {
  if (state.collisionHardpoints.length !== 4) {
    throw new RangeError("Native vehicle collision requires four retained contact hardpoints.");
  }
  return state.collisionHardpoints;
}

function containsHardpoint(
  point: NativeRaceVector,
  target: NativeRaceFrameState,
  data: NativeRaceVehicleCollisionData,
): boolean {
  const relative = point.map((value, lane) =>
    f(value - target.coordinates[lane]!)) as unknown as NativeRaceVector;
  const local = transformNativeRaceVector(target.inverse, relative);
  return local[0] >= data.lateralMinimum
    && local[0] <= data.lateralMaximum
    && local[2] >= data.forwardMinimum
    && local[2] <= data.forwardMaximum;
}

function fixedDeltaAndDistance(
  later: NativeRaceFrameState,
  earlier: NativeRaceFrameState,
): { readonly delta: readonly [number, number, number]; readonly distance: number } {
  const words = [0, 1, 2].map((axis) =>
    ((later.contact.position[axis]! - earlier.contact.position[axis]!) | 0));
  const delta = words.map((word) => f(f(word) / fixedScale)) as [number, number, number];
  const xx = f(delta[0] * delta[0]);
  const yy = f(delta[1] * delta[1]);
  const zz = f(delta[2] * delta[2]);
  const distance = f(Math.sqrt(Math.abs(f(f(xx + yy) + zz))));
  return { delta, distance };
}

function mipsCvtWs(value: number): number {
  const single = f(value);
  const floor = Math.floor(single);
  const fraction = single - floor;
  const rounded = fraction < 0.5 ? floor
    : fraction > 0.5 ? floor + 1
      : (floor & 1) === 0 ? floor : floor + 1;
  if (rounded < -0x80000000 || rounded > 0x7fffffff) {
    throw new RangeError("Native vehicle collision position exceeded signed 32-bit range.");
  }
  return rounded | 0;
}

function nativeAverageWord(a: number, b: number): number {
  const sum = (a + b) | 0;
  return ((sum + (sum >>> 31)) | 0) >> 1;
}

function respondPair(
  earlier: NativeRaceFrameState,
  later: NativeRaceFrameState,
  delta: readonly [number, number, number],
  distance: number,
  data: NativeRaceVehicleCollisionData,
): readonly [NativeRaceFrameState, NativeRaceFrameState] {
  let scale = f(f(data.directSeparationDistance - distance) / distance);
  if (scale < 0) scale = data.minimumSeparationScale;

  const displacement = delta.map((component) =>
    f(f(component * scale) * fixedScale));
  const earlierPosition = earlier.contact.position.map((word, axis) =>
    mipsCvtWs(f(f(word) - displacement[axis]!))) as [number, number, number];
  const laterPosition = later.contact.position.map((word, axis) =>
    mipsCvtWs(f(f(word) + displacement[axis]!))) as [number, number, number];

  const sharedX = nativeAverageWord(earlier.velocity[0], later.velocity[0]);
  const sharedZ = nativeAverageWord(earlier.velocity[2], later.velocity[2]);
  const earlierVelocity: NativeRaceVector = [sharedX, earlier.velocity[1], sharedZ, earlier.velocity[3]];
  const laterVelocity: NativeRaceVector = [sharedX, later.velocity[1], sharedZ, later.velocity[3]];
  return [
    {
      ...earlier,
      contact: { ...earlier.contact, position: earlierPosition },
      velocity: earlierVelocity,
    },
    {
      ...later,
      contact: { ...later.contact, position: laterPosition },
      velocity: laterVelocity,
    },
  ];
}

/**
 * PAL 0x218888..0x218B14. This is the global dynamic-car task installed after
 * car construction, not part of the static terrain/contact frame.
 */
export function advanceNativeRaceVehicleCollisions(
  inputCars: readonly NativeRaceVehicleCollisionCar[],
  sceneFlags: number,
  data: NativeRaceVehicleCollisionData,
): NativeRaceVehicleCollisionResult {
  const cars = [...inputCars]
    .sort((a, b) => a.carIndex - b.carIndex)
    .map((car) => ({ ...car, state: car.state }));
  if ((sceneFlags & 0x48000) !== 0) return { cars, contacts: [] };

  const seen = new Set<number>();
  for (const car of cars) {
    if (!Number.isInteger(car.carIndex) || car.carIndex < 0 || car.carIndex > 23 || seen.has(car.carIndex)) {
      throw new RangeError("Native vehicle collisions require unique car slots 0..23.");
    }
    seen.add(car.carIndex);
  }
  if (cars.length > 24) throw new RangeError("Native vehicle collision field exceeds 24 car slots.");

  // PAL updates +0xA0/+0xF0 in-place during the pair walk, while the four
  // +0x140 hardpoints are a pre-existing snapshot and are not regenerated.
  const hardpoints = new Map(cars.map((car) => [
    car.carIndex,
    nativeRaceVehicleCollisionHardpoints(car.state),
  ] as const));
  const contacts: NativeRaceVehicleCollisionEvent[] = [];

  for (let firstIndex = 0; firstIndex < cars.length - 1; firstIndex += 1) {
    const first = cars[firstIndex]!;
    if ((first.state.carFlags & 0x7fff) === 0) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < cars.length; secondIndex += 1) {
      const second = cars[secondIndex]!;
      if ((second.state.carFlags & 0x7fff) === 0) continue;

      const { delta, distance } = fixedDeltaAndDistance(second.state, first.state);
      if (distance === 0 || !(distance < data.broadphaseDistance)) continue;
      const secondPoints = hardpoints.get(second.carIndex)!;
      const firstPoints = hardpoints.get(first.carIndex)!;
      const firstContainsSecondPoint = secondPoints.some((point) =>
        containsHardpoint(point, first.state, data));
      const secondContainsFirstPoint = !firstContainsSecondPoint && firstPoints.some((point) =>
        containsHardpoint(point, second.state, data));
      if (!firstContainsSecondPoint && !secondContainsFirstPoint) continue;

      const [nextFirst, nextSecond] = respondPair(first.state, second.state, delta, distance, data);
      first.state = nextFirst;
      second.state = nextSecond;
      contacts.push({
        firstCarIndex: first.carIndex,
        secondCarIndex: second.carIndex,
        distance,
        firstContainsSecondPoint,
        secondContainsFirstPoint,
      });
    }
  }
  return { cars, contacts };
}
