/**
 * PAL equipment scalars copied into the live car record by 0x00218f70.
 *
 * Engine records are 24 bytes at 0x00301a90; word +0x0c is copied to car
 * +0x214 and consumed by the drive-force routine at 0x00219ea8.
 * Steering records are 16 bytes at 0x003020b4; halfword +0x00 is copied to
 * car +0x242 and multiplies signed steering input at 0x0021b300.
 */
const nativeEngineDriveScalars = new Map<number, number>([
  [0, 1500],
  [1, 1800],
  [2, 2200],
  [5, 3300],
]);

export const nativeSteeringScalars = Object.freeze([64, 96, 128, 160] as const);

export function nativeEngineAccelerationRatio(selector: number): number {
  return nativeRatio(nativeEngineDriveScalars.get(selector), nativeEngineDriveScalars.get(0), "engine", selector);
}

export function nativeSteeringRatio(selector: number): number {
  return nativeRatio(nativeSteeringScalars[selector], nativeSteeringScalars[0], "steering", selector);
}

function nativeRatio(value: number | undefined, normal: number | undefined, category: string, selector: number): number {
  if (!Number.isInteger(selector) || value === undefined || normal === undefined) {
    throw new RangeError(`No recovered native ${category} scalar for selector ${selector}.`);
  }
  return value / normal;
}
