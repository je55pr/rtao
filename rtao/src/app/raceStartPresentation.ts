export interface RaceStartSignalView {
  readonly visible: boolean;
  readonly nativeState: number;
  readonly readyActive: readonly boolean[];
  readonly releaseActive: readonly boolean[];
  readonly released: boolean;
  readonly announcement: string;
}

const fourOff = [false, false, false, false] as const;

/**
 * Host presentation of PAL race-start widget states 2..6 selected by 0x22F068.
 * The executable proves two four-slot groups and their state sequence; it does
 * not identify their original sprite art or colours, so those remain CSS policy.
 */
export function raceStartSignalView(nativeState: number): RaceStartSignalView {
  if (nativeState === 0) {
    return { visible: false, nativeState, readyActive: fourOff, releaseActive: fourOff,
      released: false, announcement: "" };
  }
  if (!Number.isInteger(nativeState) || nativeState < 2 || nativeState > 6) {
    throw new RangeError("Race start presentation requires PAL UI state 0 or 2..6.");
  }
  const readyCount = nativeState === 6 ? 4 : nativeState - 2;
  const released = nativeState === 6;
  return {
    visible: true,
    nativeState,
    readyActive: fourOff.map((_, index) => index < readyCount),
    releaseActive: fourOff.map(() => released),
    released,
    announcement: released ? "Go" : `Race start signal ${readyCount + 1} of 4`,
  };
}
