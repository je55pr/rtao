export const nativeRoulettePhysicalPocketCount = 20;
export const nativeRouletteComputedPocketIndexMaximum = 20;
export const nativeRouletteBetCount = 23;
export const nativeRouletteMaximumWagerCake = 10_000;
export const nativeRouletteAngleStep = 3_276;
export const nativeRouletteHalfAngleStep = 1_638;

/**
 * PAL table 0x002dbf38, indexed by the physical pocket produced at 0x00263be8.
 * The wheel has 20 ordinary bins. Because 3,276 * 20 is 16 short of 65,536,
 * the native integer formula can also address the adjacent zero word as a
 * narrow index-20 wrap-edge alias; preserving it avoids inventing a modulus.
 */
export const nativeRoulettePocketNumbers: readonly number[] = Object.freeze([
  0, 6, 8, 18, 10, 4, 12, 16, 14, 2,
  0, 5, 7, 17, 9, 3, 11, 15, 13, 1,
  0,
]);

/** PAL bet-record word +0x18 at 0x002dbae8, 48-byte stride. */
export const nativeRouletteBetMultipliers: readonly number[] = Object.freeze([
  18, 18, 18, 18, 18, 18, 18, 18, 18,
  18, 18, 18, 18, 18, 18, 18, 18, 18,
  3, 3, 3,
  2, 2,
]);

export interface NativeRouletteOutcome {
  readonly physicalPocketIndex: number;
  readonly number: number;
  readonly colourIndex: 0 | 1;
  readonly selectedBetIndex: number;
  readonly multiplier: number;
  readonly won: boolean;
  /** Full native credit; the stake has already been debited by the wager host. */
  readonly payoutCake: number;
}

/** Wager host 0x00264318 caps selection at the smaller of current Cake and 10,000. */
export function maximumNativeRouletteWager(cake: number): number {
  if (!Number.isInteger(cake) || cake < 0 || cake > 999_999) {
    throw new RangeError("Roulette Cake balance must be an integer in the native 0..999,999 range.");
  }
  return Math.min(cake, nativeRouletteMaximumWagerCake);
}

/**
 * Exact fixed-angle binning at 0x00263bc0..0x00263be8. Inputs are signed Q15
 * turns: the physical update converts atan2 radians to angle/pi*32768 first.
 */
export function nativeRoulettePocketIndex(resultAngleQ15: number, wheelAngleQ15: number): number {
  validateSignedHalfword(resultAngleQ15, "result angle");
  validateSignedHalfword(wheelAngleQ15, "wheel angle");
  return (((resultAngleQ15 - wheelAngleQ15 + nativeRouletteHalfAngleStep) & 0xffff) / nativeRouletteAngleStep) | 0;
}

/** Exact matcher at 0x00265048 plus payout multiplier at 0x00264ed4..0x00264f08. */
export function resolveNativeRouletteOutcome(
  physicalPocketIndex: number,
  selectedBetIndex: number,
  wagerCake: number,
): NativeRouletteOutcome {
  if (!Number.isInteger(physicalPocketIndex) || physicalPocketIndex < 0 || physicalPocketIndex > nativeRouletteComputedPocketIndexMaximum) {
    throw new RangeError("Roulette computed pocket index must be in the native 0..20 range.");
  }
  if (!Number.isInteger(selectedBetIndex) || selectedBetIndex < 0 || selectedBetIndex >= nativeRouletteBetCount) {
    throw new RangeError("Roulette bet index must be in the native 0..22 range.");
  }
  if (!Number.isInteger(wagerCake) || wagerCake <= 0 || wagerCake > nativeRouletteMaximumWagerCake) {
    throw new RangeError("Roulette wager must be an integer in the native 1..10,000 range.");
  }

  const number = nativeRoulettePocketNumbers[physicalPocketIndex]!;
  const colourIndex = (physicalPocketIndex < 10
    ? physicalPocketIndex % 2
    : (physicalPocketIndex + 1) % 2) as 0 | 1;
  const won = selectedBetIndex < 18
    ? selectedBetIndex === number - 1
    : selectedBetIndex < 21
      ? selectedBetIndex === Math.trunc((number - 1) / 6) + 18
      : selectedBetIndex === colourIndex + 21;
  const multiplier = nativeRouletteBetMultipliers[selectedBetIndex]!;
  return {
    physicalPocketIndex,
    number,
    colourIndex,
    selectedBetIndex,
    multiplier,
    won,
    payoutCake: won ? wagerCake * multiplier : 0,
  };
}

function validateSignedHalfword(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`Roulette ${label} must be a signed 16-bit integer.`);
  }
}
