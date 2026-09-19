import type { AudioGainState } from "./browserAudio";

export type AudioSettingsChannel = "master" | "music" | "sfx";

export interface AudioChannelSettings {
  readonly volume: number;
  readonly muted: boolean;
}

export interface AudioSettingsState {
  readonly version: 1;
  readonly master: AudioChannelSettings;
  readonly music: AudioChannelSettings;
  readonly sfx: AudioChannelSettings;
}

export interface AudioSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const audioSettingsStorageKey = "rtao.audio-settings.v1";

const defaultState: AudioSettingsState = {
  version: 1,
  master: { volume: 1, muted: false },
  music: { volume: 1, muted: false },
  sfx: { volume: 1, muted: false },
};
function cloneState(state: AudioSettingsState): AudioSettingsState {
  return {
    version: 1,
    master: { ...state.master },
    music: { ...state.music },
    sfx: { ...state.sfx },
  };
}

function validChannel(value: unknown): value is AudioChannelSettings {
  if (!value || typeof value !== "object") return false;
  const channel = value as Partial<AudioChannelSettings>;
  return typeof channel.volume === "number"
    && Number.isFinite(channel.volume)
    && channel.volume >= 0
    && channel.volume <= 1
    && typeof channel.muted === "boolean";
}

function validatedState(raw: unknown): AudioSettingsState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Partial<AudioSettingsState>;
  if (candidate.version !== 1) return undefined;
  if (!validChannel(candidate.master) || !validChannel(candidate.music) || !validChannel(candidate.sfx)) {
    return undefined;
  }
  return cloneState(candidate as AudioSettingsState);
}

function assertVolume(volume: number): void {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError(`Audio volume must be finite and within 0..1; got ${volume}.`);
  }
}
export class AudioSettings {
  private stateValue: AudioSettingsState;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage?: AudioSettingsStorage,
    private readonly storageKey = audioSettingsStorageKey,
  ) {
    this.stateValue = this.load();
  }

  get state(): AudioSettingsState {
    return this.stateValue;
  }

  effectiveGains(): AudioGainState {
    return {
      master: this.stateValue.master.muted ? 0 : this.stateValue.master.volume,
      music: this.stateValue.music.muted ? 0 : this.stateValue.music.volume,
      sfx: this.stateValue.sfx.muted ? 0 : this.stateValue.sfx.volume,
    };
  }

  setVolume(channel: AudioSettingsChannel, volume: number): void {
    assertVolume(volume);
    if (this.stateValue[channel].volume === volume) return;
    this.stateValue = {
      ...this.stateValue,
      [channel]: { ...this.stateValue[channel], volume },
    };
    this.persistAndNotify();
  }
  setMuted(channel: AudioSettingsChannel, muted: boolean): void {
    if (this.stateValue[channel].muted === muted) return;
    this.stateValue = {
      ...this.stateValue,
      [channel]: { ...this.stateValue[channel], muted },
    };
    this.persistAndNotify();
  }

  toggleMuted(channel: AudioSettingsChannel): void {
    this.setMuted(channel, !this.stateValue[channel].muted);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): AudioSettingsState {
    if (!this.storage) return cloneState(defaultState);
    try {
      const text = this.storage.getItem(this.storageKey);
      if (!text) return cloneState(defaultState);
      return validatedState(JSON.parse(text)) ?? cloneState(defaultState);
    } catch {
      return cloneState(defaultState);
    }
  }

  private persistAndNotify(): void {
    if (this.storage) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(this.stateValue));
      } catch {
        // Host audio preferences are best-effort and never part of recovered PAL save state.
      }
    }
    for (const listener of this.listeners) listener();
  }
}
export function defaultAudioSettingsState(): AudioSettingsState {
  return cloneState(defaultState);
}
