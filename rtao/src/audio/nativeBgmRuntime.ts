import type { AudioPlaybackHandle, BrowserAudioRuntime } from "./browserAudio";
import {
  NativeTsqSequencer,
  resolveTsqMusicChannelPrograms,
  type NativeTsqSequencerEvent,
  type NativeTsqVoiceHost,
} from "./nativeTsqSequencer";
import { decodeTvbSlotClip, type PcmClip, type PcmLoop } from "./pcm";
import { type NativeBgmProgram, type NativeBgmTransportCommand } from "./nativeBgm";
import { readTsq, type TsqFile } from "../formats/tsq";
import { readTvb, type TvbBank, type TvbSampleSpan } from "../formats/tvb";

export const nativeBgmTickMicroseconds = 16_666;
export const nativeBgmTickMilliseconds = nativeBgmTickMicroseconds / 1_000;
export const nativeBgmTickHertz = 1_000_000 / nativeBgmTickMicroseconds;
export const nativeBgmSpu2SampleRate = 48_000;
export const nativeBgmMusicVoiceBase = 8;
export const nativeBgmMusicVoiceCount = 36;
export const nativeBgmInitialVolume = 200;
export const nativeBgmInitialLeftCoefficient = 64;
export const nativeBgmInitialRightCoefficient = 64;
export const nativeBgmMasterQ8 = 0x100;

/** Exact 73-entry SNDMOD key-on pitch table at PAL SNDMOD.IRX 0x8ACC. */
export const nativeBgmPitchTable = [
  256, 271, 287, 304, 322, 341, 362, 383, 406, 430, 456, 483,
  512, 542, 574, 608, 645, 683, 724, 767, 812, 861, 912, 966,
  1024, 1084, 1149, 1217, 1290, 1366, 1448, 1534, 1625, 1722, 1824, 1933,
  2048, 2169, 2298, 2435, 2580, 2733, 2896, 3068, 3250, 3444, 3649, 3866,
  4096, 4339, 4597, 4870, 5160, 5467, 5792, 6137, 6501, 6888, 7298, 7732,
  8192, 8679, 9195, 9741, 10321, 10935, 11585, 12274, 13003, 13777, 14596,
  15464, 16383,
] as const;

export interface NativeBgmAssets {
  readonly bgmTvb: Uint8Array;
  readonly tsqFiles: Readonly<Record<string, Uint8Array>>;
}

export interface NativeBgmRuntimeSnapshot {
  readonly selected?: NativeBgmProgram;
  readonly running: boolean;
  readonly tick: number;
  readonly masterQ8: number;
  readonly fadeStep: -4 | 0 | 4;
  readonly activeVoices: number;
}

interface NativeBgmAudioHost {
  playMusicVoice(
    clip: PcmClip,
    options?: { readonly gain?: number; readonly playbackRate?: number; readonly loop?: PcmLoop },
  ): AudioPlaybackHandle;
}

interface NativeBgmRuntimeClock {
  now(): number;
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface NativeBgmRuntimeOptions {
  readonly autoClock?: boolean;
  readonly isAudioReady?: () => boolean;
  readonly clock?: NativeBgmRuntimeClock;
  readonly onError?: (error: unknown) => void;
}

type AdsrPhase = "stopped" | "attack" | "decay" | "sustain" | "release";

export interface NativeSpu2AdsrFields {
  readonly sustainLevel: number;
  readonly decayShift: number;
  readonly attackStep: number;
  readonly attackShift: number;
  readonly attackMode: boolean;
  readonly releaseShift: number;
  readonly releaseMode: boolean;
  readonly sustainStep: number;
  readonly sustainShift: number;
  readonly sustainDirectionDown: boolean;
  readonly sustainMode: boolean;
}

export interface NativeSpu2AdsrState {
  phase: AdsrPhase;
  value: number;
  counter: number;
}

interface VoicePlayback {
  readonly left: AudioPlaybackHandle;
  readonly right: AudioPlaybackHandle;
  readonly adsrWord: number;
  readonly adsr: NativeSpu2AdsrState;
}

interface ChannelState {
  readonly channelIndex: number;
  volume: number;
  leftCoefficient: number;
  rightCoefficient: number;
  toneSlot: number;
  pitchWord: number;
  pitchMultiplierQ12?: number;
  effectSend: boolean;
  voice?: VoicePlayback;
}

interface DecodedVoiceSample {
  readonly leftClip: PcmClip;
  readonly rightClip: PcmClip;
  readonly loop?: PcmLoop;
  readonly adsrWord: number;
}

const defaultClock: NativeBgmRuntimeClock = {
  now: () => performance.now(),
  setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

function clampInt(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.trunc(value)));
}

function littleEndianU16(bytes: readonly number[]): number {
  if (bytes.length !== 2) throw new Error(`Native BGM 16-bit operand expected 2 bytes; got ${bytes.length}.`);
  return bytes[0]! | (bytes[1]! << 8);
}

export function nativeBgmPitchPlaybackRate(pitchWord: number): number {
  if (!Number.isInteger(pitchWord) || pitchWord <= 0 || pitchWord > 0x3fff) {
    throw new RangeError(`Native BGM pitch word must be an integer in 1..0x3fff; got ${pitchWord}.`);
  }
  return pitchWord / 0x1000;
}

export function nativeBgmVoiceVolumeWord(volume: number, coefficient: number, masterQ8: number): number {
  if (!Number.isInteger(volume) || volume < 0 || volume > 0xff) {
    throw new RangeError(`Native BGM volume must be a byte; got ${volume}.`);
  }
  if (!Number.isInteger(coefficient) || coefficient < 0 || coefficient > 0xff) {
    throw new RangeError(`Native BGM L/R coefficient must be a byte; got ${coefficient}.`);
  }
  if (!Number.isInteger(masterQ8) || masterQ8 < 0 || masterQ8 > 0x100) {
    throw new RangeError(`Native BGM master Q8 must be in 0..256; got ${masterQ8}.`);
  }
  return Math.trunc(volume * coefficient * masterQ8 / 256);
}

export function nativeBgmVoiceGain(volumeWord: number): number {
  if (!Number.isInteger(volumeWord) || volumeWord < 0) {
    throw new RangeError(`Native BGM volume word must be a non-negative integer; got ${volumeWord}.`);
  }
  return Math.min(0x3fff, volumeWord) / 0x3fff;
}

export function decodeNativeSpu2Adsr(word: number): NativeSpu2AdsrFields {
  const value = word >>> 0;
  const adsr1 = value & 0xffff;
  const adsr2 = value >>> 16;
  return {
    sustainLevel: adsr1 & 0x0f,
    decayShift: (adsr1 >>> 4) & 0x0f,
    attackStep: (adsr1 >>> 8) & 0x03,
    attackShift: (adsr1 >>> 10) & 0x1f,
    attackMode: (adsr1 & 0x8000) !== 0,
    releaseShift: adsr2 & 0x1f,
    releaseMode: (adsr2 & 0x20) !== 0,
    sustainStep: (adsr2 >>> 6) & 0x03,
    sustainShift: (adsr2 >>> 8) & 0x1f,
    sustainDirectionDown: (adsr2 & 0x4000) !== 0,
    sustainMode: (adsr2 & 0x8000) !== 0,
  };
}

function adsrPhaseParameters(fields: NativeSpu2AdsrFields, phase: AdsrPhase): {
  readonly decrease: boolean;
  readonly exponential: boolean;
  readonly shift: number;
  readonly step: number;
  readonly target: number;
} {
  switch (phase) {
    case "attack":
      return {
        decrease: false,
        exponential: fields.attackMode,
        shift: fields.attackShift,
        step: 7 - fields.attackStep,
        target: 0x7fff,
      };
    case "decay":
      return {
        decrease: true,
        exponential: true,
        shift: fields.decayShift,
        step: -8,
        target: (fields.sustainLevel + 1) << 11,
      };
    case "sustain": {
      const decrease = fields.sustainDirectionDown;
      const step = 7 - fields.sustainStep;
      return {
        decrease,
        exponential: fields.sustainMode,
        shift: fields.sustainShift,
        step: decrease ? ~step : step,
        target: 0,
      };
    }
    case "release":
      return {
        decrease: true,
        exponential: fields.releaseMode,
        shift: fields.releaseShift,
        step: -8,
        target: 0,
      };
    case "stopped":
      return { decrease: true, exponential: false, shift: 0, step: 0, target: 0 };
  }
}

function nextAdsrPhase(phase: AdsrPhase): AdsrPhase {
  switch (phase) {
    case "attack": return "decay";
    case "decay": return "sustain";
    case "sustain": return "sustain";
    case "release": return "stopped";
    case "stopped": return "stopped";
  }
}

export function advanceNativeSpu2Adsr(
  word: number,
  state: NativeSpu2AdsrState,
  samples: number,
): NativeSpu2AdsrState {
  if (!Number.isSafeInteger(samples) || samples < 0) {
    throw new RangeError(`SPU2 ADSR sample advance must be a non-negative integer; got ${samples}.`);
  }
  const fields = decodeNativeSpu2Adsr(word);
  for (let sample = 0; sample < samples && state.phase !== "stopped"; sample += 1) {
    const parameters = adsrPhaseParameters(fields, state.phase);
    let counterIncrement = 0x8000 >>> Math.max(0, parameters.shift - 11);
    let levelIncrement = parameters.step << Math.max(0, 11 - parameters.shift);

    if (parameters.exponential) {
      if (!parameters.decrease && state.value > 0x6000) counterIncrement >>>= 2;
      if (parameters.decrease) {
        const scaled = (levelIncrement * state.value) >> 15;
        levelIncrement = (scaled << 16) >> 16;
      }
    }

    counterIncrement = Math.max(1, counterIncrement);
    state.counter += counterIncrement;
    if (state.counter >= 0x8000) {
      state.counter = 0;
      state.value = clampInt(state.value + levelIncrement, 0, 0x7fff);
    }

    if (state.phase === "sustain") {
      if (state.value === 0) state.phase = "stopped";
      continue;
    }

    const reached = (!parameters.decrease && state.value >= parameters.target)
      || (parameters.decrease && state.value <= parameters.target);
    if (reached) state.phase = nextAdsrPhase(state.phase);
  }
  return state;
}

export function nativeTvbSampleLoop(sample: TvbSampleSpan): PcmLoop | undefined {
  let loopStartFrame: number | undefined;
  for (let frame = 0; frame < sample.frameCount; frame += 1) {
    const control = sample.adpcm[frame * 16 + 1]!;
    if ((control & 0x04) !== 0) loopStartFrame = frame;
    if ((control & 0x03) === 0x03 && loopStartFrame !== undefined && loopStartFrame < frame) {
      return { startFrame: loopStartFrame * 28, endFrame: (frame + 1) * 28 };
    }
  }
  return undefined;
}

class NativeBgmVoiceRuntime implements NativeTsqVoiceHost {
  private readonly channels: ChannelState[] = Array.from({ length: nativeBgmMusicVoiceCount }, (_, channelIndex) => ({
    channelIndex,
    volume: nativeBgmInitialVolume,
    leftCoefficient: nativeBgmInitialLeftCoefficient,
    rightCoefficient: nativeBgmInitialRightCoefficient,
    toneSlot: 0,
    pitchWord: 0x1000,
    effectSend: false,
  }));
  private readonly decoded = new Map<number, DecodedVoiceSample>();
  private masterQ8 = nativeBgmMasterQ8;

  constructor(
    private readonly audio: NativeBgmAudioHost,
    private readonly tvbBytes: Uint8Array,
    private readonly tvb: TvbBank,
  ) {}

  dispatch(event: NativeTsqSequencerEvent): void {
    const channel = this.channels[event.channelIndex];
    if (!channel) throw new Error(`Native BGM channel ${event.channelIndex} is outside the 36 music voices.`);
    const { token } = event;
    switch (token.family) {
      case "volume":
        channel.volume = token.immediateBytes[0]!;
        this.applyVoice(channel);
        return;
      case "pan":
        channel.leftCoefficient = token.immediateBytes[0]!;
        channel.rightCoefficient = token.immediateBytes[1]!;
        this.applyVoice(channel);
        return;
      case "tone":
        channel.toneSlot = token.immediateBytes[0]!;
        channel.pitchMultiplierQ12 = undefined;
        return;
      case "pitch":
        channel.pitchWord = littleEndianU16(token.immediateBytes);
        this.applyPitch(channel);
        return;
      case "key-pitch":
        channel.pitchWord = littleEndianU16(token.immediateBytes);
        this.restartVoice(channel);
        return;
      case "pitch-cent":
        channel.pitchMultiplierQ12 = littleEndianU16(token.immediateBytes);
        this.applyPitch(channel);
        return;
      case "key-on": {
        const index = token.embeddedValue;
        const pitch = index === undefined ? undefined : nativeBgmPitchTable[index];
        if (pitch === undefined) throw new Error(`Native BGM key-on pitch index ${index} is outside the recovered 73-entry table.`);
        channel.pitchWord = pitch;
        this.restartVoice(channel);
        return;
      }
      case "key-off":
        if (channel.voice) {
          channel.voice.adsr.phase = "release";
          channel.voice.adsr.counter = 0;
        }
        return;
      case "flag-on":
        channel.effectSend = true;
        return;
      case "flag-off":
        channel.effectSend = false;
        return;
      case "reverb-e6":
      case "reverb-e7":
      case "priority":
      case "extended-channel":
        throw new Error(`Native BGM encountered unrecovered reachable token ${token.family} at 0x${token.offset.toString(16)}.`);
      case "tempo":
      case "step":
      case "jump":
      case "end":
        throw new Error(`Native TSQ sequencer should not dispatch ${token.family} tokens to the voice host.`);
    }
  }

  setMasterQ8(masterQ8: number): void {
    this.masterQ8 = clampInt(masterQ8, 0, nativeBgmMasterQ8);
    for (const channel of this.channels) this.applyVoice(channel);
  }

  advanceSpuSamples(samples: number): void {
    for (const channel of this.channels) {
      const voice = channel.voice;
      if (!voice) continue;
      advanceNativeSpu2Adsr(voice.adsrWord, voice.adsr, samples);
      if (voice.adsr.phase === "stopped") {
        voice.left.stop();
        voice.right.stop();
        channel.voice = undefined;
      } else {
        this.applyVoice(channel);
      }
    }
  }

  stopAll(): void {
    for (const channel of this.channels) {
      channel.voice?.left.stop();
      channel.voice?.right.stop();
      channel.voice = undefined;
    }
  }

  resetChannels(): void {
    this.stopAll();
    for (const channel of this.channels) {
      channel.volume = nativeBgmInitialVolume;
      channel.leftCoefficient = nativeBgmInitialLeftCoefficient;
      channel.rightCoefficient = nativeBgmInitialRightCoefficient;
      channel.toneSlot = 0;
      channel.pitchWord = 0x1000;
      channel.pitchMultiplierQ12 = undefined;
      channel.effectSend = false;
    }
  }

  activeVoiceCount(): number {
    return this.channels.reduce((count, channel) => count + (channel.voice ? 1 : 0), 0);
  }

  private finalPitchWord(channel: ChannelState): number {
    const multiplier = channel.pitchMultiplierQ12;
    const pitch = multiplier === undefined
      ? channel.pitchWord
      : Math.trunc(channel.pitchWord * multiplier / 0x1000);
    return clampInt(pitch, 1, 0x3fff);
  }

  private applyPitch(channel: ChannelState): void {
    const voice = channel.voice;
    if (!voice) return;
    const rate = nativeBgmPitchPlaybackRate(this.finalPitchWord(channel));
    voice.left.setPlaybackRate(rate);
    voice.right.setPlaybackRate(rate);
  }

  private applyVoice(channel: ChannelState): void {
    const voice = channel.voice;
    if (!voice) return;
    const envelope = voice.adsr.value / 0x7fff;
    const leftWord = nativeBgmVoiceVolumeWord(channel.volume, channel.leftCoefficient, this.masterQ8);
    const rightWord = nativeBgmVoiceVolumeWord(channel.volume, channel.rightCoefficient, this.masterQ8);
    voice.left.setGain(nativeBgmVoiceGain(leftWord) * envelope);
    voice.right.setGain(nativeBgmVoiceGain(rightWord) * envelope);
  }

  private restartVoice(channel: ChannelState): void {
    channel.voice?.left.stop();
    channel.voice?.right.stop();
    const sample = this.decodedSample(channel.toneSlot);
    const playbackRate = nativeBgmPitchPlaybackRate(this.finalPitchWord(channel));
    const left = this.audio.playMusicVoice(sample.leftClip, { gain: 0, playbackRate, ...(sample.loop ? { loop: sample.loop } : {}) });
    const right = this.audio.playMusicVoice(sample.rightClip, { gain: 0, playbackRate, ...(sample.loop ? { loop: sample.loop } : {}) });
    channel.voice = {
      left,
      right,
      adsrWord: sample.adsrWord,
      adsr: { phase: "attack", value: 0, counter: 0 },
    };
    this.applyVoice(channel);
  }

  private decodedSample(slot: number): DecodedVoiceSample {
    const cached = this.decoded.get(slot);
    if (cached) return cached;
    const sample = this.tvb.sampleBySlot[slot];
    if (!sample) throw new Error(`Native BGM tone slot ${slot} is not playable in BGM.TVB.`);
    const mono = decodeTvbSlotClip(this.tvbBytes, slot, nativeBgmSpu2SampleRate);
    const channel = mono.channels[0]!;
    const silence = new Float32Array(mono.frameCount);
    const decoded = {
      leftClip: { sampleRate: mono.sampleRate, channels: [channel, silence], frameCount: mono.frameCount },
      rightClip: { sampleRate: mono.sampleRate, channels: [silence, channel], frameCount: mono.frameCount },
      loop: nativeTvbSampleLoop(sample),
      adsrWord: this.tvb.nativeAdsrWords[slot]!,
    } satisfies DecodedVoiceSample;
    this.decoded.set(slot, decoded);
    return decoded;
  }
}

export class NativeBgmRuntime {
  private readonly tsqFiles = new Map<string, TsqFile>();
  private readonly voiceRuntime: NativeBgmVoiceRuntime;
  private readonly clock: NativeBgmRuntimeClock;
  private readonly isAudioReady: () => boolean;
  private selected?: NativeBgmProgram;
  private sequencer?: NativeTsqSequencer;
  private running = false;
  private currentTick = 0;
  private masterQ8 = nativeBgmMasterQ8;
  private fadeStep: -4 | 0 | 4 = 0;
  private spuSampleRemainder = 0;
  private wallEpoch = 0;
  private pendingTransition?: { program: NativeBgmProgram; startAfterFade: boolean };
  private timer?: unknown;

  constructor(
    audio: Pick<BrowserAudioRuntime, "playMusicVoice">,
    assets: NativeBgmAssets,
    options: NativeBgmRuntimeOptions = {},
  ) {
    for (const [name, bytes] of Object.entries(assets.tsqFiles)) {
      this.tsqFiles.set(name.toUpperCase(), readTsq(bytes));
    }
    const tvb = readTvb(assets.bgmTvb);
    this.voiceRuntime = new NativeBgmVoiceRuntime(audio, assets.bgmTvb, tvb);
    this.clock = options.clock ?? defaultClock;
    this.isAudioReady = options.isAudioReady ?? (() => true);
    if (options.autoClock !== false) {
      this.timer = this.clock.setInterval(() => {
        try {
          this.pumpClock();
        } catch (error) {
          this.hardStop();
          options.onError?.(error);
        }
      }, 8);
    }
  }

  dispatch(command: NativeBgmTransportCommand): void {
    switch (command.kind) {
      case "select":
        this.select(command.program);
        return;
      case "start":
        this.start();
        return;
      case "hard-stop":
        this.hardStop();
        return;
      case "mute":
        this.fadeStep = 0;
        this.setMasterQ8(0);
        return;
      case "unmute":
        this.fadeStep = 0;
        this.setMasterQ8(nativeBgmMasterQ8);
        return;
      case "fade-out":
        this.fadeStep = -4;
        return;
      case "fade-in":
        this.fadeStep = 4;
        return;
    }
  }

  select(program: NativeBgmProgram): void {
    const tsq = this.tsqFiles.get(program.tsqFile.toUpperCase());
    if (!tsq) throw new Error(`Native BGM asset ${program.tsqFile} is unavailable.`);
    resolveTsqMusicChannelPrograms(tsq, program.sequenceIndex);
    this.selected = { ...program };
  }

  start(): void {
    if (this.pendingTransition) {
      this.pendingTransition.startAfterFade = true;
      return;
    }
    const selected = this.selected;
    if (!selected) throw new Error("Native BGM start requires a selected program.");
    const tsq = this.tsqFiles.get(selected.tsqFile.toUpperCase())!;
    this.voiceRuntime.resetChannels();
    this.voiceRuntime.setMasterQ8(this.masterQ8);
    this.sequencer = new NativeTsqSequencer(
      tsq.bytes,
      resolveTsqMusicChannelPrograms(tsq, selected.sequenceIndex),
      { host: this.voiceRuntime },
    );
    this.running = true;
    this.currentTick = 0;
    this.spuSampleRemainder = 0;
    this.wallEpoch = this.clock.now();
    this.sequencer.advanceTo(0);
  }

  hardStop(): void {
    this.running = false;
    this.sequencer = undefined;
    this.pendingTransition = undefined;
    this.currentTick = 0;
    this.spuSampleRemainder = 0;
    this.fadeStep = 0;
    this.voiceRuntime.resetChannels();
  }

  /**
   * Recovered scene transition: fade for 64 audio updates, then hard reset and
   * select the new program. A later start request (for example race update 250)
   * is retained if it arrives before the fade has committed.
   */
  transitionTo(program: NativeBgmProgram, startAfterFade = true): void {
    const tsq = this.tsqFiles.get(program.tsqFile.toUpperCase());
    if (!tsq) throw new Error(`Native BGM asset ${program.tsqFile} is unavailable.`);
    resolveTsqMusicChannelPrograms(tsq, program.sequenceIndex);
    if (!this.running) {
      this.hardStop();
      this.setMasterQ8(nativeBgmMasterQ8);
      this.select(program);
      if (startAfterFade) this.start();
      return;
    }
    this.pendingTransition = { program: { ...program }, startAfterFade };
    this.fadeStep = -4;
  }

  advanceNativeTicks(ticks: number): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError(`Native BGM tick delta must be non-negative; got ${ticks}.`);
    if (!this.running || !this.sequencer) return;
    for (let count = 0; count < ticks; count += 1) this.advanceOneTick();
  }

  snapshot(): NativeBgmRuntimeSnapshot {
    return {
      ...(this.selected ? { selected: { ...this.selected } } : {}),
      running: this.running,
      tick: this.currentTick,
      masterQ8: this.masterQ8,
      fadeStep: this.fadeStep,
      activeVoices: this.voiceRuntime.activeVoiceCount(),
    };
  }

  dispose(): void {
    this.hardStop();
    if (this.timer !== undefined) {
      this.clock.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private pumpClock(): void {
    if (!this.running || !this.sequencer) return;
    const now = this.clock.now();
    if (!this.isAudioReady()) {
      this.wallEpoch = now - this.currentTick * nativeBgmTickMilliseconds;
      return;
    }
    const targetTick = Math.floor((now - this.wallEpoch) / nativeBgmTickMilliseconds);
    if (targetTick > this.currentTick) this.advanceNativeTicks(targetTick - this.currentTick);
  }

  private advanceOneTick(): void {
    const sequencer = this.sequencer;
    if (!sequencer) return;
    this.spuSampleRemainder += nativeBgmSpu2SampleRate * nativeBgmTickMicroseconds / 1_000_000;
    const samples = Math.floor(this.spuSampleRemainder);
    this.spuSampleRemainder -= samples;
    this.voiceRuntime.advanceSpuSamples(samples);

    let transition: { program: NativeBgmProgram; startAfterFade: boolean } | undefined;
    if (this.fadeStep !== 0) {
      const next = clampInt(this.masterQ8 + this.fadeStep, 0, nativeBgmMasterQ8);
      this.setMasterQ8(next);
      if (next === 0 || next === nativeBgmMasterQ8) {
        this.fadeStep = 0;
        if (next === 0 && this.pendingTransition) transition = { ...this.pendingTransition };
      }
    }

    this.currentTick += 1;
    sequencer.advanceTo(this.currentTick);
    if (transition) {
      this.hardStop();
      this.setMasterQ8(nativeBgmMasterQ8);
      this.select(transition.program);
      if (transition.startAfterFade) this.start();
    }
  }

  private setMasterQ8(value: number): void {
    this.masterQ8 = clampInt(value, 0, nativeBgmMasterQ8);
    this.voiceRuntime.setMasterQ8(this.masterQ8);
  }
}
