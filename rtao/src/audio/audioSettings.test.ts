import { describe, expect, it, vi } from "vitest";
import {
  AudioSettings,
  audioSettingsStorageKey,
  defaultAudioSettingsState,
} from "./audioSettings";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error("write blocked");
    this.values.set(key, value);
  }
}

describe("AudioSettings", () => {
  it("persists browser audio preferences under their own host-settings key", () => {
    const storage = new MemoryStorage();
    const first = new AudioSettings(storage);

    first.setVolume("master", 0.8);
    first.setVolume("music", 0.45);
    first.setVolume("sfx", 0.65);
    first.setMuted("music", true);

    const restored = new AudioSettings(storage);
    expect(restored.state).toEqual({
      version: 1,
      master: { volume: 0.8, muted: false },
      music: { volume: 0.45, muted: true },
      sfx: { volume: 0.65, muted: false },
    });
    expect(storage.values.has(audioSettingsStorageKey)).toBe(true);
    expect(audioSettingsStorageKey).toBe("rtao.audio-settings.v1");
  });

  it("maps mute state onto browser graph gains without losing stored volumes", () => {
    const settings = new AudioSettings();
    settings.setVolume("master", 0.75);
    settings.setVolume("music", 0.4);
    settings.setVolume("sfx", 0.6);
    settings.setMuted("master", true);
    settings.setMuted("music", true);

    expect(settings.effectiveGains()).toEqual({ master: 0, music: 0, sfx: 0.6 });

    settings.setMuted("master", false);
    settings.setMuted("music", false);
    expect(settings.effectiveGains()).toEqual({ master: 0.75, music: 0.4, sfx: 0.6 });
  });
  it("falls back to defaults when persisted settings are corrupt or invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(audioSettingsStorageKey, "{not json");
    expect(new AudioSettings(storage).state).toEqual(defaultAudioSettingsState());

    storage.setItem(audioSettingsStorageKey, JSON.stringify({
      version: 1,
      master: { volume: 2, muted: false },
      music: { volume: 1, muted: false },
      sfx: { volume: 1, muted: false },
    }));
    expect(new AudioSettings(storage).state).toEqual(defaultAudioSettingsState());
  });

  it("survives unavailable host storage while keeping live settings usable", () => {
    const storage = new MemoryStorage();
    storage.failRead = true;
    const settings = new AudioSettings(storage);
    expect(settings.state).toEqual(defaultAudioSettingsState());

    storage.failRead = false;
    storage.failWrite = true;
    const listener = vi.fn();
    settings.subscribe(listener);
    expect(() => settings.setVolume("sfx", 0.5)).not.toThrow();
    expect(settings.state.sfx.volume).toBe(0.5);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("rejects out-of-range volume values instead of persisting malformed state", () => {
    const settings = new AudioSettings();
    expect(() => settings.setVolume("music", -0.01)).toThrow(/0\.\.1/);
    expect(() => settings.setVolume("music", 1.01)).toThrow(/0\.\.1/);
    expect(settings.state).toEqual(defaultAudioSettingsState());
  });
});
