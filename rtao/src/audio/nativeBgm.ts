/**
 * PAL BGM contract recovered from SLES_513.56 / SNDMOD.IRX.
 *
 * This module deliberately stops at proven selection/transport intent. It does
 * not turn authored area indices into scene selectors and it does not pretend
 * that TSQ is a flat PCM loop: native loops live in per-channel F8 bytecode.
 */
export interface NativeBgmProgram {
  readonly tsqFile: string;
  readonly sequenceIndex: number;
}

export type NativeBgmTransportCommand =
  | { readonly kind: "select"; readonly program: NativeBgmProgram }
  | { readonly kind: "start" }
  | { readonly kind: "hard-stop" }
  | { readonly kind: "mute" }
  | { readonly kind: "unmute" }
  | { readonly kind: "fade-out" }
  | { readonly kind: "fade-in" };

export const palOrdinaryRaceMusicStartUpdate = 250;
export const palMusicFadeAudioUpdates = 64;

const commonSceneTrack = new Map<number, number>([
  [0, 1],
  [1, 1],
  [2, 8],
  [3, 8],
  [4, 5],
  [5, 5],
  [6, 7],
  [7, 9],
  [8, 6],
  [9, 6],
  [10, 6],
  [11, 7],
  [12, 9],
  [13, 4],
  [14, 4],
  [15, 10],
  [16, 10],
  [17, 3],
  [26, 12],
  [28, 11],
]);

function assertSceneSelector(sceneSelector: number): void {
  if (!Number.isSafeInteger(sceneSelector) || sceneSelector < 0 || sceneSelector > 0xff) {
    throw new RangeError(`Native BGM scene selector must be a byte; got ${sceneSelector}.`);
  }
}

function bgmFile(track: number): string {
  return `BGM_${track.toString().padStart(2, "0")}.TSQ`;
}

/**
 * Resolves the shared scene handler's byte at scene +0x22.
 * Unknown common selector values use the native BGM_02 fallback.
 */
export function resolveCommonSceneBgm(sceneSelector: number): NativeBgmProgram {
  assertSceneSelector(sceneSelector);
  const track = commonSceneTrack.get(sceneSelector) ?? 2;
  return { tsqFile: bgmFile(track), sequenceIndex: 1 };
}
/**
 * Fixed interiors share ROOM_1.TSQ. The executable proves sequences 1..4 but
 * the retained archaeology does not assign Q's Factory (or room names) to one
 * of them, so callers must supply only a separately recovered sequence.
 */
export function resolveRoomBgm(sequenceIndex: number): NativeBgmProgram {
  if (!Number.isSafeInteger(sequenceIndex) || sequenceIndex < 1 || sequenceIndex > 4) {
    throw new RangeError(`ROOM_1 sequence must be an integer in 1..4; got ${sequenceIndex}.`);
  }
  return { tsqFile: "ROOM_1.TSQ", sequenceIndex };
}

/** Initial scene setup selects the program before issuing native start. */
export function initialBgmStart(program: NativeBgmProgram): readonly NativeBgmTransportCommand[] {
  return [
    { kind: "select", program },
    { kind: "start" },
  ];
}

/**
 * Proven ordinary transition ordering: fade-out -> hard stop/reset -> select
 * new TSQ -> start. Fade-in exists as a distinct native command but is not
 * assumed here because the common transition witness did not require it.
 */
export function transitionBgmTo(program: NativeBgmProgram): readonly NativeBgmTransportCommand[] {
  return [
    { kind: "fade-out" },
    { kind: "hard-stop" },
    { kind: "select", program },
    { kind: "start" },
  ];
}
/**
 * Race setup resolves/loads through activity.sceneId, but native start is held
 * until update 250 (five seconds at the PAL 50 Hz simulation cadence).
 */
export function ordinaryRaceBgmSetup(sceneSelector: number): {
  readonly program: NativeBgmProgram;
  readonly startUpdate: number;
} {
  return {
    program: resolveCommonSceneBgm(sceneSelector),
    startUpdate: palOrdinaryRaceMusicStartUpdate,
  };
}

/**
 * SNDMOD commands 3/4 change music gain without rewinding/suspending TSQ state.
 * Keep that semantic distinction explicit for a future sequencer-backed sink.
 */
export function nativeMuteCommand(muted: boolean): NativeBgmTransportCommand {
  return { kind: muted ? "mute" : "unmute" };
}

export function nativeFadeCommand(direction: "out" | "in"): NativeBgmTransportCommand {
  return { kind: direction === "out" ? "fade-out" : "fade-in" };
}
