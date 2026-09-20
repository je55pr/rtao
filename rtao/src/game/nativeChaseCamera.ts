export type NativeChaseVector = readonly [number, number, number];

export interface NativeChasePreset {
  readonly vector00: readonly [number, number, number, number];
  readonly field10: number;
  readonly field14: number;
  readonly field18: number;
  readonly field1c: number;
}

export interface NativeChaseVehicleInputs {
  /** Direct car +0x1D6 contribution used to populate camera state +0x1A. */
  readonly nativeSlip: number;
}

export interface NativeChaseLagAxisState {
  readonly value: number;
  readonly velocity: number;
}

export interface NativeChaseRecenterState {
  readonly active: boolean;
  readonly timer: number;
  readonly angle: number;
}

export interface NativeChaseCameraState {
  /** Per-player +0x00/+0x04 lag pair used by the camera-world helper. */
  readonly lagX: NativeChaseLagAxisState;
  /** Per-player +0x08/+0x0C lag pair used by the camera-world helper. */
  readonly lagZ: NativeChaseLagAxisState;
  /** Camera descriptor +0x00..+0x0F local offset. */
  readonly localOffset: readonly [number, number, number, number];
  /** Camera descriptor +0x10 focal/projection parameter. */
  readonly focal: number;
  /** Camera descriptor +0x14 signed pitch term. */
  readonly pitchAngle: number;
  /** Camera descriptor +0x18 signed rotation term retained from the copied descriptor. */
  readonly rotation18: number;
  /** Camera descriptor +0x1C mode flags. */
  readonly modeFlags: number;
  readonly presetIndex: number;
  /** Camera descriptor +0x1A signed slip contribution. */
  readonly slipInput: number;
  /** Camera descriptor +0x16 timed relative-yaw/recenter term. */
  readonly recenter: NativeChaseRecenterState;
}
export interface NativeChaseAdvanceOptions {
  readonly presetIndex?: number;
  /** Already-resolved native +0x14 target; upstream equipment/scene selection stays separate. */
  readonly pitchTarget?: number;
}

export const nativeChasePi = Math.fround(3.1415927410125732);
export const nativeChaseLagStep = Math.fround(0.0010000000474974513);

export const nativeChasePresets: readonly NativeChasePreset[] = [
  { vector00: [0, 2, -7, 1], field10: 500, field14: 0x380, field18: 0, field1c: 0 },
  { vector00: [0, 1.5, -0.25, 1], field10: 500, field14: 0, field18: 0, field1c: 1 },
  { vector00: [0, Math.fround(1.2), -7, 1], field10: 461, field14: 0x600, field18: 0, field1c: 0 },
  { vector00: [0, 1.5, -0.25, 1], field10: 500, field14: 0, field18: 0, field1c: 1 },
  { vector00: [0, 2.5, -7, 1], field10: 500, field14: 0x580, field18: 0, field1c: 0 },
  { vector00: [0, Math.fround(2.2), 0, 1], field10: 500, field14: 0, field18: 0, field1c: 1 },
  { vector00: [0, Math.fround(1.6), -7, 1], field10: 461, field14: 0x800, field18: 0, field1c: 0 },
  { vector00: [0, 2, -0.25, 1], field10: 500, field14: 0, field18: 0, field1c: 1 },
  { vector00: [0, 2, Math.fround(-9.3), 1], field10: 500, field14: 0xd80, field18: 0, field1c: 0 },
  { vector00: [0, Math.fround(1.2), Math.fround(-10.8), 1], field10: 461, field14: 0x880, field18: 0, field1c: 0 },
];
export function createNativeChaseCameraState(
  presetIndex: number,
): NativeChaseCameraState {
  assertPresetIndex(presetIndex);
  const preset = nativeChasePreset(presetIndex);
  return {
    lagX: { value: 0, velocity: 0 },
    lagZ: { value: 0, velocity: 0 },
    localOffset: preset.vector00,
    focal: preset.field10,
    pitchAngle: signed16(preset.field14),
    rotation18: signed16(preset.field18),
    modeFlags: preset.field1c,
    presetIndex,
    slipInput: signed16(preset.field18 >>> 16),
    recenter: { active: false, timer: 0, angle: signed16(preset.field14 >>> 16) },
  };
}

export function nativeChaseYawRadians(nativeYaw: number): number {
  const signedYaw = signed16(nativeYaw);
  return Math.fround(Math.fround(signedYaw * nativeChasePi) / 32768);
}

export function nativeChaseSlipInput(nativeSlip: number, presetIndex: number): number {
  const preset = nativeChasePreset(presetIndex);
  return preset.field1c === 0 ? signed16(-signed16(nativeSlip)) : 0;
}

export function stepNativeChaseLag(
  value: number,
  velocity: number,
  target: number,
): { readonly value: number; readonly velocity: number } {
  const current = Math.fround(value);
  let nextVelocity = Math.fround(velocity);
  const destination = Math.fround(target);
  const error = Math.fround(destination - current);
  if (error > 0) {
    nextVelocity = nextVelocity < nativeChaseLagStep
      ? nativeChaseLagStep
      : Math.fround(nextVelocity + nativeChaseLagStep);
    if (nextVelocity > error) nextVelocity = error;
  } else if (error < 0) {
    const negativeStep = Math.fround(-nativeChaseLagStep);
    nextVelocity = nextVelocity > negativeStep
      ? negativeStep
      : Math.fround(nextVelocity + negativeStep);
    if (nextVelocity < error) nextVelocity = error;
  }
  return {
    value: Math.fround(current + nextVelocity),
    velocity: nextVelocity,
  };
}

/** Controller +0x08 == 0 clears all four words in the per-player lag block. */
export function resetNativeChaseLag(state: NativeChaseCameraState): NativeChaseCameraState {
  return {
    ...state,
    lagX: { value: 0, velocity: 0 },
    lagZ: { value: 0, velocity: 0 },
  };
}

export function beginNativeChaseRecenter(state: NativeChaseCameraState): NativeChaseCameraState {
  return {
    ...state,
    recenter: { active: true, timer: 0, angle: state.recenter.angle },
  };
}
export function advanceNativeChaseRecenter(
  recenter: NativeChaseRecenterState,
  modeFlags: number,
): NativeChaseRecenterState {
  if (!recenter.active) return recenter;
  if (recenter.timer >= 0x80) return { active: false, timer: 0, angle: recenter.angle };

  let angle = recenter.angle;
  if (modeFlags === 0) {
    angle = recenter.timer < 0x40
      ? -0x8000
      : signed16(angle + 0x200);
  }
  return {
    active: true,
    timer: recenter.timer + 1,
    angle,
  };
}

export function selectNativeChasePreset(
  state: NativeChaseCameraState,
  presetIndex: number,
): NativeChaseCameraState {
  assertPresetIndex(presetIndex);
  const preset = nativeChasePreset(presetIndex);
  return resetNativeChaseLag({
    ...state,
    localOffset: preset.vector00,
    focal: preset.field10,
    pitchAngle: signed16(preset.field14),
    rotation18: signed16(preset.field18),
    modeFlags: preset.field1c,
    presetIndex,
    slipInput: signed16(preset.field18 >>> 16),
    recenter: { active: false, timer: 0, angle: signed16(preset.field14 >>> 16) },
  });
}
export function advanceNativeChaseCamera(
  state: NativeChaseCameraState,
  vehicle: NativeChaseVehicleInputs,
  options: NativeChaseAdvanceOptions = {},
): NativeChaseCameraState {
  const presetIndex = options.presetIndex ?? state.presetIndex;
  assertPresetIndex(presetIndex);
  const base = presetIndex === state.presetIndex
    ? state
    : selectNativeChasePreset(state, presetIndex);
  return {
    ...base,
    pitchAngle: options.pitchTarget === undefined
      ? base.pitchAngle
      : stepNativeChaseAngle(base.pitchAngle, options.pitchTarget),
    presetIndex,
    slipInput: base.modeFlags === 0 ? signed16(-signed16(vehicle.nativeSlip)) : 0,
    recenter: advanceNativeChaseRecenter(base.recenter, base.modeFlags),
  };
}

/** Camera descriptor +0x14 converges by at most 0x80 signed angle units per update. */
export function stepNativeChaseAngle(value: number, target: number): number {
  const current = signed16(value);
  const destination = signed16(target);
  const delta = destination - current;
  if (delta > 0x80) return signed16(current + 0x80);
  if (delta < -0x80) return signed16(current - 0x80);
  return destination;
}

/**
 * Advances one recovered +0x00/+0x04 or +0x08/+0x0C lag pair toward the
 * camera-helper target. The target itself belongs to 0x0021EAC8 vehicle/world
 * inputs and must not be replaced with the browser preset eye.
 */
export function advanceNativeChaseLagAxis(
  axis: NativeChaseLagAxisState,
  target: number,
): NativeChaseLagAxisState {
  return stepNativeChaseLag(axis.value, axis.velocity, target);
}

export function nativeChasePreset(index: number): NativeChasePreset {
  assertPresetIndex(index);
  return nativeChasePresets[index]!;
}

function assertPresetIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= nativeChasePresets.length) {
    throw new RangeError(`Native chase-camera preset index must be 0..${nativeChasePresets.length - 1}; got ${index}.`);
  }
}

function signed16(value: number): number {
  return (value << 16) >> 16;
}
