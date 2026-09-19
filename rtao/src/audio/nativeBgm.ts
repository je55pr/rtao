/**
 * PAL BGM contract recovered from SLES_513.56 / SNDMOD.IRX.
 *
 * This module deliberately stops at proven selection/transport intent. The
 * PAL outdoor path proves ordinary free-roam does not use the common scene
 * selector, so authored area indices are never converted into BGM selectors.
 * TSQ is also not a flat PCM loop: native loops live in per-channel F8 bytecode.
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
export const qFactoryBgmProgram: NativeBgmProgram = { tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 };

export type NativeBgmScene =
  | { readonly kind: "ordinary-free-roam" }
  | { readonly kind: "fixed-interior"; readonly areaIndex: number; readonly localIndex: number }
  | { readonly kind: "q-factory" }
  | { readonly kind: "ordinary-race"; readonly sceneSelector: number };

const fixedRoomSequence3 = new Set([
  "1:1", "1:2", "1:3",
  "2:1", "2:2", "2:3",
  "3:1", "3:2", "3:3",
  "5:1",
  "6:1", "6:2", "6:3",
  "7:1", "7:2",
  "9:1", "9:2", "9:3", "9:5", "9:7",
]);

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
 * Resolves the activity/race common handler's byte at scene +0x22.
 * Outdoor free-roam writes a different sentinel there and never references
 * this handler. Unknown activity selector values use the native BGM_02 fallback.
 */
export function resolveCommonSceneBgm(sceneSelector: number): NativeBgmProgram {
  assertSceneSelector(sceneSelector);
  const track = commonSceneTrack.get(sceneSelector) ?? 2;
  return { tsqFile: bgmFile(track), sequenceIndex: 1 };
}
/**
 * Fixed interiors share ROOM_1.TSQ. Q's Factory is now proven to use sequence
 * 1; other fixed-room paths legitimately select 2..4 and remain unmapped to
 * browser room identities until their native context routing is recovered.
 */
export function resolveRoomBgm(sequenceIndex: number): NativeBgmProgram {
  if (!Number.isSafeInteger(sequenceIndex) || sequenceIndex < 1 || sequenceIndex > 4) {
    throw new RangeError(`ROOM_1 sequence must be an integer in 1..4; got ${sequenceIndex}.`);
  }
  return { tsqFile: "ROOM_1.TSQ", sequenceIndex };
}

export function resolveQFactoryBgm(): NativeBgmProgram {
  return { ...qFactoryBgmProgram };
}

/**
 * Exact fixed-room routing recovered from 0x0022C398.
 *
 * Sequence 4 is retained only for the native Cloud Hill (8,9) sentinel. The
 * normal browser interaction finder filters that disabled polygon, so ordinary
 * play never enters sequence 4 through this resolver.
 */
export function resolveFixedRoomBgm(areaIndex: number, localIndex: number): NativeBgmProgram {
  if (!Number.isSafeInteger(areaIndex) || areaIndex < 0 || areaIndex > 0xff) {
    throw new RangeError(`Fixed-room area index must be a byte; got ${areaIndex}.`);
  }
  if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex > 0xff) {
    throw new RangeError(`Fixed-room local index must be a byte; got ${localIndex}.`);
  }
  if (areaIndex < 10 && localIndex === 0) return resolveRoomBgm(1);
  if (fixedRoomSequence3.has(`${areaIndex}:${localIndex}`)) return resolveRoomBgm(3);
  if (areaIndex === 8 && localIndex === 9) return resolveRoomBgm(4);
  return resolveRoomBgm(2);
}

/**
 * Scene-level boundary for currently recovered normal gameplay. PAL proves that
 * ordinary free-roam does not use the activity/race selector; returning no
 * program is deliberate until its separate music owner is recovered.
 */
export function resolveNativeBgmScene(scene: NativeBgmScene): NativeBgmProgram | undefined {
  if (scene.kind === "ordinary-free-roam") return undefined;
  if (scene.kind === "q-factory") return resolveQFactoryBgm();
  if (scene.kind === "fixed-interior") return resolveFixedRoomBgm(scene.areaIndex, scene.localIndex);
  return resolveCommonSceneBgm(scene.sceneSelector);
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
