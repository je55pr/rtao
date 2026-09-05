/** Inputs to PAL support solver 0x0021BDD8. Heights stay in their native units. */
export interface NativeRaceGroundSupportInput {
  /** Y components at car +0x114 + index*16, after the seven collision queries. */
  readonly pointY: readonly number[];
  /** a2: seven signed height words, initially the pre-query Y values *32768. */
  readonly heightWords: readonly number[];
  /** a3: seven float Y values returned through the collision query's a1. */
  readonly queryY: readonly number[];
  /** car +0x1DC / +0x1E0 / +0x1E4. */
  readonly support: readonly number[];
  /** car +0x1E8 / +0x1EC / +0x1F0. */
  readonly supportDelta: readonly number[];
  /** car +0x1C0 / +0x1C4 / +0x1C8. */
  readonly impulses: readonly number[];
  /** t0: caller's transformed velocity/support vector, X and Z components. */
  readonly localX: number;
  readonly localZ: number;
  /** t2, saved at solver stack +0x10. */
  readonly verticalImpulse: number;
  readonly equipmentFlags: number;
  readonly carFlags: number;
  readonly sceneFlags: number;
}

export interface NativeRaceGroundSupportOutput {
  readonly pointY: readonly number[];
  readonly heightWords: readonly number[];
  readonly support: readonly number[];
  readonly supportDelta: readonly number[];
  readonly impulses: readonly number[];
  readonly flags: number;
  /** Calls to 0x0020B898: a1 channel, a2=1 and a3 strength. Host remains external. */
  readonly impactRequests: readonly { channel: number; kind: 1; strength: number }[];
}

const f = Math.fround;
const add = (a: number, b: number): number => (a + b) | 0;
const sub = (a: number, b: number): number => (a - b) | 0;
const div = (a: number, b: number): number => Math.trunc(a / b) | 0;

/** Native integer damping and support limits shared by the two contact branches. */
function supportStep(support: number, delta: number): number {
  const damped = div(Math.imul(delta, 13), 16);
  if (damped !== 0) delta = delta > 0 ? damped : div(Math.imul(delta, 15), 16);
  const target = add(support, delta);
  return target > 8192 ? sub(8192, support) : target < 0 ? -support | 0 : delta;
}

/**
 * Complete scalar support solver 0x0021BDD8..0x0021C27C. The seven collision
 * queries and their transforms are caller-owned; no ground sample is invented.
 */
export function advanceNativeRaceGroundSupport(input: NativeRaceGroundSupportInput): NativeRaceGroundSupportOutput {
  for (const [values, count] of [[input.pointY, 7], [input.heightWords, 7], [input.queryY, 7],
    [input.support, 3], [input.supportDelta, 3], [input.impulses, 3]] as const) {
    if (values.length !== count || values.some(value => !Number.isFinite(value))) throw new RangeError('Invalid native ground-support arrays.');
  }
  const pointY = input.pointY.map(f), heightWords = input.heightWords.map(v => v | 0);
  const support = [...input.support], supportDelta = [...input.supportDelta], impulses = [...input.impulses];
  const impactRequests: { channel: number; kind: 1; strength: number }[] = [];
  const allowance = (input.equipmentFlags & 0x400) !== 0 ? 0xa3d7 : 0x51eb;
  const tilt = [div(-input.localZ | 0, input.localZ > 0 ? 8 : 4),
    add(div(input.localZ, 4), div(input.localX, 8)), add(div(input.localZ, 4), div(-input.localX | 0, 8))];
  let flags = 0;
  for (let i = 0; i < 7; i++) {
    const height = heightWords[i]!;
    if (add(height, allowance) < (Math.trunc(f(pointY[i]! * 32768)) | 0)) {
      pointY[i] = f(f(height) / 32768);
      flags |= 1 << i;
      impulses[i < 5 ? 0 : i - 4] = 0;
    }
    if ((Math.trunc(f(f(input.queryY[i]!) * 32768)) | 0) < add(add(height, allowance), 32768)) flags |= 0x100;
  }
  for (let i = 0; i < 3; i++) {
    const pointHeight = Math.trunc(f(pointY[i]! * 32768)) | 0;
    let difference = sub(pointHeight, heightWords[i]!);
    if (difference < 0) {
      heightWords[i] = sub(heightWords[i]!, impulses[i]!);
      if (impulses[i] === 0 && support[i]! >= (-difference | 0)) supportDelta[i] = difference;
      else supportDelta[i] = supportStep(support[i]!, sub(supportDelta[i]!, div(Math.imul(support[i]!, 89), 4096)));
      support[i] = add(support[i]!, supportDelta[i]!);
      heightWords[i] = add(heightWords[i]!, supportDelta[i]!);
      difference = sub(pointHeight, heightWords[i]!);
      if (difference < 0) {
        impulses[i] = add(impulses[i]!, input.verticalImpulse);
        continue;
      }
      support[i] = add(support[i]!, difference);
      if (((flags >> i) & 1) === 0) heightWords[i] = pointHeight;
    } else {
      heightWords[i] = add(heightWords[i]!, difference);
      const acceleration = sub(add(add(supportDelta[i]!, tilt[i]!), 89), div(Math.imul(support[i]!, 89), 4096));
      supportDelta[i] = supportStep(support[i]!, acceleration);
      support[i] = add(support[i]!, supportDelta[i]!);
    }
    const impulse = impulses[i]!;
    if (impulse >= 179 && (input.sceneFlags & 0x40) === 0 && (input.carFlags & 0x0fb0) === 0) {
      impactRequests.push({ channel: input.carFlags & 1, kind: 1, strength: div(impulse, 16) });
    }
    supportDelta[i] = add(supportDelta[i]!, impulse);
    impulses[i] = 0;
  }
  return { pointY, heightWords, support, supportDelta, impulses, flags, impactRequests };
}
