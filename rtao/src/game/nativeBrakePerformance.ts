export interface NativeBrakeProfile {
  readonly selector: number;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly curve: readonly number[];
}

/** Native brake curve length and saturation point in vehicle updates. */
export const nativeBrakeHoldUpdates = 32;
export const nativeBrakeMaximumForceUnits = 10_000;

/**
 * PAL brake records at 0x00302190, stride 44. Each record contains name and
 * description pointers, price, then the 32 unsigned curve bytes consumed by
 * 0x0021b3b0. The consumer increments the hold counter before reading a byte.
 */
export const nativeBrakeProfiles: readonly NativeBrakeProfile[] = Object.freeze([
  profile(0, "Normal Pad", "Standard", 500,
    [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]),
  profile(1, "Soft Pad", "Good for quick braking", 1_000,
    [4, 7, 10, 12, 14, 16, 17, 19, 20, 21, 22, 23, 24, 25, 25, 26, 26, 27, 28, 28, 28, 29, 29, 30, 30, 30, 31, 31, 31, 32, 32, 32]),
  profile(2, "Hard Pad", "Helps for all around cornering", 1_500,
    [0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 15, 16, 18, 20, 22, 25, 28, 32]),
  profile(3, "Metal Pad", "Stops on a dime", 2_000,
    [1, 1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 10, 13, 16, 20, 22, 24, 26, 27, 28, 29, 29, 30, 30, 31, 31, 31, 32, 32, 32]),
]);

export function nativeBrakeProfile(selector: number): NativeBrakeProfile {
  if (!Number.isInteger(selector) || selector < 0 || selector >= nativeBrakeProfiles.length) {
    throw new RangeError(`Native brake selector must be an integer from 0 to ${nativeBrakeProfiles.length - 1}; got ${selector}.`);
  }
  return nativeBrakeProfiles[selector]!;
}

/** PAL curve byte for an active brake hold; the 32nd value remains saturated. */
export function nativeBrakeCurveValue(selector: number, heldUpdates: number): number {
  const curve = nativeBrakeProfile(selector).curve;
  if (!Number.isInteger(heldUpdates) || heldUpdates < 1) {
    throw new RangeError(`Native brake hold must contain at least one whole vehicle update; got ${heldUpdates}.`);
  }
  return curve[Math.min(heldUpdates, nativeBrakeHoldUpdates) - 1]!;
}

/** Exact positive integer result of PAL's `curveByte * 10000 >> 5`. */
export function nativeBrakeForceUnits(selector: number, heldUpdates: number): number {
  return Math.floor(nativeBrakeCurveValue(selector, heldUpdates) * nativeBrakeMaximumForceUnits / nativeBrakeHoldUpdates);
}

/** Browser bridge preserving PAL's integer force result and 10,000-unit peak. */
export function nativeBrakeForceFraction(selector: number, heldUpdates: number): number {
  return nativeBrakeForceUnits(selector, heldUpdates) / nativeBrakeMaximumForceUnits;
}

function profile(
  selector: number,
  name: string,
  description: string,
  price: number,
  curve: readonly number[],
): NativeBrakeProfile {
  if (curve.length !== nativeBrakeHoldUpdates) throw new Error(`${name} does not contain 32 native brake samples.`);
  return Object.freeze({ selector, name, description, price, curve: Object.freeze([...curve]) });
}
