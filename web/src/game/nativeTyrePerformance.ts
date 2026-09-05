import type { DrivingSurfaceKind } from "./worldCollision";

export const nativeTyreSurfaceOrder = ["dry", "offroad", "wet", "grass", "snow", "ice"] as const;
export type NativeTyreSurface = typeof nativeTyreSurfaceOrder[number];

export interface NativeTyreGripProfile {
  readonly selector: number;
  readonly name: string;
  readonly dry: number;
  readonly offroad: number;
  readonly wet: number;
  readonly grass: number;
  readonly snow: number;
  readonly ice: number;
}

/**
 * PAL executable tyre catalogue grip words, copied by 0x00218f70 from the
 * selected 28-byte category-1 record into the car's six surface coefficients.
 * Order is Dry / Off-road / Wet / Grass / Snow / Ice.
 */
export const nativeTyreGripProfiles: readonly NativeTyreGripProfile[] = Object.freeze([
  profile(0, "Normal",       196,   168,   128,   168,   96,    64),
  profile(1, "Sports",       240,   196,   154,   160,   96,    64),
  profile(2, "Semi Racing",  333,   168,   154,   140,   80,    64),
  profile(3, "Racing",       512,   102,   102,   100,   51,    64),
  profile(4, "HG Racing",    512,   160,   102,   128,   51,    64),
  profile(5, "Wet",          240,   196,   196,   160,   128,   64),
  profile(6, "HG Wet",       240,   196,   240,   160,   128,   64),
  profile(7, "Off Road",     196,   196,   160,   160,   128,   64),
  profile(8, "HG Off Road",  240,   240,   160,   180,   168,   128),
  profile(9, "Studless",     196,   196,   160,   168,   168,   196),
  profile(10, "HG Studless", 240,   196,   160,   168,   196,   196),
  profile(11, "Big",         240,   240,   230,   210,   196,   96),
  profile(12, "Devil",       65280, 65280, 65280, 65280, 65280, 65280),
]);

export function nativeTyreGripProfile(selector: number): NativeTyreGripProfile {
  if (!Number.isInteger(selector) || selector < 0 || selector >= nativeTyreGripProfiles.length) {
    throw new RangeError(`Native tyre selector must be an integer from 0 to ${nativeTyreGripProfiles.length - 1}; got ${selector}.`);
  }
  return nativeTyreGripProfiles[selector]!;
}

/** Relative coefficient versus Normal Tyre on the same native surface. */
export function nativeTyreRelativeGrip(selector: number, surface: NativeTyreSurface): number {
  const selected = nativeTyreGripProfile(selector)[surface];
  const baseline = nativeTyreGripProfiles[0]![surface];
  return selected / baseline;
}

/**
 * Bridge from browser surface classes to the executable's tyre coefficients.
 * "other" remains neutral because it has no recovered native surface code.
 */
export function nativeTyreGripMultiplier(selector: number, surfaceKind: DrivingSurfaceKind): number {
  if (surfaceKind === "paved-road" || surfaceKind === "dry") return nativeTyreRelativeGrip(selector, "dry");
  if (surfaceKind === "dirt") return nativeTyreRelativeGrip(selector, "offroad");
  if (surfaceKind === "wet") return nativeTyreRelativeGrip(selector, "wet");
  if (surfaceKind === "grass") return nativeTyreRelativeGrip(selector, "grass");
  if (surfaceKind === "snow") return nativeTyreRelativeGrip(selector, "snow");
  if (surfaceKind === "ice") return nativeTyreRelativeGrip(selector, "ice");
  nativeTyreGripProfile(selector); // validate even when an unresolved surface is neutral.
  return 1;
}

function profile(
  selector: number,
  name: string,
  dry: number,
  offroad: number,
  wet: number,
  grass: number,
  snow: number,
  ice: number,
): NativeTyreGripProfile {
  return Object.freeze({ selector, name, dry, offroad, wet, grass, snow, ice });
}
