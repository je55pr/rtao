import type { AudioPlaybackHandle, BrowserAudioRuntime } from "./browserAudio";
import { decodeTvbSlotClip, type PcmClip } from "./pcm";
import { decodePackedTsqRequest, readTsq, tokenizeTsqBytecode, type TsqFile } from "../formats/tsq";
import { readTvb, type TvbBank } from "../formats/tvb";

export type NativeSfxEvent =
  | "menu-confirm"
  | "menu-cancel"
  | "menu-navigate"
  | "dialogue-open"
  | "interaction-advance"
  | "vehicle-contact"
  | "equipment-fit"
  | "race-countdown"
  | "race-lap"
  | "race-best-lap";

export interface NativeSfxRoute {
  readonly event: NativeSfxEvent;
  readonly request: number;
  readonly bank: 0 | 3;
  readonly index: number;
  readonly priority: number;
  readonly tone: number;
  readonly sampleStart: number;
  readonly sampleEnd: number;
}

function route(
  event: NativeSfxEvent,
  request: number,
  bank: 0 | 3,
  index: number,
  tone: number,
  sampleStart: number,
  sampleEnd: number,
): NativeSfxRoute {
  return { event, request, bank, index, priority: 144, tone, sampleStart, sampleEnd };
}

export const nativeSfxRoutes: Readonly<Record<NativeSfxEvent, NativeSfxRoute>> = {
  "menu-confirm": route("menu-confirm", 0x001a, 0, 26, 5, 41_216, 42_640),
  "menu-cancel": route("menu-cancel", 0x001b, 0, 27, 6, 42_640, 43_936),
  "menu-navigate": route("menu-navigate", 0x001d, 0, 29, 8, 44_496, 44_928),
  "dialogue-open": route("dialogue-open", 0x0025, 0, 37, 16, 69_040, 70_096),
  "interaction-advance": route("interaction-advance", 0x0026, 0, 38, 17, 70_096, 71_104),
  "vehicle-contact": route("vehicle-contact", 0x0028, 0, 40, 18, 71_104, 78_032),
  "equipment-fit": route("equipment-fit", 0x0303, 3, 3, 13, 90_608, 103_312),
  "race-countdown": route("race-countdown", 0x002d, 0, 45, 28, 113_264, 115_088),
  "race-lap": route("race-lap", 0x002e, 0, 46, 30, 116_960, 121_792),
  "race-best-lap": route("race-best-lap", 0x002f, 0, 47, 30, 116_960, 121_792),
};

export const nativeSfxInstalledPaths = [
  "SOUND/CQ_MAIN.TSQ",
  "SOUND/CQ_MAIN.TVB",
  "SOUND/ACTION.TSQ",
  "SOUND/ACTION.TVB",
] as const;

const nativeSpu2SampleRate = 48_000;

interface NativeSfxAudioHost {
  playEvent(clip: PcmClip): AudioPlaybackHandle | null;
}export type NativeSfxDispatchResult =
  | { readonly status: "played" | "locked"; readonly request: number; readonly event: NativeSfxEvent }
  | { readonly status: "cancelled"; readonly request: number }
  | { readonly status: "unsupported"; readonly request: number; readonly reason: string }
  | { readonly status: "unknown"; readonly request: number };

export interface NativeSfxAssets {
  readonly cqMainTsq: Uint8Array;
  readonly cqMainTvb: Uint8Array;
  readonly actionTsq: Uint8Array;
  readonly actionTvb: Uint8Array;
}

interface LoadedBank {
  readonly tsq: TsqFile;
  readonly tvb: TvbBank;
  readonly tvbBytes: Uint8Array;
}

const routeByRequest = new Map<number, NativeSfxRoute>(
  Object.values(nativeSfxRoutes).map((route) => [route.request, route]),
);

export type NativeSfxRequestClassification =
  | { readonly kind: "one-shot"; readonly route: NativeSfxRoute }
  | { readonly kind: "cancel"; readonly request: number }
  | { readonly kind: "unsupported-loop"; readonly request: 0x0010 | 0x0011; readonly reason: string }
  | { readonly kind: "unknown"; readonly request: number };

export function classifyNativeSfxRequest(request: number): NativeSfxRequestClassification {
  const packed = decodePackedTsqRequest(request);
  if (packed.cancel) return { kind: "cancel", request };
  const route = routeByRequest.get(request);
  if (route) return { kind: "one-shot", route };
  if (request === 0x0010 || request === 0x0011) {
    return {
      kind: "unsupported-loop",
      request,
      reason: "Boost uses a recovered channel-specific multi-tone looping TSQ sequence; exact sequencing/loop ownership is not reconstructed.",
    };
  }
  return { kind: "unknown", request };
}

export class NativeSfxRuntime {
  private readonly clips = new Map<number, PcmClip>();
  private readonly warnedUnsupported = new Set<number>();

  private constructor(
    private readonly audio: NativeSfxAudioHost,
    private readonly diagnostic: (message: string) => void,
  ) {}

  static fromAssets(
    audio: Pick<BrowserAudioRuntime, "playEvent">,
    assets: NativeSfxAssets,
    diagnostic: (message: string) => void = (message) => console.warn(message),
  ): NativeSfxRuntime {    const runtime = new NativeSfxRuntime(audio, diagnostic);
    const banks = new Map<number, LoadedBank>([
      [0, { tsq: readTsq(assets.cqMainTsq), tvb: readTvb(assets.cqMainTvb), tvbBytes: assets.cqMainTvb }],
      [3, { tsq: readTsq(assets.actionTsq), tvb: readTvb(assets.actionTvb), tvbBytes: assets.actionTvb }],
    ]);
    for (const route of Object.values(nativeSfxRoutes)) {
      const bank = banks.get(route.bank);
      if (!bank) throw new Error(`Native SFX bank ${route.bank} is unavailable.`);
      validateRoute(route, bank.tsq, bank.tvb);
      const cacheKey = (route.bank << 8) | route.tone;
      const clip = runtime.clips.get(cacheKey)
        ?? decodeTvbSlotClip(bank.tvbBytes, route.tone, nativeSpu2SampleRate);
      runtime.clips.set(cacheKey, clip);
      runtime.clips.set(route.request, clip);
    }
    return runtime;
  }

  dispatch(event: NativeSfxEvent): NativeSfxDispatchResult {
    return this.dispatchPackedRequest(nativeSfxRoutes[event].request);
  }

  dispatchPackedRequest(request: number): NativeSfxDispatchResult {
    const classification = classifyNativeSfxRequest(request);
    if (classification.kind === "cancel") {
      // The recovered boost/per-car cancellations are retained as native
      // requests. This adapter does not synthesize loop ownership that has not
      // yet been reconstructed, so cancellation is currently a truthful no-op.
      return { status: "cancelled", request };
    }
    if (classification.kind === "one-shot") {
      const route = classification.route;
      const clip = this.clips.get(request);
      if (!clip) throw new Error(`Native SFX request 0x${request.toString(16)} has no decoded clip.`);
      const handle = this.audio.playEvent(clip);
      return { status: handle ? "played" : "locked", request, event: route.event };
    }
    if (classification.kind === "unsupported-loop") {
      return this.unsupported(request, classification.reason);
    }
    return { status: "unknown", request };
  }

  private unsupported(request: number, reason: string): NativeSfxDispatchResult {
    if (!this.warnedUnsupported.has(request)) {
      this.warnedUnsupported.add(request);
      this.diagnostic(`Native SFX request 0x${request.toString(16).padStart(4, "0")} is recognized but not played: ${reason}`);
    }
    return { status: "unsupported", request, reason };
  }
}

export function nativeSfxRequestForEvent(event: NativeSfxEvent): number {
  return nativeSfxRoutes[event].request;
}

function validateRoute(route: NativeSfxRoute, tsq: TsqFile, tvb: TvbBank): void {
  const packed = decodePackedTsqRequest(route.request);
  if (packed.cancel || packed.bank !== route.bank || packed.index !== route.index) {
    throw new Error(`Native SFX route ${route.event} no longer matches packed request 0x${route.request.toString(16)}.`);
  }
  const entry = tsq.entries[route.index];
  if (!entry || entry.priority !== route.priority) {
    throw new Error(`Native SFX route ${route.event} expected TSQ priority ${route.priority} at entry ${route.index}.`);
  }
  const tones = tokenizeTsqBytecode(tsq.bytes, entry.sequenceOffset)
    .filter((token) => token.family === "tone")
    .flatMap((token) => token.immediateBytes);
  if (!tones.includes(route.tone)) {
    throw new Error(`Native SFX route ${route.event} expected tone ${route.tone} in TSQ entry ${route.index}.`);
  }
  const span = tvb.sampleBySlot[route.tone];
  if (!span || span.startOffset !== route.sampleStart || span.endOffset !== route.sampleEnd) {
    throw new Error(
      `Native SFX route ${route.event} expected TVB slot ${route.tone} span ${route.sampleStart}..${route.sampleEnd}.`,
    );
  }
}
// PAL SLES_513.56 evidence recovered by sfx-archaeology:
// - all common one-shot routes above are priority 144;
// - explicit 0x8000 cancellation is material for boost/per-car channels;
// - successful Parts/Body/Paint mutations have no purchase-specific one-shot;
// - ordinary finish has no extra discrete cue beyond the final-lap result path;
// - hard-ground impact kind 1 uses a separate six-byte lower-audio-object
//   envelope and is therefore intentionally not faked through TSQ/TVB here.
// Common one-shot sequences contain no recovered pitch opcode, so their TVB
// ADPCM is decoded at the PS2 SPU2's 48 kHz unity playback clock.
