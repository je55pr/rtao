/**
 * PAL equipment scalars copied into the live car record by 0x00218f70.
 *
 * Engine records are 24 bytes at 0x00301a90; word +0x0c is copied to car
 * +0x214 and consumed by the drive-force routine at 0x00219ea8.
 * Steering records are 16 bytes at 0x003020a8; halfword +0x0c is copied to
 * car +0x242 and multiplies signed steering input at 0x0021b300.
 */
export const nativeEngineDriveScalars = Object.freeze([
  1500, 1800, 2200, 2600, 2900, 3300,
  3600, 3900, 4200, 4500, 6000, 30000,
] as const);

export const nativeSteeringScalars = Object.freeze([64, 96, 128, 160] as const);

export function nativeEngineDriveScalar(selector: number): number {
  return nativeValue(nativeEngineDriveScalars, "engine", selector);
}

export function nativeEngineAccelerationRatio(selector: number): number {
  return nativeEngineDriveScalar(selector) / nativeEngineDriveScalars[0];
}

export function nativeSteeringRatio(selector: number): number {
  return nativeValue(nativeSteeringScalars, "steering", selector) / nativeSteeringScalars[0];
}

function nativeValue(values: readonly number[], category: string, selector: number): number {
  const value = values[selector];
  if (!Number.isInteger(selector) || value === undefined) {
    throw new RangeError(`No recovered native ${category} scalar for selector ${selector}.`);
  }
  return value;
}
