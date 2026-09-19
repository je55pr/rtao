import { assertPcmClip, assertPcmLoop, type PcmClip, type PcmLoop } from "./pcm";

export type BrowserAudioContextState = "suspended" | "running" | "closed";

export interface AudioEndpointFacade {}

export interface AudioNodeFacade extends AudioEndpointFacade {
  connect(destination: AudioEndpointFacade): unknown;
  disconnect(): void;
}

export interface AudioParamFacade {
  value: number;
}

export interface GainNodeFacade extends AudioNodeFacade {
  readonly gain: AudioParamFacade;
}

export interface AudioBufferFacade {
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceFacade extends AudioNodeFacade {
  buffer: AudioBufferFacade | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  readonly playbackRate: AudioParamFacade;
  onended: (() => void) | null;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export interface AudioContextFacade {
  readonly destination: AudioEndpointFacade;
  readonly state: BrowserAudioContextState;
  readonly currentTime: number;
  createGain(): GainNodeFacade;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferFacade;
  createBufferSource(): AudioBufferSourceFacade;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type AudioContextFactory = () => AudioContextFacade;

export interface AudioGainState {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
}

export type AudioBus = "music" | "sfx";

export interface AudioPlaybackOptions {
  readonly gain?: number;
  readonly playbackRate?: number;
}
export interface AudioLoopOptions extends AudioPlaybackOptions {
  readonly bus?: AudioBus;
  readonly loop?: PcmLoop;
}

export interface AudioMusicVoiceOptions extends AudioPlaybackOptions {
  readonly loop?: PcmLoop;
  readonly offsetFrame?: number;
  /** Absolute AudioContext time used for gapless native stream chunk scheduling. */
  readonly startAtSeconds?: number;
}

export interface AudioPlaybackHandle {
  readonly stopped: boolean;
  stop(): void;
  setGain(gain: number): void;
  setPlaybackRate(playbackRate: number): void;
}

export interface BrowserAudioSnapshot {
  readonly state: "locked" | BrowserAudioContextState;
  readonly gains: AudioGainState;
  readonly pendingLoops: number;
  readonly activeSources: number;
}

interface AudioGraph {
  readonly master: GainNodeFacade;
  readonly music: GainNodeFacade;
  readonly sfx: GainNodeFacade;
}

interface PlaybackState {
  stopped: boolean;
  cleaned: boolean;
  gain: number;
  playbackRate: number;
  source?: AudioBufferSourceFacade;
  localGain?: GainNodeFacade;
}
interface PendingLoop {
  readonly state: PlaybackState;
  readonly clip: PcmClip;
  readonly bus: AudioBus;
  readonly loop?: PcmLoop;
  readonly offsetFrame?: number;
  readonly startAtSeconds?: number;
}

function assertGain(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} gain must be finite and non-negative; got ${value}.`);
  }
}

function assertPlaybackRate(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Playback rate must be finite and positive; got ${value}.`);
  }
}

function assertPlaybackOptions(options: AudioPlaybackOptions): void {
  if (options.gain !== undefined) assertGain(options.gain, "Playback");
  if (options.playbackRate !== undefined) assertPlaybackRate(options.playbackRate);
}

function defaultAudioContextFactory(): AudioContextFacade {
  const Constructor = globalThis.AudioContext;
  if (!Constructor) throw new Error("Web Audio is unavailable in this browser.");
  return new Constructor() as unknown as AudioContextFacade;
}

export class BrowserAudioRuntime {
  private context?: AudioContextFacade;
  private graph?: AudioGraph;
  private disposed = false;
  private unlocking?: Promise<boolean>;
  private masterGain = 1;
  private musicGain = 1;
  private sfxGain = 1;
  private readonly pendingLoops = new Map<PlaybackState, PendingLoop>();
  private readonly activeSources = new Set<PlaybackState>();
  private readonly buffers = new WeakMap<PcmClip, AudioBufferFacade>();

  constructor(private readonly contextFactory: AudioContextFactory = defaultAudioContextFactory) {}

  snapshot(): BrowserAudioSnapshot {
    return {
      state: this.disposed ? "closed" : (this.context?.state ?? "locked"),
      gains: { master: this.masterGain, music: this.musicGain, sfx: this.sfxGain },
      pendingLoops: this.pendingLoops.size,
      activeSources: this.activeSources.size,
    };
  }

  setGains(gains: Partial<AudioGainState>): void {
    this.assertOpen();
    if (gains.master !== undefined) {
      assertGain(gains.master, "Master");
      this.masterGain = gains.master;
      if (this.graph) this.graph.master.gain.value = gains.master;
    }
    if (gains.music !== undefined) {
      assertGain(gains.music, "Music");
      this.musicGain = gains.music;
      if (this.graph) this.graph.music.gain.value = gains.music;
    }
    if (gains.sfx !== undefined) {
      assertGain(gains.sfx, "SFX");
      this.sfxGain = gains.sfx;
      if (this.graph) this.graph.sfx.gain.value = gains.sfx;
    }
  }

  /** Lazily creates/resumes Web Audio. Call from a trusted browser gesture. */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.context?.state === "running") {
      this.startPendingLoops();
      return true;
    }
    if (this.unlocking) return this.unlocking;
    const attempt = this.unlockInternal();
    this.unlocking = attempt;
    try {
      return await attempt;
    } finally {
      if (this.unlocking === attempt) this.unlocking = undefined;
    }
  }

  /** Loop requests survive autoplay lock and start after a later successful unlock. */
  playLoop(clip: PcmClip, options: AudioLoopOptions = {}): AudioPlaybackHandle {
    return this.queuePlayback(clip, options, options.bus ?? "music", options.loop ?? {
      startFrame: 0,
      endFrame: clip.frameCount,
    });
  }

  /**
   * Music voices are queued through autoplay lock like loops, but may be finite.
   * This is used by native sequencers where sample lifetime is owned by the
   * recovered bytecode rather than by a fabricated whole-clip loop.
   */
  playMusicVoice(clip: PcmClip, options: AudioMusicVoiceOptions = {}): AudioPlaybackHandle {
    if (options.startAtSeconds !== undefined && (!Number.isFinite(options.startAtSeconds) || options.startAtSeconds < 0)) {
      throw new RangeError(`Music voice start time must be finite and non-negative; got ${options.startAtSeconds}.`);
    }
    return this.queuePlayback(clip, options, "music", options.loop, options.offsetFrame, options.startAtSeconds);
  }

  /** Current Web Audio clock while unlocked; stream schedulers use this without owning the context. */
  audioTimeSeconds(): number | undefined {
    return this.context?.state === "running" ? this.context.currentTime : undefined;
  }

  /** One-shots are deliberately not queued while locked, avoiding a delayed burst after unlock. */
  playEvent(clip: PcmClip, options: AudioPlaybackOptions = {}): AudioPlaybackHandle | null {
    this.assertOpen();
    assertPcmClip(clip);
    assertPlaybackOptions(options);
    if (this.context?.state !== "running" || !this.graph) return null;
    const { state, handle } = this.createHandle(options);
    this.startPlayback(state, clip, this.graph.sfx);
    return handle;
  }

  /** Stops owned sources, disconnects the graph, and closes the owned AudioContext. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of [...this.pendingLoops.keys(), ...this.activeSources]) this.stopState(state);
    this.pendingLoops.clear();
    this.activeSources.clear();
    this.graph?.music.disconnect();
    this.graph?.sfx.disconnect();
    this.graph?.master.disconnect();
    const context = this.context;
    this.graph = undefined;
    this.context = undefined;
    if (context && context.state !== "closed") await context.close();
  }

  private queuePlayback(
    clip: PcmClip,
    options: AudioPlaybackOptions,
    bus: AudioBus,
    loop?: PcmLoop,
    offsetFrame?: number,
    startAtSeconds?: number,
  ): AudioPlaybackHandle {
    this.assertOpen();
    assertPcmClip(clip);
    assertPlaybackOptions(options);
    if (loop) assertPcmLoop(loop, clip);
    if (offsetFrame !== undefined && (!Number.isSafeInteger(offsetFrame) || offsetFrame < 0 || offsetFrame >= clip.frameCount)) {
      throw new RangeError(`Playback offset frame ${offsetFrame} is outside clip frame range 0..${clip.frameCount - 1}.`);
    }
    const { state, handle } = this.createHandle(options);
    const pending = {
      state,
      clip,
      bus,
      ...(loop ? { loop } : {}),
      ...(offsetFrame !== undefined ? { offsetFrame } : {}),
      ...(startAtSeconds !== undefined ? { startAtSeconds } : {}),
    };
    if (this.context?.state === "running" && this.graph) {
      this.startPlayback(state, clip, this.graph[bus], loop, offsetFrame, startAtSeconds);
    } else {
      this.pendingLoops.set(state, pending);
    }
    return handle;
  }

  private async unlockInternal(): Promise<boolean> {
    try {
      const context = this.ensureContext();
      if (context.state !== "running") await context.resume();
      if (this.disposed || context.state !== "running") return false;
      this.startPendingLoops();
      return true;
    } catch {
      return false;
    }
  }

  private ensureContext(): AudioContextFacade {
    if (this.context) return this.context;
    const context = this.contextFactory();
    const master = context.createGain();
    const music = context.createGain();
    const sfx = context.createGain();
    master.gain.value = this.masterGain;
    music.gain.value = this.musicGain;
    sfx.gain.value = this.sfxGain;
    music.connect(master);
    sfx.connect(master);
    master.connect(context.destination);
    this.context = context;
    this.graph = { master, music, sfx };
    return context;
  }

  private startPendingLoops(): void {
    if (!this.graph || this.context?.state !== "running") return;
    for (const [state, pending] of [...this.pendingLoops]) {
      this.pendingLoops.delete(state);
      if (state.stopped) continue;
      this.startPlayback(
        state,
        pending.clip,
        this.graph[pending.bus],
        pending.loop,
        pending.offsetFrame,
        pending.startAtSeconds,
      );
    }
  }

  private startPlayback(
    state: PlaybackState,
    clip: PcmClip,
    bus: GainNodeFacade,
    loop?: PcmLoop,
    offsetFrame = 0,
    startAtSeconds?: number,
  ): void {
    if (state.stopped) return;
    const context = this.context;
    if (!context) throw new Error("Audio context is not available.");
    const source = context.createBufferSource();
    const localGain = context.createGain();
    source.buffer = this.audioBuffer(clip);
    source.playbackRate.value = state.playbackRate;
    localGain.gain.value = state.gain;
    if (loop) {
      source.loop = true;
      source.loopStart = loop.startFrame / clip.sampleRate;
      source.loopEnd = loop.endFrame / clip.sampleRate;
    }
    source.connect(localGain);
    localGain.connect(bus);
    state.source = source;
    state.localGain = localGain;
    state.cleaned = false;
    source.onended = () => {
      state.stopped = true;
      this.finishState(state);
    };
    this.activeSources.add(state);
    try {
      source.start(startAtSeconds ?? 0, offsetFrame / clip.sampleRate);
    } catch (error) {
      state.stopped = true;
      this.finishState(state);
      throw error;
    }
  }

  private audioBuffer(clip: PcmClip): AudioBufferFacade {
    const cached = this.buffers.get(clip);
    if (cached) return cached;
    const context = this.context;
    if (!context) throw new Error("Audio context is not available.");
    const buffer = context.createBuffer(clip.channels.length, clip.frameCount, clip.sampleRate);
    for (let index = 0; index < clip.channels.length; index += 1) {
      buffer.getChannelData(index).set(clip.channels[index]!);
    }
    this.buffers.set(clip, buffer);
    return buffer;
  }

  private createHandle(options: AudioPlaybackOptions): { state: PlaybackState; handle: AudioPlaybackHandle } {
    const state: PlaybackState = {
      stopped: false,
      cleaned: false,
      gain: options.gain ?? 1,
      playbackRate: options.playbackRate ?? 1,
    };
    return {
      state,
      handle: {
        get stopped() {
          return state.stopped;
        },
        stop: () => this.stopState(state),
        setGain: (gain) => {
          assertGain(gain, "Playback");
          state.gain = gain;
          if (!state.stopped && state.localGain) state.localGain.gain.value = gain;
        },
        setPlaybackRate: (playbackRate) => {
          assertPlaybackRate(playbackRate);
          state.playbackRate = playbackRate;
          if (!state.stopped && state.source) state.source.playbackRate.value = playbackRate;
        },
      },
    };
  }

  private stopState(state: PlaybackState): void {
    if (state.stopped && state.cleaned) return;
    state.stopped = true;
    this.pendingLoops.delete(state);
    try {
      state.source?.stop(0);
    } catch {
      // A naturally ended AudioBufferSourceNode cannot be stopped twice.
    }
    this.finishState(state);
  }

  private finishState(state: PlaybackState): void {
    if (state.cleaned) return;
    state.cleaned = true;
    this.activeSources.delete(state);
    if (state.source) {
      state.source.onended = null;
      state.source.disconnect();
      state.source = undefined;
    }
    state.localGain?.disconnect();
    state.localGain = undefined;
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Browser audio runtime is disposed.");
  }
}

export function installBrowserAudioUnlock(
  audio: BrowserAudioRuntime,
  target: EventTarget = window,
): () => void {
  const events = ["pointerdown", "keydown", "touchend"] as const;
  let attached = true;
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    for (const event of events) target.removeEventListener(event, attempt);
  };
  const attempt = (): void => {
    void audio.unlock().then((unlocked) => {
      if (unlocked) detach();
    });
  };
  for (const event of events) target.addEventListener(event, attempt);
  return detach;
}
