/**
 * HG2 field RGB values are authored in the GS 0..128 modulation domain.
 * A value of 128 is neutral for TEX0.TFX=MODULATE.
 */
export function hg2FieldModulateFactor(rawVuRgb: number, lightingWeight = 1): number {
  return rawVuRgb * lightingWeight / 128;
}

/** Display-byte result for a textured TFX=MODULATE channel before clamping. */
export function hg2FieldModulatedDisplayByte(textureByte: number, rawVuRgb: number, lightingWeight = 1): number {
  return clampByteFloat(textureByte * hg2FieldModulateFactor(rawVuRgb, lightingWeight));
}

/** Display-byte result for an untextured TME=0 field channel. */
export function hg2FieldDirectDisplayByte(rawVuRgb: number, lightingWeight = 1): number {
  return clampByteFloat(rawVuRgb * lightingWeight);
}

/**
 * HG2's GS fog/alpha composition happens in display-byte space, not linear light.
 * When the fogged source is then alpha-blended over the same atmospheric colour,
 * the effective source contribution is a single 0..1 factor in that encoded domain.
 */
export function hg2DisplaySpaceCompositeByte(sourceByte: number, atmosphereByte: number, sourceFactor: number): number {
  const factor = Math.max(0, Math.min(1, sourceFactor));
  return clampByteFloat(atmosphereByte + (sourceByte - atmosphereByte) * factor);
}

/**
 * Reference helper demonstrating the modern linear-light result that Three.js
 * would produce if we forgot to round-trip through encoded GS display space.
 */
export function linearSpaceCompositeByte(sourceByte: number, atmosphereByte: number, sourceFactor: number): number {
  const factor = Math.max(0, Math.min(1, sourceFactor));
  const sourceLinear = srgbByteToLinear(sourceByte);
  const atmosphereLinear = srgbByteToLinear(atmosphereByte);
  const compositedLinear = atmosphereLinear + (sourceLinear - atmosphereLinear) * factor;
  return linearToSrgbByte(compositedLinear);
}

function clampByteFloat(value: number): number {
  return Math.max(0, Math.min(255, value));
}


function srgbByteToLinear(value: number): number {
  const normalized = clampByteFloat(value) / 255;
  if (normalized <= 0.04045) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const normalized = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * (clamped ** (1 / 2.4)) - 0.055;
  return clampByteFloat(normalized * 255);
}
