import { describe, expect, it } from "vitest";
import type { AudioMusicVoiceOptions, AudioPlaybackHandle } from "./browserAudio";
import {
  NativeRadioRuntime,
  nativeRadioCycleSamples,
  nativeRadioGain,
  nativeRadioProgram,
  nativeRadioSampleAtTick,
  nativeRadioVolumeWord,
  resolveNativeRadioState,
} from "./nativeRadioRuntime";
import type { PcmClip } from "./pcm";

class FakeHandle implements AudioPlaybackHandle {
  stopped = false;
  gains: number[] = [];
  rates: number[] = [];
  stop(): void { this.stopped = true; }
  setGain(gain: number): void { this.gains.push(gain); }
  setPlaybackRate(rate: number): void { this.rates.push(rate); }
}

class FakeRadioAudio {
  time = 0;
  readonly voices: { clip: PcmClip; options: AudioMusicVoiceOptions; handle: FakeHandle }[] = [];
  playMusicVoice(clip: PcmClip, options: AudioMusicVoiceOptions = {}): AudioPlaybackHandle {
    const handle = new FakeHandle();
    this.voices.push({ clip, options, handle });
    return handle;
  }
  audioTimeSeconds(): number | undefined { return this.time; }
}

function makeVag(encodedByte: number, frames = 32): Uint8Array {
  const payloadSize = frames * 16;
  const bytes = new Uint8Array(0x30 + payloadSize);
  bytes.set(new TextEncoder().encode("VAGp"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x04, 0x20, false);
  view.setUint32(0x0c, payloadSize, false);
  view.setUint32(0x10, 12_000, false);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = 0x30 + frame * 16;
    bytes[offset] = 0;
    bytes[offset + 1] = 0;
    bytes.fill(encodedByte, offset + 2, offset + 16);
  }
  return bytes;
}

describe("PAL ordinary free-roam radio contract", () => {
  it("retains only the ordinary states 0..2 and never assigns registered 2CH tune index 2", () => {
    expect(resolveNativeRadioState(0)).toBeUndefined();
    expect(resolveNativeRadioState(1)).toMatchObject({ tuneIndex: 0, leftFile: "1CH_L.VAG", rightFile: "1CH_R.VAG" });
    expect(resolveNativeRadioState(2)).toMatchObject({ tuneIndex: 1, leftFile: "3CH_L.VAG", rightFile: "3CH_R.VAG" });
    expect(() => resolveNativeRadioState(3)).toThrow(RangeError);
  });

  it("reproduces synchronized program, volume, and one-hour sample arithmetic", () => {
    expect(nativeRadioProgram(1, 0)).toBe(120);
    expect(nativeRadioProgram(1, 1_799)).toBe(120);
    expect(nativeRadioProgram(1, 1_800)).toBe(121);
    expect(nativeRadioProgram(1, 215_999)).toBe(239);
    expect(nativeRadioProgram(1, 216_000)).toBe(120);
    expect(nativeRadioVolumeWord(90)).toBe(11_520);
    expect(nativeRadioGain(90)).toBeCloseTo(11_520 / 0x3fff, 12);
    expect(nativeRadioSampleAtTick(216_000)).toBe(0);
    expect(nativeRadioCycleSamples).toBe(43_198_272);
  });

  it("streams the default 3CH stereo pair in bounded scheduled chunks and stops on outdoor teardown", () => {
    const audio = new FakeRadioAudio();
    const zero = makeVag(0x00);
    const nonzero = makeVag(0x11);
    const runtime = new NativeRadioRuntime(
      audio,
      {
        tune0: { left: zero, right: zero },
        tune1: { left: nonzero, right: nonzero },
      },
      {
        autoClock: false,
        chunkSamples: 28,
        lookaheadSeconds: 0.004,
        clock: { now: () => 0, setInterval: () => 0, clearInterval: () => undefined },
      },
    );

    runtime.startOutdoor();
    expect(runtime.snapshot()).toMatchObject({ active: true, state: 2, program: 120 });
    expect(audio.voices.length).toBeGreaterThanOrEqual(2);
    expect(audio.voices[0]!.clip.frameCount).toBe(28);
    expect(audio.voices[0]!.clip.channels).toHaveLength(2);
    expect(audio.voices[0]!.clip.channels[0]![0]).toBeGreaterThan(0);
    expect(audio.voices[0]!.options.gain).toBeCloseTo(nativeRadioGain(90), 12);
    expect(audio.voices[1]!.options.startAtSeconds).toBeCloseTo(28 / 12_000, 12);

    runtime.stopOutdoor();
    expect(runtime.snapshot()).toMatchObject({ active: false, scheduledChunks: 0 });
    expect(audio.voices.every((voice) => voice.handle.stopped)).toBe(true);
    runtime.dispose();
  });

  it("keeps the synchronized counter moving while radio playback is stopped", () => {
    const audio = new FakeRadioAudio();
    const bytes = makeVag(0x00);
    const runtime = new NativeRadioRuntime(
      audio,
      { tune0: { left: bytes, right: bytes }, tune1: { left: bytes, right: bytes } },
      {
        autoClock: false,
        chunkSamples: 28,
        lookaheadSeconds: 0.002,
        clock: { now: () => 0, setInterval: () => 0, clearInterval: () => undefined },
      },
    );
    runtime.startOutdoor();
    runtime.stopOutdoor();
    runtime.advanceNativeTicks(1);
    expect(runtime.snapshot()).toMatchObject({ active: false, tick: 1, program: 120 });
    runtime.startOutdoor();
    expect(runtime.snapshot()).toMatchObject({ active: true, tick: 1 });
    runtime.dispose();
  });
});
