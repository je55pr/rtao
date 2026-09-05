/** Scalar command consumers recovered from SLES_513.56. Units remain native. */
const i16 = (n: number): number => (n << 16) >> 16;
const div = (a: number, b: number): number => Math.trunc(a / b) | 0;

export interface NativeGearInput {
  readonly gear: number;
  readonly localForwardSpeed: number;
  readonly commands: number;
  readonly gearWords: readonly number[];
  /** Setter 0x0021DCB8 selects 0x0021DCF8 for nonzero, 0x0021DE30 for zero. */
  readonly highShiftSchedule: boolean;
}

/** 0x0021DCF8 / 0x0021DE30; thresholds are comparisons of native integer quotients. */
export function advanceNativeGear(input: NativeGearInput): number {
  let gear = input.gear;
  if (!Number.isInteger(gear) || gear < 0 || gear > 6 || input.gearWords.length !== 8 ||
    input.gearWords[gear] === 0) throw new RangeError("Invalid native selected gear/table.");
  const mask = input.commands;
  if (mask & 4) return 0;
  if (gear === 0 && (mask & 5) === 1) gear = 1;
  const speed = input.localForwardSpeed << 7;
  const ratio = (index: number): number => {
    const word = input.gearWords[index]!;
    if (!Number.isInteger(word) || word === 0 || i16(word) !== word) throw new RangeError("Invalid native gear word.");
    return div(speed, word);
  };
  if ((mask & 1) !== 0 && gear !== 0) {
    const current = ratio(gear);
    if (current > (input.highShiftSchedule ? 8200 : 5000) && (mask & 2) === 0) {
      return gear < 6 && input.gearWords[gear + 1]! > 0 ? gear + 1 : gear;
    }
    if (gear >= 3 && current < (input.highShiftSchedule ? 5000 : 3000) &&
      ratio(gear - 1) < (input.highShiftSchedule ? 8000 : 4000)) gear--;
  } else if ((mask & 2) !== 0 && gear >= 2 && ratio(gear - 1) < 8000) gear--;
  return gear;
}

export interface NativeSteeringInput {
  readonly commands: number;
  /** car +0x1CE, normally -32..32. */
  readonly accumulator: number;
  /** car +0x1D8, minimum absolute local speed since steering change. */
  readonly speedMemory: number;
  readonly localForwardSpeed: number;
  /** car +0x242, copied from Steering equipment. */
  readonly steeringScalar: number;
}

/** 0x0021B238..0x0021B3AC; includes direction reversal, centering and native curvature. */
export function advanceNativeSteering(input: NativeSteeringInput): { accumulator: number; speedMemory: number; curvature: number } {
  if (!Number.isInteger(input.accumulator) || Math.abs(input.accumulator) > 32 ||
    !Number.isInteger(input.steeringScalar) || input.steeringScalar <= 0 || input.steeringScalar > 32767) {
    throw new RangeError("Invalid native steering accumulator/scalar.");
  }
  const speed = Math.abs(input.localForwardSpeed | 0) | 0;
  let speedMemory = Math.min(input.speedMemory | 0, speed);
  let accumulator = input.accumulator;
  if (input.commands & 0x8000) {
    if (accumulator > 0) { speedMemory = speed; accumulator = -accumulator; }
    else accumulator = Math.max(-32, accumulator - 1);
  } else if (input.commands & 0x2000) {
    if (accumulator < 0) { speedMemory = speed; accumulator = -accumulator; }
    else accumulator = Math.min(32, accumulator + 1);
  } else if (speed !== 0) {
    accumulator = accumulator > 0 ? Math.max(0, accumulator - 4) : Math.min(0, accumulator + 4);
    speedMemory = speed;
  }
  const angle = div(Math.imul(input.steeringScalar, accumulator), 32);
  let curvature = 0;
  if (angle !== 0) {
    let denominator = div(Math.imul(speedMemory, 10430), angle);
    // PAL tests a2 after taking its absolute value, so reverse speed does not invert here.
    if (speed < 0) denominator = -denominator | 0;
    denominator = angle > 0 ? Math.max(0x18000, denominator) : Math.min(-0x18000, denominator);
    curvature = i16(div(0x1b4c14b6, denominator));
  }
  return { accumulator, speedMemory, curvature };
}

export interface NativeBoostInput {
  readonly sceneFlags: number;
  readonly commands: number;
  /** car +0x20E signed halfword. */
  readonly phase: number;
  /** car +0x23C signed word. */
  readonly fuel: number;
  readonly carFlags: number;
}

/** 0x00218DC0. Caller invokes this only when equipment runtime flags contain 0x2000. */
export function advanceNativeBoost(input: NativeBoostInput): { phase: number; fuel: number; speedIncrement: number; soundCues: readonly number[] } {
  let phase = i16(input.phase), fuel = input.fuel | 0, speedIncrement = 0;
  const soundCues: number[] = [];
  const audibleCar = (input.carFlags & 3) !== 0, channel = input.carFlags & 1;
  const stop = (): void => { if (audibleCar) soundCues.push(0x8010 + channel); };
  if ((input.sceneFlags & 0x0c) !== 4) {
    if (phase !== 0) stop();
    phase = 0;
  } else if ((input.commands & 8) !== 0 && fuel >= 100) {
    fuel -= 100;
    if ((input.sceneFlags & 0x40) === 0 && phase === 0 && audibleCar) soundCues.push(16 + channel);
    phase = i16(phase + 1);
    speedIncrement = fuel < 12000 ? 44 : fuel < 30000 ? 89 : 178;
    if (fuel < 12000) phase &= 3;
    else if (fuel < 30000) phase &= 7;
    if (phase === 0) stop();
  } else {
    if ((input.sceneFlags & 0x40) === 0 && phase !== 0) stop();
    phase = phase > 0 ? -2 : phase < 0 ? i16(phase + 1) : 0;
  }
  return { phase, fuel, speedIncrement, soundCues };
}
