import { describe, expect, it } from "vitest";
import {
  BrowserAudioRuntime,
  installBrowserAudioUnlock,
  type AudioBufferFacade,
  type AudioBufferSourceFacade,
  type AudioContextFacade,
  type AudioEndpointFacade,
  type AudioNodeFacade,
  type BrowserAudioContextState,
  type GainNodeFacade,
} from "./browserAudio";
import type { PcmClip } from "./pcm";

class FakeNode implements AudioNodeFacade {
  readonly connections: AudioEndpointFacade[] = [];
  disconnected = false;

  connect(destination: AudioEndpointFacade): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}
class FakeGainNode extends FakeNode implements GainNodeFacade {
  readonly gain = { value: 1 };
}

class FakeAudioBuffer implements AudioBufferFacade {
  readonly channels: Float32Array[];

  constructor(channelCount: number, frameCount: number) {
    this.channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`Missing fake channel ${channel}.`);
    return data;
  }
}

class FakeBufferSource extends FakeNode implements AudioBufferSourceFacade {
  buffer: AudioBufferFacade | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  started = false;
  startedWhen = 0;
  startedOffset = 0;
  stopCount = 0;

  start(when = 0, offset = 0): void {
    this.started = true;
    this.startedWhen = when;
    this.startedOffset = offset;
  }

  stop(): void {
    this.stopCount += 1;
    this.onended?.();
  }

  finish(): void {
    this.onended?.();
  }
}

class FakeAudioContext implements AudioContextFacade {
  readonly destination: AudioEndpointFacade = {};
  currentTime = 0;
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly buffers: FakeAudioBuffer[] = [];
  resumeCount = 0;
  closeCount = 0;
  resumeShouldRun = true;
  private currentState: BrowserAudioContextState = "suspended";

  get state(): BrowserAudioContextState {
    return this.currentState;
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createBuffer(channelCount: number, frameCount: number): FakeAudioBuffer {
    const buffer = new FakeAudioBuffer(channelCount, frameCount);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  async resume(): Promise<void> {
    this.resumeCount += 1;
    if (this.resumeShouldRun) this.currentState = "running";
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.currentState = "closed";
  }
}

const clip: PcmClip = {
  sampleRate: 1_000,
  channels: [new Float32Array([0.25, -0.25, 0.5, -0.5])],
  frameCount: 4,
};

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("BrowserAudioRuntime", () => {
  it("stays lazy until unlock and starts retained loops through the music bus", async () => {
    const context = new FakeAudioContext();
    let factoryCalls = 0;
    const audio = new BrowserAudioRuntime(() => {
      factoryCalls += 1;
      return context;
    });
    audio.setGains({ master: 0.5, music: 0.25, sfx: 0.75 });
    expect(audio.playEvent(clip)).toBeNull();
    const loop = audio.playLoop(clip, {
      gain: 0.4,
      playbackRate: 2,
      loop: { startFrame: 1, endFrame: 3 },
    });

    expect(factoryCalls).toBe(0);
    expect(audio.snapshot()).toMatchObject({ state: "locked", pendingLoops: 1, activeSources: 0 });
    expect(await audio.unlock()).toBe(true);

    expect(factoryCalls).toBe(1);
    expect(context.gains.slice(0, 3).map((node) => node.gain.value)).toEqual([0.5, 0.25, 0.75]);
    expect(context.sources).toHaveLength(1);
    const source = context.sources[0]!;
    expect(source).toMatchObject({ started: true, loop: true, loopStart: 0.001, loopEnd: 0.003 });
    expect(source.playbackRate.value).toBe(2);
    expect(context.gains[3]!.gain.value).toBe(0.4);
    expect(context.gains[3]!.connections[0]).toBe(context.gains[1]);
    expect(loop.stopped).toBe(false);
  });

  it("updates pending and active loop parameters without restarting the source", async () => {
    const context = new FakeAudioContext();
    const audio = new BrowserAudioRuntime(() => context);
    const loop = audio.playLoop(clip, { gain: 0.1, playbackRate: 1 });
    loop.setGain(0.35);
    loop.setPlaybackRate(1.75);

    expect(await audio.unlock()).toBe(true);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.playbackRate.value).toBe(1.75);
    expect(context.gains[3]!.gain.value).toBe(0.35);

    loop.setGain(0.6);
    loop.setPlaybackRate(2.25);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.playbackRate.value).toBe(2.25);
    expect(context.gains[3]!.gain.value).toBe(0.6);
  });

  it("queues finite music voices through autoplay lock without fabricating a loop", async () => {
    const context = new FakeAudioContext();
    const audio = new BrowserAudioRuntime(() => context);
    const voice = audio.playMusicVoice(clip, { gain: 0.3, playbackRate: 1.25, offsetFrame: 2 });

    expect(audio.snapshot()).toMatchObject({ state: "locked", pendingLoops: 1, activeSources: 0 });
    expect(await audio.unlock()).toBe(true);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]).toMatchObject({ started: true, loop: false, startedOffset: 0.002 });
    expect(context.sources[0]!.playbackRate.value).toBe(1.25);
    expect(context.gains[3]!.gain.value).toBe(0.3);
    expect(context.gains[3]!.connections[0]).toBe(context.gains[1]);
    voice.stop();
  });

  it("schedules native music chunks on the owned AudioContext clock", async () => {
    const context = new FakeAudioContext();
    const audio = new BrowserAudioRuntime(() => context);
    await audio.unlock();
    context.currentTime = 12.5;
    expect(audio.audioTimeSeconds()).toBe(12.5);
    const voice = audio.playMusicVoice(clip, { startAtSeconds: 13.25 });
    expect(context.sources[0]).toMatchObject({ started: true, startedWhen: 13.25, startedOffset: 0 });
    voice.stop();
  });

  it("plays one-shot events only after unlock and reuses decoded Web Audio buffers", async () => {
    const context = new FakeAudioContext();
    const audio = new BrowserAudioRuntime(() => context);
    await audio.unlock();

    const first = audio.playEvent(clip, { gain: 0.2 });
    const second = audio.playEvent(clip);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(context.sources).toHaveLength(2);
    expect(context.buffers).toHaveLength(1);

    const firstSource = context.sources[0]!;
    const firstLocalGain = context.gains[3]!;
    expect(firstSource.loop).toBe(false);
    expect(firstLocalGain.gain.value).toBe(0.2);
    expect(firstLocalGain.connections[0]).toBe(context.gains[2]);

    firstSource.finish();
    expect(first!.stopped).toBe(true);
    expect(audio.snapshot().activeSources).toBe(1);
    second!.stop();
    expect(audio.snapshot().activeSources).toBe(0);
  });
  it("routes looping SFX through the SFX bus when requested", async () => {
    const context = new FakeAudioContext();
    const audio = new BrowserAudioRuntime(() => context);
    await audio.unlock();
    const handle = audio.playLoop(clip, { bus: "sfx" });
    expect(context.gains[3]!.connections[0]).toBe(context.gains[2]);
    handle.stop();
  });

  it("lets callers cancel a pending loop without creating an audio context", async () => {
    const context = new FakeAudioContext();
    let factoryCalls = 0;
    const audio = new BrowserAudioRuntime(() => {
      factoryCalls += 1;
      return context;
    });
    const handle = audio.playLoop(clip);
    handle.stop();

    expect(handle.stopped).toBe(true);
    expect(audio.snapshot().pendingLoops).toBe(0);
    expect(factoryCalls).toBe(0);
    await audio.unlock();
    expect(context.sources).toHaveLength(0);
  });

  it("keeps gesture unlock listeners until resume succeeds, then removes them", async () => {
    const context = new FakeAudioContext();
    context.resumeShouldRun = false;
    const audio = new BrowserAudioRuntime(() => context);
    const target = new EventTarget();
    installBrowserAudioUnlock(audio, target);

    target.dispatchEvent(new Event("pointerdown"));
    await flushMicrotasks();
    expect(context.resumeCount).toBe(1);
    expect(audio.snapshot().state).toBe("suspended");

    context.resumeShouldRun = true;
    target.dispatchEvent(new Event("keydown"));
    await flushMicrotasks();
    expect(context.resumeCount).toBe(2);
    expect(audio.snapshot().state).toBe("running");

    target.dispatchEvent(new Event("touchend"));
    await flushMicrotasks();
    expect(context.resumeCount).toBe(2);
  });

  it("stops active sources and closes its owned context exactly once", async () => {
    const context = new FakeAudioContext();
    const audio = new BrowserAudioRuntime(() => context);
    await audio.unlock();
    const loop = audio.playLoop(clip);
    const event = audio.playEvent(clip);
    expect(audio.snapshot().activeSources).toBe(2);

    await audio.dispose();
    expect(loop.stopped).toBe(true);
    expect(event!.stopped).toBe(true);
    expect(context.sources.map((source) => source.stopCount)).toEqual([1, 1]);
    expect(context.closeCount).toBe(1);
    expect(audio.snapshot()).toMatchObject({ state: "closed", pendingLoops: 0, activeSources: 0 });

    await audio.dispose();
    expect(context.closeCount).toBe(1);
    expect(() => audio.playLoop(clip)).toThrow(/disposed/);
  });

  it("rejects invalid loop and gain requests before touching Web Audio", () => {
    let factoryCalls = 0;
    const audio = new BrowserAudioRuntime(() => {
      factoryCalls += 1;
      return new FakeAudioContext();
    });
    expect(() => audio.playLoop(clip, { loop: { startFrame: 3, endFrame: 2 } })).toThrow(/loop/);
    expect(() => audio.playLoop(clip, { gain: -1 })).toThrow(/gain/);
    expect(() => audio.playLoop(clip, { playbackRate: 0 })).toThrow(/rate/);
    expect(() => audio.playMusicVoice(clip, { offsetFrame: 4 })).toThrow(/offset/);
    expect(factoryCalls).toBe(0);
  });
});
