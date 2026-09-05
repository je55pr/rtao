import { Elf32AddressSpace } from "../formats/elf32";

export interface NativeRaceCountdownInput {
  /** Task +0x08. The scheduler owns increments; this callback only resets it on hold. */
  readonly elapsedUpdates: number;
  /** Task +0x02, independently incremented by the 64-update fade. */
  readonly fadeUpdates: number;
  readonly sceneFlags: number;
  readonly updatesPerSecond: 50 | 60;
  /** Nonzero global byte 0x0182060A allows the final start phase to end early. */
  readonly shortFinalPhase: boolean;
}

export interface NativeRaceCountdownOutput {
  readonly elapsedUpdates: number;
  readonly fadeUpdates: number;
  readonly sceneFlags: number;
  /** Raw argument sent to 0x002087B0, absent once the fade has completed. */
  readonly fadeArgument: number | null;
  readonly soundCue: 45 | null;
  /** Calls 0x0025B3A8 at the fifth-second boundary. */
  readonly audioTransition: boolean;
  /** Ordered state-selector calls to 0x002340C0; visual glyphs are not inferred. */
  readonly uiStateIndices: readonly number[];
  /** Native callback resets its parent task and deletes itself. */
  readonly completed: boolean;
}

/** PAL's initial global at gp-30824. A runtime video-mode change may replace it. */
export function readInitialNativeRaceUpdateRate(executable: Uint8Array): 50 | 60 {
  return new Elf32AddressSpace(executable).u32(0x003d5f88) !== 0 ? 50 : 60;
}

/** Exact control portion of scheduled start callback 0x0022F068. */
export function advanceNativeRaceCountdown(input: NativeRaceCountdownInput): NativeRaceCountdownOutput {
  if (!Number.isInteger(input.elapsedUpdates) || input.elapsedUpdates < 0 || input.elapsedUpdates > 0x7fffffff ||
    !Number.isInteger(input.fadeUpdates) || input.fadeUpdates < 0 || input.fadeUpdates > 0x7fff ||
    (input.updatesPerSecond !== 50 && input.updatesPerSecond !== 60)) throw new RangeError("Invalid native race start counters/rate.");
  let sceneFlags = input.sceneFlags >>> 0;
  let fadeUpdates = input.fadeUpdates;
  let fadeArgument: number | null = null;
  if (fadeUpdates < 64) {
    sceneFlags = (sceneFlags & ~0x10000) >>> 0;
    fadeArgument = ((64 - fadeUpdates) << 25) >>> 0;
    fadeUpdates++;
  }
  const base = { elapsedUpdates: input.elapsedUpdates, fadeUpdates, sceneFlags, fadeArgument,
    soundCue: null, audioTransition: false, uiStateIndices: [], completed: false } as const;
  if ((sceneFlags & 0x4000) !== 0) return { ...base, elapsedUpdates: 0 };
  const tick = input.elapsedUpdates, rate = input.updatesPerSecond;
  const soundCue = tick === rate ? 45 : null;
  const audioTransition = tick === rate * 5;
  if (tick === rate * 4) sceneFlags |= 4;
  if (audioTransition) sceneFlags |= 0x100;
  if (tick < rate * 5) return { ...base, sceneFlags: sceneFlags >>> 0, soundCue,
    uiStateIndices: [Math.trunc(tick / rate) + 2] };
  const completed = input.shortFinalPhase || tick === rate * 6 || (sceneFlags & 0x8000) !== 0;
  if (completed) sceneFlags |= 0x114;
  return { ...base, sceneFlags: sceneFlags >>> 0, soundCue, audioTransition,
    uiStateIndices: completed ? [6, 0] : [6], completed };
}
