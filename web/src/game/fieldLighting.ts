export const hg2DayUnits = 216_000;
export const hg2UnitsPerHour = 9_000;

export type OutdoorVisibilityMode = "authentic" | "extended" | "unlimited";

export interface LightingWeights {
  readonly day: number;
  readonly warm: number;
  readonly night: number;
}

export interface Rgb255 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OutdoorAtmosphere {
  /** Exact VU memory-19 field-light coefficients; endpoints intentionally reach 1.1. */
  readonly weights: LightingWeights;
  /** Executable-derived above-water GS FOGCOL display-byte value. */
  readonly fogColor: Rgb255;
  /** Neighbouring environment/background tint; deep night reaches true black. */
  readonly backgroundColor: Rgb255;
}

export interface VisibilityProfile {
  readonly mode: OutdoorVisibilityMode;
  /** Depth through which the GS fog factor remains fully source-coloured. */
  readonly fogFullDistance: number | null;
  /** Depth through which the VU alpha factor remains fully opaque. */
  readonly alphaFullDistance: number | null;
  /** Depth at which both recovered fades have reached the atmosphere. */
  readonly farDistance: number | null;
}

/** HG2 outdoor clock helper. 9,000 units are exactly one in-game hour. */
export function hg2TimeUnits(hours: number, minutes = 0): number {
  return normalizeHg2Time((hours + minutes / 60) * hg2UnitsPerHour);
}

export function normalizeHg2Time(units: number): number {
  const result = units % hg2DayUnits;
  return result < 0 ? result + hg2DayUnits : result;
}

/**
 * Exact PAL SLES_513.56 field-VU weights written to environment +0x140 and
 * uploaded as VU memory vector 19.
 *
 * Stable day/night are 1.1 rather than 1.0. The transition branches retain
 * HG2's deliberate 0.1 overlap; do not normalise these three values.
 */
export function outdoorLightingWeights(units: number): LightingWeights {
  const t = normalizeHg2Time(units);
  const dawnStart = hg2TimeUnits(5, 30);
  const dayStart = hg2TimeUnits(6, 30);
  const sunsetStart = hg2TimeUnits(17, 0);
  const duskStart = hg2TimeUnits(18, 0);
  const nightStart = hg2TimeUnits(18, 30);
  const endpoint = 1.1;

  if (t < dawnStart || t >= nightStart) return { day: 0, warm: 0, night: endpoint };
  if (t < dayStart) {
    const day = inverseLerp(dawnStart, dayStart, t);
    return { day, warm: 0, night: endpoint - day };
  }
  if (t < sunsetStart) return { day: endpoint, warm: 0, night: 0 };
  if (t < duskStart) {
    const warm = inverseLerp(sunsetStart, duskStart, t);
    return { day: endpoint - warm, warm, night: 0 };
  }
  const night = 0.1 + inverseLerp(duskStart, nightStart, t);
  return { day: 0, warm: endpoint - night, night };
}

/** Executable-derived above-water GS FOGCOL display-byte curve. */
export function outdoorFogColor(units: number): Rgb255 {
  const t = normalizeHg2Time(units);
  const dawnStart = hg2TimeUnits(5, 30);
  const dayStart = hg2TimeUnits(6, 30);
  const sunsetStart = hg2TimeUnits(17, 0);
  const duskStart = hg2TimeUnits(18, 0);
  const nightStart = hg2TimeUnits(18, 30);

  if (t < dawnStart || t >= nightStart) return { r: 0, g: 0, b: 8 };
  if (t < dayStart) {
    const day = inverseLerp(dawnStart, dayStart, t);
    return {
      r: mipsColorByte(day * 255),
      g: mipsColorByte(day * 255),
      b: mipsColorByte(day < 0.5 ? day * 510 : 255),
    };
  }
  if (t < sunsetStart) return { r: 255, g: 255, b: 255 };
  if (t < duskStart) {
    const warm = inverseLerp(sunsetStart, duskStart, t);
    return { r: 255, g: mipsColorByte(255 - warm * 94), b: mipsColorByte(255 - warm * 128) };
  }
  const warm = 1 - inverseLerp(duskStart, nightStart, t);
  return { r: mipsColorByte(warm * 255), g: mipsColorByte(warm * 161), b: mipsColorByte(warm * 127) };
}

/**
 * The neighbouring executable environment tint follows the same daytime/warm
 * envelope but reaches true black at deep night. Its final semantic role is
 * still being traced, so keep it distinct from FOGCOL.
 */
export function outdoorBackgroundColor(units: number): Rgb255 {
  const t = normalizeHg2Time(units);
  const dawnStart = hg2TimeUnits(5, 30);
  const dayStart = hg2TimeUnits(6, 30);
  const sunsetStart = hg2TimeUnits(17, 0);
  const duskStart = hg2TimeUnits(18, 0);
  const nightStart = hg2TimeUnits(18, 30);

  if (t < dawnStart || t >= nightStart) return { r: 0, g: 0, b: 0 };
  if (t < dayStart) {
    const day = inverseLerp(dawnStart, dayStart, t);
    return { r: mipsColorByte(day * 255), g: mipsColorByte(day * 255), b: mipsColorByte(day < 0.5 ? day * 510 : 255) };
  }
  if (t < sunsetStart) return { r: 255, g: 255, b: 255 };
  if (t < duskStart) {
    const warm = inverseLerp(sunsetStart, duskStart, t);
    return { r: 255, g: mipsColorByte(255 - warm * 94), b: mipsColorByte(255 - warm * 128) };
  }
  const warm = 1 - inverseLerp(duskStart, nightStart, t);
  return { r: mipsColorByte(warm * 255), g: mipsColorByte(warm * 161), b: mipsColorByte(warm * 127) };
}

export function outdoorAtmosphere(units: number): OutdoorAtmosphere {
  return {
    weights: outdoorLightingWeights(units),
    fogColor: outdoorFogColor(units),
    backgroundColor: outdoorBackgroundColor(units),
  };
}

/**
 * Exact ordinary MSCALF-8 authentic visibility profile selected by the
 * authored primitive GIF-tag flag. Stable memory 21 is always the long
 * [128,255,0.5,800] profile. Dynamic memory 20 follows the executable's
 * time-of-day night coefficient: day uses that same long profile, while deep
 * night reaches [128,255,1.0,300].
 */
export function authenticFieldVisibilityProfile(units: number, stableAtmosphere: boolean): VisibilityProfile {
  if (stableAtmosphere) return visibilityProfile("authentic");

  const nightBlend = Math.max(0, Math.min(1, outdoorLightingWeights(units).night / 1.1));
  const slope = lerp(0.5, 1.0, nightBlend);
  const farDistance = lerp(800, 300, nightBlend);
  return {
    mode: "authentic",
    fogFullDistance: Math.max(0, farDistance - 255 / slope),
    alphaFullDistance: Math.max(0, farDistance - 128 / slope),
    farDistance,
  };
}

/**
 * Browser visibility policy layered over recovered HG2 behaviour.
 *
 * `visibilityProfile("authentic")` is the stable memory-21 endpoint
 * [128,255,0.5,800]: fog begins at 290, alpha at 544, both finish at 800.
 * Dynamic memory-20 ordinary geometry must instead use
 * `authenticFieldVisibilityProfile()` so its range contracts at night.
 *
 * Extended deliberately preserves a multi-field vista. Billboard MSCALF 6
 * remains a separate path and must not be assigned either ordinary profile.
 */
export function visibilityProfile(mode: OutdoorVisibilityMode): VisibilityProfile {
  switch (mode) {
    case "authentic": return { mode, fogFullDistance: 290, alphaFullDistance: 544, farDistance: 800 };
    case "extended": return { mode, fogFullDistance: 1800, alphaFullDistance: 3500, farDistance: 5200 };
    case "unlimited": return { mode, fogFullDistance: null, alphaFullDistance: null, farDistance: null };
  }
}

export function fieldFogSourceFactor(depth: number, profile: VisibilityProfile): number {
  if (profile.fogFullDistance === null || profile.farDistance === null) return 1;
  return descendingLinearFactor(depth, profile.fogFullDistance, profile.farDistance);
}

export function fieldAlphaSourceFactor(depth: number, profile: VisibilityProfile): number {
  if (profile.alphaFullDistance === null || profile.farDistance === null) return 1;
  return descendingLinearFactor(depth, profile.alphaFullDistance, profile.farDistance);
}

/** Opaque-pass approximation of HG2 fog then alpha over the same atmosphere. */
export function fieldAtmosphereSourceFactor(depth: number, profile: VisibilityProfile): number {
  return fieldFogSourceFactor(depth, profile) * fieldAlphaSourceFactor(depth, profile);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function inverseLerp(a: number, b: number, value: number): number {
  return Math.max(0, Math.min(1, (value - a) / (b - a)));
}

function descendingLinearFactor(value: number, fullUntil: number, zeroAt: number): number {
  if (zeroAt <= fullUntil) return value <= fullUntil ? 1 : 0;
  return Math.max(0, Math.min(1, (zeroAt - value) / (zeroAt - fullUntil)));
}

function mipsColorByte(value: number): number {
  // PAL startup clears FCR31, so CVT.W.S is round-to-nearest with ties-to-even.
  // Reproduce the single-precision operation instead of JS Math.round.
  const single = Math.fround(value);
  const floor = Math.floor(single);
  const fraction = single - floor;
  let rounded: number;
  if (fraction < 0.5) rounded = floor;
  else if (fraction > 0.5) rounded = floor + 1;
  else rounded = (floor & 1) === 0 ? floor : floor + 1;
  return Math.max(0, Math.min(255, rounded));
}
