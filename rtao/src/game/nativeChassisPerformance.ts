export interface NativeChassisProfile {
  readonly selector: number;
  readonly name: string;
  readonly price: number;
  readonly weight: number;
}

/**
 * PAL category-3 records at 0x00301db8, stride 16. Record word +0x0c is copied
 * to live car +0x218 by 0x00218f70 and used as a divisor in vehicle physics.
 */
export const nativeChassisProfiles: readonly NativeChassisProfile[] = Object.freeze([
  profile(0, "Normal Chassis", 200, 25),
  profile(1, "Light Chassis", 500, 22),
  profile(2, "Feather Chassis", 1_000, 20),
  profile(3, "Phantom Chassis", 2_000, 18),
  profile(4, "Hyper Chassis", 4_000, 15),
]);

export function nativeChassisProfile(selector: number): NativeChassisProfile {
  if (!Number.isInteger(selector) || selector < 0 || selector >= nativeChassisProfiles.length) {
    throw new RangeError(`Native chassis selector must be an integer from 0 to ${nativeChassisProfiles.length - 1}; got ${selector}.`);
  }
  return nativeChassisProfiles[selector]!;
}

/** PAL live mass source, including Big Tyre's proven +5 mass side effect. */
export function nativeVehicleMass(chassisSelector: number, tyreSelector = 0): number {
  if (!Number.isInteger(tyreSelector) || tyreSelector < 0 || tyreSelector > 12) {
    throw new RangeError(`Native tyre selector must be an integer from 0 to 12; got ${tyreSelector}.`);
  }
  return nativeChassisProfile(chassisSelector).weight + (tyreSelector === 11 ? 5 : 0);
}

/** Relative force response against a Normal Chassis + Normal Tyre baseline. */
export function nativeChassisForceResponseRatio(selector: number, tyreSelector = 0): number {
  return nativeChassisProfiles[0]!.weight / nativeVehicleMass(selector, tyreSelector);
}

function profile(selector: number, name: string, price: number, weight: number): NativeChassisProfile {
  return Object.freeze({ selector, name, price, weight });
}
