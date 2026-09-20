export type NativeChaseVector = readonly [number, number, number];

export interface NativeChasePreset {
  readonly vector00: readonly [number, number, number, number];
  readonly field10: number;
  readonly field14: number;
  readonly field18: number;
  readonly field1c: number;
}

export interface NativeChaseVehiclePose {
  readonly position: NativeChaseVector;
  readonly nativeYaw: number;
  readonly nativeSlip: number;
}

export interface NativeChaseRecenterState {
  readonly active: boolean;
  readonly timer: number;
  readonly angle: number;
}

export interface NativeChaseCameraState {
  readonly position: NativeChaseVector;
  readonly target: NativeChaseVector;
  readonly lagVelocity: NativeChaseVector;
  readonly ready: boolean;
  readonly presetIndex: number;
  readonly slipInput: number;
  readonly recenter: NativeChaseRecenterState;
}
export interface NativeChaseAdvanceOptions {
  readonly presetIndex?: number;
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
  return {
    position: [0, 0, 0],
    target: [0, 0, 0],
    lagVelocity: [0, 0, 0],
    ready: false,
    presetIndex,
    slipInput: 0,
    recenter: { active: false, timer: 0, angle: 0 },
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

export function resetNativeChaseLag(state: NativeChaseCameraState): NativeChaseCameraState {
  return {
    ...state,
    lagVelocity: [0, 0, 0],
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
  presetIndex: number,
): NativeChaseRecenterState {
  if (!recenter.active) return recenter;
  const preset = nativeChasePreset(presetIndex);
  if (recenter.timer >= 0x80) return { active: false, timer: 0, angle: recenter.angle };

  let angle = recenter.angle;
  if (preset.field1c === 0) {
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
  return resetNativeChaseLag({
    ...state,
    presetIndex,
    slipInput: 0,
  });
}
export function advanceNativeChaseCamera(
  state: NativeChaseCameraState,
  vehicle: NativeChaseVehiclePose,
  options: NativeChaseAdvanceOptions = {},
): NativeChaseCameraState {
  const presetIndex = options.presetIndex ?? state.presetIndex;
  assertPresetIndex(presetIndex);
  const desired = projectNativeChaseFollowTarget(vehicle, presetIndex);
  const slipInput = nativeChaseSlipInput(vehicle.nativeSlip, presetIndex);
  const recenter = advanceNativeChaseRecenter(state.recenter, presetIndex);

  if (!state.ready || presetIndex !== state.presetIndex) {
    return {
      position: desired.position,
      target: desired.target,
      lagVelocity: [0, 0, 0],
      ready: true,
      presetIndex,
      slipInput,
      recenter,
    };
  }

  const stepped = state.position.map((value, index) =>
    stepNativeChaseLag(value, state.lagVelocity[index] ?? 0, desired.position[index] ?? 0)
  );
  return {
    position: stepped.map((entry) => entry.value) as unknown as NativeChaseVector,
    target: desired.target,
    lagVelocity: stepped.map((entry) => entry.velocity) as unknown as NativeChaseVector,
    ready: true,
    presetIndex,
    slipInput,
    recenter,
  };
}

/**
 * Native-space follow-helper target derived from the recovered vehicle-relative
 * preset vector. This is controller state, not the final 0x00220458 camera
 * output. Renderer handedness conversion must happen after final output.
 */
export function projectNativeChaseFollowTarget(
  vehicle: NativeChaseVehiclePose,
  presetIndex: number,
): { readonly position: NativeChaseVector; readonly target: NativeChaseVector } {
  const preset = nativeChasePreset(presetIndex);
  const yaw = nativeChaseYawRadians(vehicle.nativeYaw);
  const sine = Math.sin(yaw);
  const cosine = Math.cos(yaw);
  const [localX, localY, localZ] = preset.vector00;
  const [x, y, z] = vehicle.position;
  return {
    position: [
      x + localX * cosine + localZ * sine,
      y + localY,
      z - localX * sine + localZ * cosine,
    ],
    target: [x, y, z],
  };
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
