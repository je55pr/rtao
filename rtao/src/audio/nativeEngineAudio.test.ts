import { describe, expect, test } from "vitest";
import type { AudioPlaybackHandle, AudioLoopOptions } from "./browserAudio";
import {
  NativeEngineAudioRuntime,
  nativeEngineAudioParameters,
  nativeEngineDefaultVolumeWord,
  nativeEnginePitchWord,
  nativeEngineVolumeGain,
  nativeSpu2PlaybackRate,
} from "./nativeEngineAudio";
import type { PcmClip } from "./pcm";

interface RecordedLoop {
  readonly clip: PcmClip;
  readonly options: AudioLoopOptions;
  gain: number;
  playbackRate: number;
  stopped: boolean;
}

function engineTvbFixture(): Uint8Array {
  const payloadLength = 0x26cc0;
  const bytes = new Uint8Array(0x800 + payloadLength);
  const view = new DataView(bytes.buffer);
  for (let slot = 0; slot < 256; slot += 1) {
    const offset = slot <= 40 ? 0 : slot === 41 ? 0x252c0 : slot === 42 ? 0x25f30 : payloadLength;
    view.setUint32(slot * 4, offset, true);
  }
  view.setUint32(0x400 + 41 * 4, 0xd2f2e11e, true);
  view.setUint32(0x400 + 42 * 4, 0xd2f2e11e, true);
  bytes[0x800 + 0x252c0 + 25 * 16 + 1] = 6;
  bytes[0x800 + 0x25f30 - 16 + 1] = 3;
  bytes[0x800 + 0x25f30 + 23 * 16 + 1] = 6;
  bytes[0x800 + 0x26cc0 - 16 + 1] = 3;
  return bytes;
}

function recordingHost(records: RecordedLoop[]) {
  return {
    playLoop(clip: PcmClip, options: AudioLoopOptions = {}): AudioPlaybackHandle {
      const record: RecordedLoop = {
        clip,
        options,
        gain: options.gain ?? 1,
        playbackRate: options.playbackRate ?? 1,
        stopped: false,
      };
      records.push(record);
      return {
        get stopped() { return record.stopped; },
        stop: () => { record.stopped = true; },
        setGain: (gain) => { record.gain = gain; },
        setPlaybackRate: (rate) => { record.playbackRate = rate; },
      };
    },
  };
}
describe("native engine audio model", () => {
  test("matches the recovered PAL RPM to SPU pitch vectors including the discontinuity", () => {
    expect([0, 1000, 2000, 2001, 3000, 4000, 4001, 6000, 8000, 9000, 10000, 12000]
      .map((rpm) => [rpm, nativeEnginePitchWord(rpm)]))
      .toEqual([
        [0, 2000], [1000, 2500], [2000, 3000], [2001, 3003],
        [3000, 6250], [4000, 9500], [4001, 10001], [6000, 13000],
        [8000, 16000], [9000, 16191], [10000, 16383], [12000, 16383],
      ]);
  });

  test("converts only native SPU register values at the browser boundary", () => {
    expect(nativeSpu2PlaybackRate(0x1000)).toBe(1);
    expect(nativeSpu2PlaybackRate(0x2000)).toBe(2);
    expect(nativeEngineVolumeGain(nativeEngineDefaultVolumeWord)).toBeCloseTo(7372 / 0x3fff, 12);
    expect(nativeEngineAudioParameters({ engineSpeed: 4001, layerSelector: 1, effectSelector: 7 }))
      .toMatchObject({ pitchWord: 10001, layerSelector: 1, sampleSlot: 41, effectSelector: 7 });
  });
});
describe("NativeEngineAudioRuntime", () => {
  test("runs the recovered loop pair persistently and switches layers from the throttle selector", () => {
    const records: RecordedLoop[] = [];
    const runtime = NativeEngineAudioRuntime.fromCqMainTvb(recordingHost(records), engineTvbFixture());
    runtime.start({ engineSpeed: 4000, layerSelector: 0, effectSelector: 3 });

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.options.bus)).toEqual(["sfx", "sfx"]);
    expect(records.map((record) => record.options.loop)).toEqual([
      { startFrame: 23 * 28, endFrame: 217 * 28 },
      { startFrame: 25 * 28, endFrame: 199 * 28 },
    ]);
    expect(records.map((record) => record.playbackRate)).toEqual([
      nativeSpu2PlaybackRate(9500), nativeSpu2PlaybackRate(9500),
    ]);
    expect(records[0]!.gain).toBeCloseTo(7372 / 0x3fff, 12);
    expect(records[1]!.gain).toBe(0);

    runtime.update({ engineSpeed: 4001, layerSelector: 1, effectSelector: 5 });
    expect(records).toHaveLength(2);
    expect(records[0]!.playbackRate).toBe(nativeSpu2PlaybackRate(10001));
    expect(records[0]!.gain).toBe(0);
    expect(records[1]!.gain).toBeCloseTo(7372 / 0x3fff, 12);
    expect(runtime.snapshot()).toMatchObject({ engineSpeed: 4001, pitchWord: 10001, sampleSlot: 41, effectSelector: 5 });
  });
  test("preserves native mute/mono volume lifecycle without changing the model inputs", () => {
    const records: RecordedLoop[] = [];
    const runtime = NativeEngineAudioRuntime.fromCqMainTvb(recordingHost(records), engineTvbFixture());
    runtime.start({ engineSpeed: 6000, layerSelector: 0 });
    runtime.setMuted(true);
    expect(records.map((record) => record.gain)).toEqual([0, 0]);

    runtime.setVolumes(3000, 5000, true);
    runtime.setMuted(false);
    expect(records[0]!.gain).toBeCloseTo(4000 / 0x3fff, 12);
    expect(runtime.snapshot()).toMatchObject({ leftVolumeWord: 4000, rightVolumeWord: 4000 });

    runtime.stop();
    expect(records.every((record) => record.stopped)).toBe(true);
    expect(runtime.snapshot().running).toBe(false);
  });
});
