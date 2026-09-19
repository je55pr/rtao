import type { AudioPlaybackHandle, BrowserAudioRuntime } from "./browserAudio";
import { decodeTvbSlotClip, type PcmClip, type PcmLoop } from "./pcm";
import { readTvb } from "../formats/tvb";

const spu2SampleRate = 48_000;
const spu2UnityPitchWord = 0x1000;
const spu2MaxVolumeWord = 0x3fff;

export const nativeEngineDefaultVolumeWord = 7372;

export const nativeEngineLayers = [
  { selector: 0 as const, slot: 42, startOffset: 0x25f30, endOffset: 0x26cc0, adpcmFrames: 217, loopStartAdpcmFrame: 23 },
  { selector: 1 as const, slot: 41, startOffset: 0x252c0, endOffset: 0x25f30, adpcmFrames: 199, loopStartAdpcmFrame: 25 },
] as const;

export type NativeEngineLayerSelector = 0 | 1;

export interface NativeEngineAudioFrame {
  readonly engineSpeed: number;
  readonly layerSelector: NativeEngineLayerSelector;
  /** Recovered native effect input. Browser effect processing remains intentionally separate. */
  readonly effectSelector?: number;
}
export interface NativeEngineAudioParameters {
  readonly engineSpeed: number;
  readonly pitchWord: number;
  readonly playbackRate: number;
  readonly layerSelector: NativeEngineLayerSelector;
  readonly sampleSlot: 41 | 42;
  readonly effectSelector: number;
}

export interface NativeEngineAudioSnapshot extends NativeEngineAudioParameters {
  readonly running: boolean;
  readonly muted: boolean;
  readonly leftVolumeWord: number;
  readonly rightVolumeWord: number;
}

interface EngineLayer {
  readonly clip: PcmClip;
  readonly loop: PcmLoop;
}

type EngineAudioHost = Pick<BrowserAudioRuntime, "playLoop">;

function assertEngineSpeed(engineSpeed: number): void {
  if (!Number.isInteger(engineSpeed) || engineSpeed < 0) {
    throw new RangeError(`Native engine speed must be a non-negative integer; got ${engineSpeed}.`);
  }
}
function assertLayerSelector(selector: number): asserts selector is NativeEngineLayerSelector {
  if (selector !== 0 && selector !== 1) {
    throw new RangeError(`Native engine layer selector must be 0 or 1; got ${selector}.`);
  }
}

export function nativeEnginePitchWord(engineSpeed: number): number {
  assertEngineSpeed(engineSpeed);
  const rpm = Math.min(10_000, engineSpeed);
  const segments = [
    [0, 2_000, 2_000, 3_000],
    [2_000, 4_000, 3_000, 9_500],
    [4_000, 8_000, 10_000, 16_000],
    [8_000, 10_000, 16_000, 16_383],
  ] as const;
  const [rpm0, rpm1, pitch0, pitch1] = segments.find((segment) => rpm <= segment[1])!;
  return pitch0 + Math.trunc((rpm - rpm0) * (pitch1 - pitch0) / (rpm1 - rpm0));
}

/** SPU2 pitch is Q12: 0x1000 plays a 48 kHz source at its native rate. */
export function nativeSpu2PlaybackRate(pitchWord: number): number {
  if (!Number.isInteger(pitchWord) || pitchWord <= 0 || pitchWord > 0x3fff) {
    throw new RangeError(`SPU2 pitch word must be an integer in 1..0x3fff; got ${pitchWord}.`);
  }
  return pitchWord / spu2UnityPitchWord;
}
export function nativeEngineVolumeGain(volumeWord: number): number {
  if (!Number.isInteger(volumeWord) || volumeWord < 0 || volumeWord > spu2MaxVolumeWord) {
    throw new RangeError(`SPU2 engine volume must be an integer in 0..0x3fff; got ${volumeWord}.`);
  }
  return volumeWord / spu2MaxVolumeWord;
}

export function nativeEngineAudioParameters(frame: NativeEngineAudioFrame): NativeEngineAudioParameters {
  assertEngineSpeed(frame.engineSpeed);
  assertLayerSelector(frame.layerSelector);
  const pitchWord = nativeEnginePitchWord(frame.engineSpeed);
  return {
    engineSpeed: frame.engineSpeed,
    pitchWord,
    playbackRate: nativeSpu2PlaybackRate(pitchWord),
    layerSelector: frame.layerSelector,
    sampleSlot: nativeEngineLayers[frame.layerSelector].slot,
    effectSelector: frame.effectSelector ?? 0,
  };
}

function readEngineLayers(cqMainTvb: Uint8Array): readonly [EngineLayer, EngineLayer] {
  const bank = readTvb(cqMainTvb);
  const layers = nativeEngineLayers.map((definition) => {
    const sample = bank.sampleBySlot[definition.slot];
    if (!sample) throw new Error(`CQ_MAIN engine slot ${definition.slot} is not playable.`);
    if (sample.startOffset !== definition.startOffset || sample.endOffset !== definition.endOffset ||
        sample.frameCount !== definition.adpcmFrames || bank.adsrWords[definition.slot] !== 0xd2f2e11e) {
      throw new Error(`CQ_MAIN engine slot ${definition.slot} does not match the recovered PAL loop contract.`);
    }
    const startControl = sample.adpcm[definition.loopStartAdpcmFrame * 16 + 1];
    const endControl = sample.adpcm[(definition.adpcmFrames - 1) * 16 + 1];
    if (startControl !== 6 || endControl !== 3) {
      throw new Error(`CQ_MAIN engine slot ${definition.slot} has unexpected ADPCM loop controls.`);
    }
    const clip = decodeTvbSlotClip(cqMainTvb, definition.slot, spu2SampleRate);
    return {
      clip,
      loop: {
        startFrame: definition.loopStartAdpcmFrame * 28,
        endFrame: definition.adpcmFrames * 28,
      },
    };
  });
  return layers as unknown as readonly [EngineLayer, EngineLayer];
}

export class NativeEngineAudioRuntime {
  private readonly layers: readonly [EngineLayer, EngineLayer];
  private handles?: readonly [AudioPlaybackHandle, AudioPlaybackHandle];
  private frame: NativeEngineAudioFrame = { engineSpeed: 0, layerSelector: 0, effectSelector: 0 };
  private muted = false;
  private leftVolumeWord = nativeEngineDefaultVolumeWord;
  private rightVolumeWord = nativeEngineDefaultVolumeWord;
  constructor(private readonly audio: EngineAudioHost, cqMainTvb: Uint8Array) {
    this.layers = readEngineLayers(cqMainTvb);
  }

  static fromCqMainTvb(audio: EngineAudioHost, cqMainTvb: Uint8Array): NativeEngineAudioRuntime {
    return new NativeEngineAudioRuntime(audio, cqMainTvb);
  }

  start(frame: NativeEngineAudioFrame = this.frame): void {
    this.frame = nativeEngineAudioParameters(frame);
    if (!this.handles) {
      const parameters = nativeEngineAudioParameters(this.frame);
      this.handles = this.layers.map((layer) => this.audio.playLoop(layer.clip, {
        bus: "sfx",
        gain: 0,
        playbackRate: parameters.playbackRate,
        loop: layer.loop,
      })) as unknown as readonly [AudioPlaybackHandle, AudioPlaybackHandle];
    }
    this.apply();
  }

  update(frame: NativeEngineAudioFrame): void {
    this.frame = frame;
    if (this.handles) this.apply();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.handles) this.apply();
  }
  setVolumes(left: number, right: number, mono = false): void {
    nativeEngineVolumeGain(left);
    nativeEngineVolumeGain(right);
    if (mono) {
      const average = Math.trunc((left + right) / 2);
      this.leftVolumeWord = average;
      this.rightVolumeWord = average;
    } else {
      if (left !== right) {
        throw new Error("Unequal PAL engine L/R volume requires a recovered browser stereo-volume path.");
      }
      this.leftVolumeWord = left;
      this.rightVolumeWord = right;
    }
    if (this.handles) this.apply();
  }

  stop(): void {
    if (!this.handles) return;
    for (const handle of this.handles) handle.stop();
    this.handles = undefined;
  }

  snapshot(): NativeEngineAudioSnapshot {
    return {
      ...nativeEngineAudioParameters(this.frame),
      running: !!this.handles,
      muted: this.muted,
      leftVolumeWord: this.leftVolumeWord,
      rightVolumeWord: this.rightVolumeWord,
    };
  }

  private apply(): void {
    if (!this.handles) return;
    const parameters = nativeEngineAudioParameters(this.frame);
    for (const handle of this.handles) handle.setPlaybackRate(parameters.playbackRate);

    // The common engine initialization is centered (7372/7372). Unequal
    // stereo words are rejected by setVolumes rather than approximated.
    const gain = this.muted ? 0 : nativeEngineVolumeGain(this.leftVolumeWord);
    this.handles[0].setGain(parameters.layerSelector === 0 ? gain : 0);
    this.handles[1].setGain(parameters.layerSelector === 1 ? gain : 0);
  }
}
