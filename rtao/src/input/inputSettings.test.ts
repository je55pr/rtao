import { describe, expect, it } from "vitest";
import {
  defaultInputBindingProfile,
  InputSettings,
  inputSettingsStorageKey,
} from "./inputSettings";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("InputSettings", () => {
  it("persists host bindings independently through its browser settings key", () => {
    const storage = new MemoryStorage();
    const first = new InputSettings(storage);

    expect(first.rebind("keyboard", "interact", "KeyQ")).toEqual({
      status: "applied",
      conflicts: [],
    });
    expect(first.rebind("gamepad", "interact", 4)).toEqual({
      status: "applied",
      conflicts: [],
    });

    const restored = new InputSettings(storage);
    expect(restored.keyboardBinding("KeyQ")?.action).toBe("interact");
    expect(restored.gamepadButtons("interact")).toEqual([4]);
    expect(storage.values.has(inputSettingsStorageKey)).toBe(true);
  });

  it("reports conflicts before optionally replacing the old owner", () => {
    const settings = new InputSettings();

    expect(settings.rebind("keyboard", "boost", "KeyE")).toEqual({
      status: "conflict",
      conflicts: [{ action: "interact", device: "keyboard" }],
    });
    expect(settings.keyboardBinding("KeyE")?.action).toBe("interact");

    expect(settings.rebind("keyboard", "boost", "KeyE", "replace")).toEqual({
      status: "applied",
      conflicts: [{ action: "interact", device: "keyboard" }],
    });
    expect(settings.keyboardBinding("KeyE")?.action).toBe("boost");
    expect(settings.profile.keyboard.interact).toEqual([]);
  });

  it("persists an accepted conflict replacement without mutating a rejected probe", () => {
    const storage = new MemoryStorage();
    const settings = new InputSettings(storage);

    expect(settings.rebind("gamepad", "boost", 12)).toMatchObject({ status: "conflict" });
    expect(settings.gamepadButtons("up")).toEqual([12]);
    expect(new InputSettings(storage).gamepadButtons("up")).toEqual([12]);

    expect(settings.rebind("gamepad", "boost", 12, "replace")).toMatchObject({ status: "applied" });
    const restored = new InputSettings(storage);
    expect(restored.gamepadButtons("boost")).toEqual([12]);
    expect(restored.gamepadButtons("up")).toEqual([]);
  });

  it("refuses replacements that remove the last confirm-like or back route", () => {
    const keyboard = new InputSettings();
    expect(keyboard.rebind("keyboard", "confirm", "KeyE", "replace").status).toBe("applied");
    expect(keyboard.profile.keyboard.interact).toEqual([]);
    expect(keyboard.rebind("keyboard", "boost", "KeyE", "replace")).toMatchObject({
      status: "unsafe",
    });
    expect(keyboard.keyboardBinding("KeyE")?.action).toBe("confirm");

    const gamepad = new InputSettings();
    expect(gamepad.rebind("gamepad", "cancel", 9).status).toBe("applied");
    expect(gamepad.gamepadButtons("cancel")).toEqual([9]);
    expect(gamepad.rebind("gamepad", "boost", 9, "replace")).toMatchObject({
      status: "unsafe",
    });
    expect(gamepad.gamepadButtons("cancel")).toEqual([9]);
  });

  it("restores and persists defaults after edits", () => {
    const storage = new MemoryStorage();
    const settings = new InputSettings(storage);
    settings.rebind("keyboard", "boost", "KeyB");
    settings.rebind("gamepad", "boost", 4);

    settings.restoreDefaults();

    expect(settings.profile).toEqual(defaultInputBindingProfile());
    expect(new InputSettings(storage).profile).toEqual(defaultInputBindingProfile());
  });

  it("falls back to defaults for corrupt or unsafe persisted data", () => {
    const storage = new MemoryStorage();
    storage.setItem(inputSettingsStorageKey, "{not json");
    expect(new InputSettings(storage).profile).toEqual(defaultInputBindingProfile());

    const unsafe = defaultInputBindingProfile();
    storage.setItem(inputSettingsStorageKey, JSON.stringify({
      ...unsafe,
      keyboard: { ...unsafe.keyboard, cancel: [] },
    }));
    expect(new InputSettings(storage).profile).toEqual(defaultInputBindingProfile());
  });
});
