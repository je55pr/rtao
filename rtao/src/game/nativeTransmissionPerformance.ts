export interface NativeTransmissionProfile {
  readonly selector: number;
  readonly name: string;
  readonly price: number;
  /** Reverse at index 0, then up to six forward gear words and a zero sentinel. */
  readonly ratios: readonly number[];
}

/**
 * PAL category-4 records at 0x00301ee8, stride 28. Function 0x00218f70 copies
 * the eight signed halfwords at +0x0c into live car +0x22c..+0x23a.
 */
export const nativeTransmissionProfiles: readonly NativeTransmissionProfile[] = Object.freeze([
  profile(0, "Normal Transmission", 200,    [-95, 116, 162, 227, 318, 446, 0, 0]),
  profile(1, "Sports Transmission", 1_000, [-95, 116, 182, 291, 408, 490, 0, 0]),
  profile(2, "Power Transmission", 2_000,  [-95, 128, 220, 276, 387, 464, 557, 0]),
  profile(3, "Speed Transmission", 4_000,  [-95, 128, 260, 327, 458, 550, 660, 0]),
  profile(4, "Wide Transmission", 7_000,   [-95, 144, 300, 414, 539, 647, 711, 0]),
  profile(5, "Hyper Transmission", 10_000, [-95, 156, 350, 446, 550, 625, 750, 0]),
]);

export function nativeTransmissionProfile(selector: number): NativeTransmissionProfile {
  if (!Number.isInteger(selector) || selector < 0 || selector >= nativeTransmissionProfiles.length) {
    throw new RangeError(`Native transmission selector must be an integer from 0 to ${nativeTransmissionProfiles.length - 1}; got ${selector}.`);
  }
  return nativeTransmissionProfiles[selector]!;
}

/** Same-force launch response from the first forward gear's inverse divisor. */
export function nativeTransmissionLaunchAccelerationRatio(selector: number): number {
  const normalFirst = nativeTransmissionProfiles[0]!.ratios[1]!;
  return normalFirst / nativeTransmissionProfile(selector).ratios[1]!;
}

/** Terminal wheel-speed ratio at PAL's common 10,000-unit engine-speed cap. */
export function nativeTransmissionTopSpeedRatio(selector: number): number {
  return finalForwardRatio(nativeTransmissionProfile(selector)) / finalForwardRatio(nativeTransmissionProfiles[0]!);
}

function finalForwardRatio(profileValue: NativeTransmissionProfile): number {
  for (let index = profileValue.ratios.length - 1; index >= 1; index -= 1) {
    const ratio = profileValue.ratios[index]!;
    if (ratio !== 0) return ratio;
  }
  throw new Error(`${profileValue.name} has no forward gear ratio.`);
}

function profile(selector: number, name: string, price: number, ratios: readonly number[]): NativeTransmissionProfile {
  if (ratios.length !== 8) throw new Error(`${name} does not contain eight native transmission words.`);
  return Object.freeze({ selector, name, price, ratios: Object.freeze([...ratios]) });
}
