import type { RaceActivityDescriptor, RaceCatalogue, RaceFinishGateSet, RaceFinishGateStrip } from "../formats/raceCatalogue";
import { palOrdinaryRaceCount, racePrizeCakeFromNativeFinishIndices } from "../formats/raceCatalogue";
import { RecoveredCommerceState } from "./commerceProgress";

export const nativeUnfinishedRaceIndex = 0xff;
export const maximumRaceLicenseClass = 3;

export type RaceCompletionStatus = "completed" | "locked" | "not-an-ordinary-race";

export interface RaceCompletionResult {
  readonly status: RaceCompletionStatus;
  readonly activityId: number;
  readonly prizeCake: number;
  readonly cakeBefore: number;
  readonly cakeAfter: number;
  readonly previousBestFinishIndex: number;
  readonly bestFinishIndex: number;
  readonly licenseBefore: number;
  readonly licenseAfter: number;
  readonly promoted: boolean;
}

export interface NativeRaceFinishGateAdvance {
  readonly phase: number;
  readonly completedLap: boolean;
}

/**
 * Mirrors ordinary handler 0x0022EBA0. A car must cross strips 0→1→2, leave
 * strip 2, and return through strip 0 before 0x0022E910 records a lap.
 */
export function advanceNativeRaceFinishGate(
  gates: RaceFinishGateSet,
  phase: number,
  nativeX: number,
  nativeZ: number,
): NativeRaceFinishGateAdvance {
  if (!Number.isInteger(phase) || phase < 0 || phase > 4) throw new RangeError("Native race finish-gate phase must be 0..4 (zero before the first start crossing).");
  if (contains(gates.strips[0], nativeX, nativeZ)) return { phase: 2, completedLap: phase === 4 };
  if (contains(gates.strips[1], nativeX, nativeZ)) return { phase: 3, completedLap: false };
  if (contains(gates.strips[2], nativeX, nativeZ)) return { phase: phase === 3 ? 4 : phase, completedLap: false };
  return { phase: phase === 2 ? 1 : phase, completedLap: false };
}

/**
 * The executable's 24 best-finish bytes at save offset +0xFF0 and licence byte
 * at +0x651. A finish index is zero-based; 0xFF means no recorded result.
 */
export class RecoveredRaceState {
  private license = 0;
  private finishes = Array<number>(palOrdinaryRaceCount).fill(nativeUnfinishedRaceIndex);
  private progressRevision = 0;

  get licenseClass(): number { return this.license; }
  get revision(): number { return this.progressRevision; }

  finishIndex(activityId: number): number {
    validateActivityId(activityId);
    return this.finishes[activityId] ?? nativeUnfinishedRaceIndex;
  }

  finishEntries(): readonly number[] { return [...this.finishes]; }

  isUnlocked(activity: RaceActivityDescriptor): boolean {
    return activity.ordinaryRace && activity.variantId <= this.license;
  }

  /** Restores validated native-width fields without manufacturing a mutation. */
  restore(licenseClass: unknown, finishIndices: unknown): boolean {
    if (!Number.isInteger(licenseClass) || (licenseClass as number) < 0 || (licenseClass as number) > maximumRaceLicenseClass) return false;
    if (!Array.isArray(finishIndices) || finishIndices.length !== palOrdinaryRaceCount) return false;
    if (finishIndices.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) return false;
    this.license = licenseClass as number;
    this.finishes = [...finishIndices] as number[];
    return true;
  }

  /**
   * Applies the ordinary-race result path at 0x00237A00, 0x00238D00 and
   * 0x00239440. The first finish index is the player; later indices are team cars.
   */
  completeOrdinaryRace(
    catalogue: RaceCatalogue,
    activityId: number,
    nativeFinishIndices: readonly number[],
    commerce: RecoveredCommerceState,
  ): RaceCompletionResult {
    const activity = catalogue.activities[activityId];
    const cakeBefore = commerce.cake;
    const licenseBefore = this.license;
    const previousBestFinishIndex = activityId >= 0 && activityId < palOrdinaryRaceCount
      ? this.finishes[activityId] ?? nativeUnfinishedRaceIndex
      : nativeUnfinishedRaceIndex;
    if (!activity?.ordinaryRace) {
      return unchanged("not-an-ordinary-race", activityId, cakeBefore, previousBestFinishIndex, licenseBefore);
    }
    if (!this.isUnlocked(activity)) {
      return unchanged("locked", activityId, cakeBefore, previousBestFinishIndex, licenseBefore);
    }
    if (nativeFinishIndices.length === 0 || nativeFinishIndices.length > 3 || nativeFinishIndices.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) {
      throw new RangeError("A race result requires one through three native byte finish indices.");
    }

    const playerFinishIndex = nativeFinishIndices[0] ?? nativeUnfinishedRaceIndex;
    const bestFinishIndex = Math.min(previousBestFinishIndex, playerFinishIndex);
    if (bestFinishIndex !== previousBestFinishIndex) {
      this.finishes[activityId] = bestFinishIndex;
      this.progressRevision += 1;
    }
    const prizeCake = racePrizeCakeFromNativeFinishIndices(activity.variantId, nativeFinishIndices);
    if (prizeCake > 0 && !commerce.applyCakeMutation(-prizeCake)) {
      throw new Error("Native race Cake credit unexpectedly failed.");
    }

    if (activity.variantId === this.license && this.license < maximumRaceLicenseClass &&
      playerFinishIndex < 6 && racesInLicenseClass(catalogue, this.license).every((race) => this.finishIndex(race.activityId) < 6)) {
      this.license += 1;
      this.progressRevision += 1;
    }
    return {
      status: "completed", activityId, prizeCake, cakeBefore, cakeAfter: commerce.cake,
      previousBestFinishIndex, bestFinishIndex, licenseBefore, licenseAfter: this.license,
      promoted: this.license !== licenseBefore,
    };
  }
}

function racesInLicenseClass(catalogue: RaceCatalogue, licenseClass: number): readonly RaceActivityDescriptor[] {
  return catalogue.ordinaryRaces.filter((activity) => activity.variantId === licenseClass);
}

function validateActivityId(activityId: number): void {
  if (!Number.isInteger(activityId) || activityId < 0 || activityId >= palOrdinaryRaceCount) {
    throw new RangeError(`Ordinary race activity ID must be 0..${palOrdinaryRaceCount - 1}.`);
  }
}

function contains(strip: RaceFinishGateStrip, x: number, z: number): boolean {
  return strip.minimumX < x && x < strip.maximumX && strip.minimumZ < z && z < strip.maximumZ;
}

function unchanged(
  status: Exclude<RaceCompletionStatus, "completed">,
  activityId: number,
  cake: number,
  bestFinishIndex: number,
  license: number,
): RaceCompletionResult {
  return {
    status, activityId, prizeCake: 0, cakeBefore: cake, cakeAfter: cake,
    previousBestFinishIndex: bestFinishIndex, bestFinishIndex,
    licenseBefore: license, licenseAfter: license, promoted: false,
  };
}
