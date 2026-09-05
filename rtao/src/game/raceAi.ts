import { Elf32AddressSpace } from "../formats/elf32";
import { advanceRaceNavigation, palOrdinaryRaceCount } from "../formats/raceCatalogue";
import type { RaceNavigationCourse, RaceNavigationGate } from "../formats/raceCatalogue";

export const palRaceSpeedProfileTableAddress = 0x002ab988;
export const nativeRaceAiProfileLength = 256;

/** Ordinary, non-team, normal-race selection at 0x00252138–0x00252178. */
export function readOrdinaryRaceSpeedProfiles(bytes: Uint8Array): readonly Uint8Array[] {
  const elf = new Elf32AddressSpace(bytes);
  return Array.from({ length: palOrdinaryRaceCount }, (_, activityId) =>
    elf.bytes(palRaceSpeedProfileTableAddress + activityId * nativeRaceAiProfileLength, nativeRaceAiProfileLength).slice());
}

export interface NativeRaceAiCar {
  readonly nativeX: number;
  readonly nativeZ: number;
  readonly nativeYaw: number;
  /** Signed integer at car +0x1B8, deliberately not labelled as browser m/s. */
  readonly nativeSpeed: number;
  /** Car +0x194; the low two bits narrow the target corridor. */
  readonly configPointerIndex: number;
  readonly currentRecordIndex: number;
  /** Nonzero car +0x19A permits ordinary steering bits. */
  readonly steeringEnabled: boolean;
  /** Car +0x246: optional limiter in the finer, doubled speed bucket. */
  readonly speedLimit: number;
}

export interface NativeRaceAiContext {
  /** Scene +0x28; mode bits 0x0C == 4 permit wrong-way yaw correction. */
  readonly sceneFlags: number;
  /** Dispatcher a3; false for ordinary opponents, potentially true for teammates. */
  readonly updateSpeedFeedback: boolean;
}

export interface NativeRaceAiMemory {
  /** Car +0x258. Team profiles may be mutable; ordinary opponents read PAL's table. */
  readonly speedTargets: Uint8Array;
  /** Car +0x25C. Native setup clears this independent 256-byte car buffer. */
  readonly speedFeedback: Uint8Array;
}

export interface NativeRaceTargetAngles {
  /** Low returned halfword: endpoint B, or midpoint for configuration low bits 2. */
  readonly low: number;
  /** High returned halfword: endpoint A, or midpoint for configuration low bits 1. */
  readonly high: number;
}

export interface NativeRaceAiOutput {
  readonly commandMask: number;
  readonly nativeYaw: number;
  readonly speedBucket: number;
  readonly currentRecordIndex: number;
  readonly lookAheadRecordIndex: number;
  readonly selectorOutput: number;
  readonly targetGateIndex: number;
  readonly targetAngles: NativeRaceTargetAngles;
}

/**
 * Navigation dispatcher + ordinary callback 0x00252BA0, for valid C00–C14
 * navigation. This emits native commands; it does not invent a physics/update
 * bridge or a playable race schedule. The supplied native buffers are mutated.
 */
export function stepOrdinaryRaceAi(
  course: RaceNavigationCourse,
  car: NativeRaceAiCar,
  context: NativeRaceAiContext,
  memory: NativeRaceAiMemory,
): NativeRaceAiOutput {
  const navigation = advanceRaceNavigation(course, car.currentRecordIndex, car.nativeX, car.nativeZ);
  const next = course.records[navigation.returnedRecordIndex]!;
  const angles = nativeRaceTargetAngles(course.gates[next.forwardBoundaryGateIndex]!, car.nativeX, car.nativeZ, car.configPointerIndex);
  const output = nativeRaceAiCommands(car, context, memory, navigation.currentRecordIndex, navigation.returnedRecordIndex, angles);
  return {
    ...output,
    currentRecordIndex: navigation.currentRecordIndex,
    lookAheadRecordIndex: navigation.returnedRecordIndex,
    selectorOutput: navigation.selectorOutput,
    targetGateIndex: next.forwardBoundaryGateIndex,
    targetAngles: angles,
  };
}

/** The integer command/feedback portion at 0x00252C38–0x00253070. */
export function nativeRaceAiCommands(
  car: Pick<NativeRaceAiCar, "nativeSpeed" | "nativeYaw" | "steeringEnabled" | "speedLimit">,
  context: NativeRaceAiContext,
  memory: NativeRaceAiMemory,
  current: number,
  lookAhead: number,
  angles: NativeRaceTargetAngles,
): Pick<NativeRaceAiOutput, "commandMask" | "nativeYaw" | "speedBucket"> {
  if (memory.speedTargets.length !== nativeRaceAiProfileLength || memory.speedFeedback.length !== nativeRaceAiProfileLength) {
    throw new RangeError("Native race AI requires two 256-byte profiles.");
  }
  if (![current, lookAhead, car.speedLimit].every((value) => Number.isInteger(value) && value >= 0 && value <= 255) ||
    ![car.nativeYaw, angles.low, angles.high].every((value) => Number.isInteger(value) && value >= 0 && value <= 65535) ||
    !Number.isInteger(car.nativeSpeed) || (car.nativeSpeed | 0) !== car.nativeSpeed) {
    throw new RangeError("Native race AI values must retain their PAL integer widths.");
  }
  const targets = memory.speedTargets;
  const feedback = memory.speedFeedback;
  const validCandidate = (value: number): boolean => value >= 1 && value <= 62;
  const difference = (index: number, adjustment: number): number => {
    const previous = feedback[index]! & 0x3f;
    const candidate = previous + adjustment;
    return previous !== 0 && validCandidate(candidate) ? targets[index]! - candidate : 0;
  };
  if (context.updateSpeedFeedback) {
    if (targets[lookAhead] !== 0 && (feedback[lookAhead]! & 0xc0) !== 0 && difference(lookAhead, -2) < 0) {
      feedback[lookAhead] = feedback[lookAhead]! & 0xbf;
      if (targets[current]! >= 2 && difference(current, -1) > 0) targets[current] = targets[current]! - 1;
    }
    if ((feedback[lookAhead]! & 0x80) !== 0) {
      feedback[lookAhead] = feedback[lookAhead]! & 0x3f;
      const previous = feedback[current]! & 0x3f;
      const candidate = previous - 1;
      if ((targets[current] === 0 || difference(current, -1) > 0) && previous !== 0 && validCandidate(candidate)) {
        targets[current] = candidate;
      }
    } else if ((feedback[lookAhead]! & 0x40) !== 0) {
      feedback[lookAhead] = feedback[lookAhead]! & 0x3f;
      const candidate = (feedback[current]! & 0x3f) + 1;
      if (difference(current, 1) < 0 && validCandidate(candidate)) targets[current] = candidate;
    }
  }

  // Preserve the native signed 32-bit shift/subtract product before division.
  const speedProduct = Math.imul(car.nativeSpeed, 216);
  const speedBucket = Math.trunc(speedProduct / 0x28000);
  let commandMask = 1;
  const target = targets[current]! & 0x7f;
  if (target !== 0) {
    const difference = speedBucket - target;
    commandMask = difference < 1 ? 1 : difference === 1 ? 0 : 2;
  }
  if (car.speedLimit !== 0) {
    const excess = Math.trunc(speedProduct / 0x14000) - car.speedLimit;
    if (excess > 0) commandMask = excess < 3 ? 0 : 2;
  }

  let nativeYaw = car.nativeYaw;
  const lowDelta = signedAngle(angles.low - nativeYaw);
  const highDelta = signedAngle(angles.high - nativeYaw);
  if (lowDelta > 0) {
    feedback[current] = 0x80;
    if (lowDelta > 0x4000) {
      if ((context.sceneFlags & 0x0c) === 4) nativeYaw = (nativeYaw + 0x100) & 0xffff;
    } else if (car.steeringEnabled) commandMask |= 0x2000;
  } else if (highDelta < 0) {
    feedback[current] = 0x80;
    // PAL tests the LOW angle again here, even in the HIGH-angle branch.
    if (lowDelta < -0x4000) {
      if ((context.sceneFlags & 0x0c) === 4) nativeYaw = (nativeYaw - 0x100) & 0xffff;
    } else if (car.steeringEnabled) commandMask |= 0x8000;
  } else {
    feedback[current] = 0x40;
    if (commandMask === 1) commandMask = 9;
  }
  if (speedBucket >= 2 && speedBucket <= 62) feedback[current] = feedback[current]! | speedBucket;
  return { commandMask, nativeYaw, speedBucket };
}

const f = Math.fround;
const atanHigh = [0.46364760398864746, 0.7853981256484985, 0.9827936887741089, 1.570796251296997];
const atanLow = [5.01215824399992e-9, 3.774894707930798e-8, 3.447321716976148e-8, 7.549789415861596e-8];
const atanPolynomial = [0.3333333432674408, -0.20000000298023224, 0.1428571492433548, -0.1111111044883728,
  0.09090887010097504, -0.07691875845193863, 0.06661073118448257, -0.05833570286631584,
  0.049768779426813126, -0.03653157129883766, 0.016285819932818413];
const bitView = new DataView(new ArrayBuffer(4));
function floatBits(value: number): number { bitView.setFloat32(0, value, true); return bitView.getUint32(0, true); }
function signedAngle(value: number): number { return (value << 16) >> 16; }

/** PAL atan body 0x0027A780, constants at 0x003D4790–0x003D47D8. */
function nativeAtan(value: number): number {
  const bits = floatBits(value);
  const magnitude = bits & 0x7fffffff;
  if (magnitude > 0x507fffff) return bits >>> 31 ? f(-atanHigh[3]! - atanLow[3]!) : f(atanHigh[3]! + atanLow[3]!);
  let x = value;
  let id = -1;
  if (magnitude <= 0x3edfffff) {
    if (magnitude <= 0x30ffffff) return x;
  } else {
    x = Math.abs(x);
    if (magnitude <= 0x3f97ffff) {
      if (magnitude <= 0x3f2fffff) { id = 0; x = f(f(f(x + x) - 1) / f(x + 2)); }
      else { id = 1; x = f(f(x - 1) / f(x + 1)); }
    } else if (magnitude <= 0x401bffff) { id = 2; x = f(f(x - 1.5) / f(f(x * 1.5) + 1)); }
    else { id = 3; x = f(-1 / x); }
  }
  const z = f(x * x);
  const w = f(z * z);
  let even = atanPolynomial[10]!;
  let odd = atanPolynomial[9]!;
  for (let i = 8; i >= 0; i -= 2) even = f(atanPolynomial[i]! + f(w * even));
  for (let i = 7; i >= 1; i -= 2) odd = f(atanPolynomial[i]! + f(w * odd));
  const product = f(x * f(f(z * even) + f(w * odd)));
  if (id < 0) return f(x - product);
  const result = f(atanHigh[id]! - f(f(product - atanLow[id]!) - x));
  return bits >>> 31 ? -result : result;
}

/** PAL atan2 body 0x00278120 for finite navigation coordinates. */
export function nativeRaceAtan2(y: number, x: number): number {
  y = f(y); x = f(x);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("Native race angles require finite coordinates.");
  if (x === 1) return nativeAtan(y);
  const yBits = floatBits(y);
  const xBits = floatBits(x);
  const iy = yBits & 0x7fffffff;
  const ix = xBits & 0x7fffffff;
  const quadrant = (yBits >>> 31) | ((xBits >>> 30) & 2);
  const pi = 3.141592502593994;
  if (iy <= 0x007fffff) return quadrant < 2 ? y : quadrant === 2 ? pi : -pi;
  if (ix <= 0x007fffff) return yBits >>> 31 ? -1.5707963705062866 : 1.5707963705062866;
  const exponentDifference = (iy - ix) >> 23;
  const z = exponentDifference > 60 ? 1.5707964897155762
    : xBits >>> 31 && exponentDifference < -60 ? 0 : nativeAtan(Math.abs(f(y / x)));
  switch (quadrant) {
    case 0: return z;
    case 1: return -z;
    case 2: return f(pi - f(z - 1.5099578831723193e-7));
    default: return f(f(z - 1.5099578831723193e-7) - pi);
  }
}

/** Target helper 0x00252198, including native midpoint/float32 angle arithmetic. */
export function nativeRaceTargetAngles(gate: RaceNavigationGate, nativeX: number, nativeZ: number, configPointerIndex: number): NativeRaceTargetAngles {
  const a = gate.endpointA;
  const b = gate.endpointB;
  const midpoint = { nativeX: f(f(a.nativeX + b.nativeX) * 0.5), nativeZ: f(f(a.nativeZ + b.nativeZ) * 0.5) };
  const angle = (target: typeof a): number => Math.trunc(f(nativeRaceAtan2(f(target.nativeX - f(nativeX)), f(target.nativeZ - f(nativeZ))) * 10430.3779296875)) & 0xffff;
  const selection = configPointerIndex & 3;
  return { low: angle(selection === 2 ? midpoint : b), high: angle(selection === 1 ? midpoint : a) };
}
