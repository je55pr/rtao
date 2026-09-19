import { describe, expect, it } from "vitest";
import type { AudioMusicVoiceOptions, AudioPlaybackHandle } from "./browserAudio";
import {
  NativeBgmRuntime,
  advanceNativeSpu2Adsr,
  decodeNativeSpu2Adsr,
  nativeBgmPitchPlaybackRate,
  nativeBgmPitchTable,
  nativeBgmVoiceGain,
  nativeBgmVoiceVolumeWord,
  nativeTvbSampleLoop,
  type NativeSpu2AdsrState,
} from "./nativeBgmRuntime";
import type { PcmClip } from "./pcm";
import { readTvb } from "../formats/tvb";

class FakeHandle implements AudioPlaybackHandle {
  stopped = false;
  readonly gains: number[] = [];
  readonly rates: number[] = [];

  stop(): void { this.stopped = true; }
  setGain(gain: number): void { this.gains.push(gain); }
  setPlaybackRate(rate: number): void { this.rates.push(rate); }
}

class FakeMusicHost {
  readonly voices: { clip: PcmClip; options: AudioMusicVoiceOptions; handle: FakeHandle }[] = [];

  playMusicVoice(clip: PcmClip, options: AudioMusicVoiceOptions = {}): AudioPlaybackHandle {
    const handle = new FakeHandle();
    this.voices.push({ clip, options, handle });
    return handle;
  }
}

function makeTvb(): Uint8Array {
  const payloadLength = 64;
  const bytes = new Uint8Array(0x800 + payloadLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0, true);
  for (let slot = 1; slot < 256; slot += 1) view.setUint32(slot * 4, payloadLength, true);
  view.setUint32(0x400, 0xd2f2e11e, true);
  for (let frame = 0; frame < 4; frame += 1) {
    const base = 0x800 + frame * 16;
    bytes[base] = 0;
    bytes[base + 1] = frame === 0 ? 6 : frame === 3 ? 3 : 0;
  }
  return bytes;
}

function makeMusicTsq(): Uint8Array {
  const bytes = new Uint8Array(0x280);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < 51; index += 1) {
    view.setUint16(index * 4, 0, true);
    view.setUint16(index * 4 + 2, 0xd0, true);
  }
  bytes.set([0xf0, 0xff, 0xff, 0x00], 0xcc);
  for (let channel = 0; channel < 36; channel += 1) {
    const descriptor = 0xd0 + channel * 4;
    bytes[descriptor] = 0x80;
    bytes[descriptor + 1] = 0;
    view.setUint16(descriptor + 2, 0x90, true);
  }
  bytes.set([
    0xe1, 0x1f, 0x40,
    0xe0, 0x3a,
    0xe2, 0x00,
    0xea, 0xec, 0x10,
    0x94,
    0x0a,
    0xf0,
    0xff,
  ], 0x160);
  return bytes;
}

describe("native BGM recovered voice arithmetic", () => {
  it("pins the recovered pitch/volume vector", () => {
    expect(nativeBgmPitchTable).toHaveLength(73);
    expect(nativeBgmPitchTable[20]).toBe(0x032c);
    const pitch = Math.trunc(nativeBgmPitchTable[20]! * 0x10ec / 0x1000);
    expect(pitch).toBe(0x035a);
    expect(nativeBgmPitchPlaybackRate(pitch)).toBeCloseTo(0x035a / 0x1000, 12);
    expect(nativeBgmVoiceVolumeWord(0x3a, 0x1f, 0x100)).toBe(1798);
    expect(nativeBgmVoiceVolumeWord(0x3a, 0x40, 0x100)).toBe(3712);
    expect(nativeBgmVoiceGain(0x3fff)).toBe(1);
  });

  it("decodes and advances the common BGM ADSR including hardware release", () => {
    expect(decodeNativeSpu2Adsr(0x0d0d1eee)).toEqual({
      sustainLevel: 14,
      decayShift: 14,
      attackStep: 2,
      attackShift: 7,
      attackMode: false,
      releaseShift: 13,
      releaseMode: false,
      sustainStep: 0,
      sustainShift: 13,
      sustainDirectionDown: false,
      sustainMode: false,
    });
    const release: NativeSpu2AdsrState = { phase: "release", value: 0x7fff, counter: 0 };
    advanceNativeSpu2Adsr(0x0d0d1eee, release, 16_383);
    expect(release.phase).toBe("release");
    advanceNativeSpu2Adsr(0x0d0d1eee, release, 1);
    expect(release).toEqual({ phase: "stopped", value: 0, counter: 0 });
  });

  it("recovers loop start/end from native ADPCM control flags", () => {
    const bank = readTvb(makeTvb());
    expect(nativeTvbSampleLoop(bank.sampleBySlot[0]!)).toEqual({
      startFrame: 0,
      endFrame: 112,
    });
  });
});

describe("NativeBgmRuntime", () => {
  it("executes TSQ voices, native fade timing, and key-off release without flat-track looping", () => {
    const audio = new FakeMusicHost();
    const runtime = new NativeBgmRuntime(
      audio,
      { bgmTvb: makeTvb(), tsqFiles: { "BGM_01.TSQ": makeMusicTsq() } },
      { autoClock: false },
    );

    runtime.select({ tsqFile: "BGM_01.TSQ", sequenceIndex: 1 });
    runtime.start();
    expect(runtime.snapshot()).toMatchObject({ running: true, tick: 0, activeVoices: 36 });
    expect(audio.voices).toHaveLength(72);
    expect(audio.voices[0]!.options.loop).toEqual({ startFrame: 0, endFrame: 112 });
    expect(audio.voices[0]!.options.playbackRate).toBeCloseTo(0x035a / 0x1000, 12);
    expect(audio.voices[0]!.handle.gains.at(-1)).toBe(0);

    runtime.advanceNativeTicks(1);
    expect(audio.voices[0]!.handle.gains.at(-1)).toBeGreaterThan(0);

    runtime.dispatch({ kind: "fade-out" });
    runtime.advanceNativeTicks(64);
    expect(runtime.snapshot()).toMatchObject({ masterQ8: 0, fadeStep: 0 });

    runtime.dispatch({ kind: "unmute" });
    expect(runtime.snapshot().masterQ8).toBe(256);

    runtime.advanceNativeTicks(20);
    expect(runtime.snapshot().activeVoices).toBe(0);
    runtime.dispose();
  });

  it("commits recovered fade-reset-select ordering before a queued race start", () => {
    const runtime = new NativeBgmRuntime(
      new FakeMusicHost(),
      {
        bgmTvb: makeTvb(),
        tsqFiles: { "BGM_01.TSQ": makeMusicTsq(), "BGM_02.TSQ": makeMusicTsq() },
      },
      { autoClock: false },
    );
    runtime.select({ tsqFile: "BGM_01.TSQ", sequenceIndex: 1 });
    runtime.start();
    runtime.transitionTo({ tsqFile: "BGM_02.TSQ", sequenceIndex: 1 }, false);
    runtime.advanceNativeTicks(63);
    expect(runtime.snapshot()).toMatchObject({
      selected: { tsqFile: "BGM_01.TSQ", sequenceIndex: 1 },
      running: true,
      masterQ8: 4,
    });
    runtime.start();
    runtime.advanceNativeTicks(1);
    expect(runtime.snapshot()).toMatchObject({
      selected: { tsqFile: "BGM_02.TSQ", sequenceIndex: 1 },
      running: true,
      tick: 0,
      masterQ8: 256,
    });
    runtime.dispose();
  });

  it("hard stop resets active sequencing without discarding the selected program", () => {
    const runtime = new NativeBgmRuntime(
      new FakeMusicHost(),
      { bgmTvb: makeTvb(), tsqFiles: { "ROOM_1.TSQ": makeMusicTsq() } },
      { autoClock: false },
    );
    runtime.dispatch({ kind: "select", program: { tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 } });
    runtime.dispatch({ kind: "start" });
    runtime.advanceNativeTicks(5);
    runtime.dispatch({ kind: "hard-stop" });
    expect(runtime.snapshot()).toMatchObject({
      selected: { tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 },
      running: false,
      tick: 0,
      activeVoices: 0,
    });
    runtime.dispose();
  });
});
