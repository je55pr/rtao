export const nativeSpecialAbilityFlags = Object.freeze({
  flightWingFitted: 0x0004,
  flightWingActive: 0x0008,
  lights: 0x0010,
  policeLight: 0x0020,
  propeller: 0x0040,
  waterSki: 0x0100,
  advertisingSign: 0x0200,
  wingSet: 0x1000,
  jetTurbine: 0x2000,
  sticker: 0x4000,
} as const);

export const nativeSpecialAbilitySystemBoundary = Object.freeze({
  persistence: "three persisted selector blocks; flags are derived runtime state",
  exclusivity: "one selector per category; categories 10 and 11 clear their own mutually-exclusive flag groups",
  freeRoamDriving: "Propeller and Water Ski only",
  ordinaryRaceDriving: "Wing Set, Propeller, Jet Turbine and Water Ski; Flight Wing downstream behavior is gated on the unresolved 0x0021E208 scalar",
  contact: "Propeller, Water Ski, and active Flight Wing support/orientation; auxiliary transition audio is contact-state driven",
  camera: "no proven special-equipment camera consumer",
  audio: "Jet Turbine race requests proven; horn selector consumer unresolved",
  visual: "wheel geometry proven; special-equipment accessories/options/sticker/meter presentation unresolved",
} as const);

const specialPartsMask = nativeSpecialAbilityFlags.propeller | nativeSpecialAbilityFlags.jetTurbine;
const optionFittedMask = nativeSpecialAbilityFlags.flightWingFitted
  | nativeSpecialAbilityFlags.policeLight
  | nativeSpecialAbilityFlags.waterSki
  | nativeSpecialAbilityFlags.advertisingSign;
const freeRoamReadyMask = nativeSpecialAbilityFlags.propeller | nativeSpecialAbilityFlags.waterSki;
const ordinaryRaceReadyMask = nativeSpecialAbilityFlags.wingSet
  | nativeSpecialAbilityFlags.propeller
  | nativeSpecialAbilityFlags.jetTurbine
  | nativeSpecialAbilityFlags.waterSki;

export const nativeFlightWingActivationThreshold = 300;

/**
 * PAL 0x21CFC4..0x21D05C. `velocityDerivedScalar` is the exact f0 returned by
 * helper 0x0021E208; its formula remains unrecovered and is deliberately not
 * approximated here. Equality preserves the current fitted/active state.
 */
export function advanceNativeFlightWingFlags(flags: number, velocityDerivedScalar: number): number {
  if (!Number.isInteger(flags) || flags < 0 || flags > 0xffff) {
    throw new RangeError(`Native equipment flags must be an unsigned halfword; got ${flags}.`);
  }
  if (!Number.isFinite(velocityDerivedScalar)) {
    throw new RangeError("Flight Wing velocity-derived scalar must be finite.");
  }
  let next = flags;
  if ((next & nativeSpecialAbilityFlags.flightWingFitted)
    && velocityDerivedScalar > nativeFlightWingActivationThreshold) {
    next = (next & ~nativeSpecialAbilityFlags.flightWingFitted) | nativeSpecialAbilityFlags.flightWingActive;
    return next;
  }
  if ((next & nativeSpecialAbilityFlags.flightWingActive)
    && velocityDerivedScalar < nativeFlightWingActivationThreshold) {
    next = (next & ~nativeSpecialAbilityFlags.flightWingActive) | nativeSpecialAbilityFlags.flightWingFitted;
  }
  return next;
}

export function nativeSpecialPartsConfigurationFlag(selector: number): number {
  assertSelector("Special Parts", selector, 2);
  if (selector === 1) return nativeSpecialAbilityFlags.propeller;
  if (selector === 2) return nativeSpecialAbilityFlags.jetTurbine;
  return 0;
}

export function nativeOptionConfigurationFlag(selector: number): number {
  assertSelector("Options", selector, 8);
  if (selector === 1) return nativeSpecialAbilityFlags.waterSki;
  if (selector === 2) return nativeSpecialAbilityFlags.flightWingFitted;
  if (selector === 3) return nativeSpecialAbilityFlags.policeLight;
  if (selector >= 4) return nativeSpecialAbilityFlags.advertisingSign;
  return 0;
}

export function nativeOptionVariant(selector: number): number {
  assertSelector("Options", selector, 8);
  return selector >= 4 ? selector - 4 : 0;
}
export function nativeSpecialEquipmentConfigurationFlags(selectors: readonly number[]): number {
  validateSpecialSelectors(selectors);
  let flags = 0;
  if ((selectors[8] ?? 0) !== 0) flags |= nativeSpecialAbilityFlags.lights;
  if ((selectors[9] ?? 0) !== 0) flags |= nativeSpecialAbilityFlags.wingSet;
  flags |= nativeSpecialPartsConfigurationFlag(selectors[10] ?? 0);
  flags |= nativeOptionConfigurationFlag(selectors[11] ?? 0);
  if ((selectors[12] ?? 0) !== 0) flags |= nativeSpecialAbilityFlags.sticker;
  return flags;
}

export function nativeFreeRoamSpecialAbilityFlags(selectors: readonly number[]): number {
  return nativeSpecialEquipmentConfigurationFlags(selectors) & freeRoamReadyMask;
}

export function nativeOrdinaryRaceSpecialAbilityFlags(selectors: readonly number[]): number {
  const flags = nativeSpecialEquipmentConfigurationFlags(selectors);
  if (flags & nativeSpecialAbilityFlags.flightWingFitted) {
    throw new RangeError(
      "Flight Wing ordinary-race mechanics remain evidence-gated beyond the recovered fitted/active transition.",
    );
  }
  return flags & ordinaryRaceReadyMask;
}

export function nativeSpecialAbilityExclusivityMasks(): Readonly<{ specialParts: number; options: number }> {
  return Object.freeze({ specialParts: specialPartsMask, options: optionFittedMask });
}
function validateSpecialSelectors(selectors: readonly number[]): void {
  if (selectors.length !== 15) {
    throw new RangeError(`Native equipment selector block must contain 15 categories; got ${selectors.length}.`);
  }
  assertSelector("Wheels", selectors[7] ?? 0, 14);
  assertSelector("Lights", selectors[8] ?? 0, 2);
  assertSelector("Wing", selectors[9] ?? 0, 1);
  assertSelector("Special Parts", selectors[10] ?? 0, 2);
  assertSelector("Options", selectors[11] ?? 0, 8);
  assertSelector("Stickers", selectors[12] ?? 0, 1);
  assertSelector("Horns", selectors[13] ?? 0, 14);
  assertSelector("Meters", selectors[14] ?? 0, 10);
}

function assertSelector(label: string, selector: number, maximum: number): void {
  if (!Number.isInteger(selector) || selector < 0 || selector > maximum) {
    throw new RangeError(`${label} selector ${selector} lies outside the recovered 0..${maximum} range.`);
  }
}
