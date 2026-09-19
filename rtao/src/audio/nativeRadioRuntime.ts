import type { AudioMusicVoiceOptions, AudioPlaybackHandle, BrowserAudioRuntime } from "./browserAudio";
import type { PcmClip } from "./pcm";
import {
  decodePsAdpcmFrame,
  readPsAdpcmFrame,
  type PsAdpcmState,
} from "../formats/psAdpcm";
import { readPalVag, type PalVagFile } from "../formats/vag";

export const nativeRadioTickMicroseconds = 16_666;
export const nativeRadioTickMilliseconds = nativeRadioTickMicroseconds / 1_000;
export const nativeRadioCycleTicks = 216_000;
export const nativeRadioProgramTicks = 1_800;
export const nativeRadioProgramsPerTune = 120;
export const nativeRadioDefaultState = 2;
export const nativeRadioDefaultVolume = 90;
export const nativeRadioSampleRate = 12_000;
export const nativeRadioVolumeScale = 128;
export const nativeRadioCycleSamples = Math.floor(
  nativeRadioCycleTicks * nativeRadioSampleRate * nativeRadioTickMicroseconds / 1_000_000,
);

export interface NativeRadioTuneAssets {
  readonly left: Uint8Array;
  readonly right: Uint8Array;
}

export interface NativeRadioAssets {
  readonly tune0: NativeRadioTuneAssets;
  readonly tune1: NativeRadioTuneAssets;
}

export interface NativeRadioSelection {
  readonly state: 1 | 2;
  readonly tuneIndex: 0 | 1;
  readonly leftFile: "1CH_L.VAG" | "3CH_L.VAG";
  readonly rightFile: "1CH_R.VAG" | "3CH_R.VAG";
}

export interface NativeRadioSnapshot {
  readonly active: boolean;
  readonly state: 0 | 1 | 2;
  readonly volume: number;
  readonly tick: number;
  readonly program?: number;
  readonly scheduledChunks: number;
}

interface NativeRadioAudioHost {
  playMusicVoice(clip: PcmClip, options?: AudioMusicVoiceOptions): AudioPlaybackHandle;
  audioTimeSeconds(): number | undefined;
}

interface NativeRadioClock {
  now(): number;
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface NativeRadioRuntimeOptions {
  readonly autoClock?: boolean;
  readonly isAudioReady?: () => boolean;
  readonly clock?: NativeRadioClock;
  readonly chunkSamples?: number;
  readonly lookaheadSeconds?: number;
  readonly initialTick?: number;
  readonly onError?: (error: unknown) => void;
}

const defaultClock: NativeRadioClock = {
  now: () => performance.now(),
  setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

export function resolveNativeRadioState(state: number): NativeRadioSelection | undefined {
  if (state === 0) return undefined;
  if (state === 1) {
    return { state: 1, tuneIndex: 0, leftFile: "1CH_L.VAG", rightFile: "1CH_R.VAG" };
  }
  if (state === 2) {
    return { state: 2, tuneIndex: 1, leftFile: "3CH_L.VAG", rightFile: "3CH_R.VAG" };
  }
  throw new RangeError(`Ordinary PAL radio state must be 0, 1, or 2; got ${state}.`);
}

export function nativeRadioProgram(tuneIndex: number, playTimeTicks: number): number {
  if (!Number.isSafeInteger(tuneIndex) || tuneIndex < 0 || tuneIndex > 2) {
    throw new RangeError(`Native radio tune index must be 0..2; got ${tuneIndex}.`);
  }
  if (!Number.isSafeInteger(playTimeTicks) || playTimeTicks < 0) {
    throw new RangeError(`Native radio play time must be a non-negative integer; got ${playTimeTicks}.`);
  }
  const wrapped = playTimeTicks % nativeRadioCycleTicks;
  return tuneIndex * nativeRadioProgramsPerTune + Math.floor(wrapped / nativeRadioProgramTicks);
}

export function nativeRadioVolumeWord(volume: number): number {
  if (!Number.isSafeInteger(volume) || volume < 0 || volume > 0x7f) {
    throw new RangeError(`Native radio volume must be an integer in 0..127; got ${volume}.`);
  }
  return volume * nativeRadioVolumeScale;
}

export function nativeRadioGain(volume: number): number {
  return nativeRadioVolumeWord(volume) / 0x3fff;
}

export function nativeRadioSampleAtTick(playTimeTicks: number): number {
  if (!Number.isSafeInteger(playTimeTicks) || playTimeTicks < 0) {
    throw new RangeError(`Native radio play time must be a non-negative integer; got ${playTimeTicks}.`);
  }
  const wrapped = playTimeTicks % nativeRadioCycleTicks;
  return Math.floor(wrapped * nativeRadioSampleRate * nativeRadioTickMicroseconds / 1_000_000);
}

interface ChannelCursorSnapshot {
  readonly frameIndex: number;
  readonly frameOffset: number;
  readonly sampleCursor: number;
  readonly state: PsAdpcmState;
  readonly currentFrame?: Int16Array;
}

class PalVagChannelCursor {
  private readonly bytes: Uint8Array;
  private readonly vag: PalVagFile;
  private frameIndex = 0;
  private frameOffset = 0;
  private sampleCursor = 0;
  private state: PsAdpcmState = { previous1: 0, previous2: 0 };
  private currentFrame?: Int16Array;

  constructor(bytes: Uint8Array, snapshot?: ChannelCursorSnapshot) {
    this.bytes = bytes;
    this.vag = readPalVag(bytes);
    if (snapshot) this.restore(snapshot);
  }

  get sampleRate(): number {
    return this.vag.sampleRate;
  }

  get cursor(): number {
    return this.sampleCursor;
  }

  clone(): PalVagChannelCursor {
    return new PalVagChannelCursor(this.bytes, this.snapshot());
  }

  reset(): void {
    this.frameIndex = 0;
    this.frameOffset = 0;
    this.sampleCursor = 0;
    this.state = { previous1: 0, previous2: 0 };
    this.currentFrame = undefined;
  }

  seekCycleSample(target: number): void {
    if (!Number.isSafeInteger(target) || target < 0 || target > nativeRadioCycleSamples) {
      throw new RangeError(`Native radio sample target ${target} is outside 0..${nativeRadioCycleSamples}.`);
    }
    if (target < this.sampleCursor) this.reset();
    this.skip(target - this.sampleCursor);
  }

  readFloat32(count: number): Float32Array {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Native radio sample count must be a non-negative integer; got ${count}.`);
    }
    const output = new Float32Array(count);
    let target = 0;
    while (target < count) {
      const frame = this.ensureFrame();
      const available = frame.length - this.frameOffset;
      const take = Math.min(available, count - target);
      for (let index = 0; index < take; index += 1) {
        output[target + index] = frame[this.frameOffset + index]! / 0x8000;
      }
      this.consume(take);
      target += take;
    }
    return output;
  }

  skip(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Native radio skip count must be a non-negative integer; got ${count}.`);
    }
    let remaining = count;
    while (remaining > 0) {
      const frame = this.ensureFrame();
      const take = Math.min(frame.length - this.frameOffset, remaining);
      this.consume(take);
      remaining -= take;
    }
  }

  private ensureFrame(): Int16Array {
    if (this.currentFrame) return this.currentFrame;
    if (this.frameIndex >= this.vag.frameCount) {
      throw new Error(`PAL radio VAG ended at frame ${this.frameIndex} before the native one-hour cycle.`);
    }
    const decoded = decodePsAdpcmFrame(
      readPsAdpcmFrame(this.vag.payload, this.frameIndex * 16),
      this.state,
    );
    this.state = decoded.state;
    this.currentFrame = decoded.samples;
    this.frameOffset = 0;
    this.frameIndex += 1;
    return decoded.samples;
  }

  private consume(samples: number): void {
    this.frameOffset += samples;
    this.sampleCursor += samples;
    if (this.currentFrame && this.frameOffset >= this.currentFrame.length) {
      this.currentFrame = undefined;
      this.frameOffset = 0;
    }
  }

  private snapshot(): ChannelCursorSnapshot {
    return {
      frameIndex: this.frameIndex,
      frameOffset: this.frameOffset,
      sampleCursor: this.sampleCursor,
      state: { ...this.state },
      ...(this.currentFrame ? { currentFrame: new Int16Array(this.currentFrame) } : {}),
    };
  }

  private restore(snapshot: ChannelCursorSnapshot): void {
    this.frameIndex = snapshot.frameIndex;
    this.frameOffset = snapshot.frameOffset;
    this.sampleCursor = snapshot.sampleCursor;
    this.state = { ...snapshot.state };
    this.currentFrame = snapshot.currentFrame ? new Int16Array(snapshot.currentFrame) : undefined;
  }

}

class StereoCursor {
  constructor(
    readonly left: PalVagChannelCursor,
    readonly right: PalVagChannelCursor,
  ) {
    if (left.sampleRate !== right.sampleRate) {
      throw new Error(`PAL radio VAG sample rates differ: ${left.sampleRate} != ${right.sampleRate}.`);
    }
    if (left.sampleRate !== nativeRadioSampleRate) {
      throw new Error(`PAL radio VAG sample rate ${left.sampleRate} is not the recovered ${nativeRadioSampleRate} Hz.`);
    }
  }

  get cursor(): number {
    if (this.left.cursor !== this.right.cursor) throw new Error("PAL radio stereo cursors diverged.");
    return this.left.cursor;
  }

  clone(): StereoCursor {
    return new StereoCursor(this.left.clone(), this.right.clone());
  }

  seekCycleSample(target: number): void {
    this.left.seekCycleSample(target);
    this.right.seekCycleSample(target);
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }

  readClip(count: number): PcmClip {
    const left = this.left.readFloat32(count);
    const right = this.right.readFloat32(count);
    return { sampleRate: nativeRadioSampleRate, channels: [left, right], frameCount: count };
  }
}

export class NativeRadioRuntime {
  private readonly audio: NativeRadioAudioHost;
  private readonly clock: NativeRadioClock;
  private readonly isAudioReady: () => boolean;
  private readonly chunkSamples: number;
  private readonly lookaheadSeconds: number;
  private readonly baseTunes: readonly [StereoCursor, StereoCursor];
  private scheduledCursor?: StereoCursor;
  private scheduledAtSeconds = 0;
  private readonly scheduledHandles: AudioPlaybackHandle[] = [];
  private state: 0 | 1 | 2 = nativeRadioDefaultState;
  private volume = nativeRadioDefaultVolume;
  private active = false;
  private currentTick = 0;
  private wallEpoch = 0;
  private timer?: unknown;

  constructor(
    audio: Pick<BrowserAudioRuntime, "playMusicVoice" | "audioTimeSeconds">,
    assets: NativeRadioAssets,
    options: NativeRadioRuntimeOptions = {},
  ) {
    this.audio = audio;
    this.clock = options.clock ?? defaultClock;
    this.isAudioReady = options.isAudioReady ?? (() => audio.audioTimeSeconds() !== undefined);
    this.chunkSamples = options.chunkSamples ?? 6_000;
    this.lookaheadSeconds = options.lookaheadSeconds ?? 1.5;
    if (!Number.isSafeInteger(this.chunkSamples) || this.chunkSamples <= 0) {
      throw new RangeError(`Native radio chunkSamples must be a positive integer; got ${this.chunkSamples}.`);
    }
    if (!Number.isFinite(this.lookaheadSeconds) || this.lookaheadSeconds <= 0) {
      throw new RangeError(`Native radio lookaheadSeconds must be finite and positive; got ${this.lookaheadSeconds}.`);
    }
    this.baseTunes = [
      new StereoCursor(new PalVagChannelCursor(assets.tune0.left), new PalVagChannelCursor(assets.tune0.right)),
      new StereoCursor(new PalVagChannelCursor(assets.tune1.left), new PalVagChannelCursor(assets.tune1.right)),
    ];
    const initialTick = options.initialTick ?? 0;
    if (!Number.isSafeInteger(initialTick) || initialTick < 0) {
      throw new RangeError(`Native radio initialTick must be a non-negative integer; got ${initialTick}.`);
    }
    this.currentTick = initialTick;
    this.wallEpoch = this.clock.now() - initialTick * nativeRadioTickMilliseconds;
    this.syncBaseCursors();
    if (options.autoClock !== false) {
      this.timer = this.clock.setInterval(() => {
        try {
          this.pumpClock();
        } catch (error) {
          this.stopOutdoor();
          options.onError?.(error);
        }
      }, 100);
    }
  }

  startOutdoor(): void {
    this.active = true;
    this.pumpClock();
    this.resetSchedule();
    this.fillSchedule();
  }

  stopOutdoor(): void {
    this.active = false;
    this.stopScheduled();
  }

  setState(state: 0 | 1 | 2): void {
    const selection = resolveNativeRadioState(state);
    if (this.state === state) return;
    this.state = state;
    this.stopScheduled();
    if (selection) {
      this.baseTunes[selection.tuneIndex].seekCycleSample(nativeRadioSampleAtTick(this.currentTick));
    }
    if (this.active && state !== 0) {
      this.resetSchedule();
      this.fillSchedule();
    }
  }

  setVolume(volume: number): void {
    nativeRadioVolumeWord(volume);
    this.volume = volume;
    const gain = nativeRadioGain(volume);
    for (const handle of this.scheduledHandles) if (!handle.stopped) handle.setGain(gain);
  }

  advanceNativeTicks(ticks: number): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new RangeError(`Native radio tick delta must be a non-negative integer; got ${ticks}.`);
    }
    if (ticks === 0) return;
    this.currentTick += ticks;
    this.syncBaseCursors();
    if (this.active && this.state !== 0) this.fillSchedule();
  }

  snapshot(): NativeRadioSnapshot {
    const selection = resolveNativeRadioState(this.state);
    return {
      active: this.active,
      state: this.state,
      volume: this.volume,
      tick: this.currentTick,
      ...(selection ? { program: nativeRadioProgram(selection.tuneIndex, this.currentTick) } : {}),
      scheduledChunks: this.scheduledHandles.filter((handle) => !handle.stopped).length,
    };
  }

  dispose(): void {
    this.stopScheduled();
    if (this.timer !== undefined) {
      this.clock.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private pumpClock(): void {
    const now = this.clock.now();
    const target = Math.floor((now - this.wallEpoch) / nativeRadioTickMilliseconds);
    if (target > this.currentTick) {
      this.currentTick = target;
      this.syncBaseCursors();
    }
    this.pruneScheduled();
    if (this.active && this.state !== 0 && this.isAudioReady()) this.fillSchedule();
  }

  private syncBaseCursors(): void {
    const selection = resolveNativeRadioState(this.state);
    if (!selection) return;
    this.baseTunes[selection.tuneIndex].seekCycleSample(nativeRadioSampleAtTick(this.currentTick));
  }

  private resetSchedule(): void {
    this.stopScheduled();
    const selection = resolveNativeRadioState(this.state);
    const audioTime = this.audio.audioTimeSeconds();
    if (!selection || audioTime === undefined) {
      this.scheduledCursor = undefined;
      return;
    }
    this.syncBaseCursors();
    this.scheduledCursor = this.baseTunes[selection.tuneIndex].clone();
    this.scheduledAtSeconds = audioTime;
  }

  private fillSchedule(): void {
    const selection = resolveNativeRadioState(this.state);
    const audioTime = this.audio.audioTimeSeconds();
    if (!selection || audioTime === undefined) return;
    if (!this.scheduledCursor) this.resetSchedule();
    const cursor = this.scheduledCursor;
    if (!cursor) return;
    if (this.scheduledAtSeconds < audioTime - 0.05) {
      this.resetSchedule();
      return this.fillSchedule();
    }
    const targetTime = audioTime + this.lookaheadSeconds;
    while (this.scheduledAtSeconds < targetTime) {
      if (cursor.cursor >= nativeRadioCycleSamples) cursor.reset();
      const count = Math.min(this.chunkSamples, nativeRadioCycleSamples - cursor.cursor);
      const clip = cursor.readClip(count);
      this.scheduledHandles.push(this.audio.playMusicVoice(clip, {
        gain: nativeRadioGain(this.volume),
        startAtSeconds: this.scheduledAtSeconds,
      }));
      this.scheduledAtSeconds += count / nativeRadioSampleRate;
    }
  }

  private pruneScheduled(): void {
    for (let index = this.scheduledHandles.length - 1; index >= 0; index -= 1) {
      if (this.scheduledHandles[index]!.stopped) this.scheduledHandles.splice(index, 1);
    }
  }

  private stopScheduled(): void {
    for (const handle of this.scheduledHandles) handle.stop();
    this.scheduledHandles.length = 0;
    this.scheduledCursor = undefined;
  }
}
