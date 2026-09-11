import { describe, expect, test } from "vitest";
import { canOpenPauseMenu } from "./pauseState";

const idle = {
  hasInstall: true,
  raceActive: false,
  dialogueActive: false,
  interiorActive: false,
  importActive: false,
  captureMode: false,
};

describe("pause menu availability", () => {
  test("opens over the world once an install is present", () => {
    expect(canOpenPauseMenu(idle)).toBe(true);
  });

  test("stays shut before anything is installed", () => {
    expect(canOpenPauseMenu({ ...idle, hasInstall: false })).toBe(false);
  });

  test("leaves Escape to the race, dialogue, interiors, imports and captures", () => {
    expect(canOpenPauseMenu({ ...idle, raceActive: true })).toBe(false);
    expect(canOpenPauseMenu({ ...idle, dialogueActive: true })).toBe(false);
    expect(canOpenPauseMenu({ ...idle, interiorActive: true })).toBe(false);
    expect(canOpenPauseMenu({ ...idle, importActive: true })).toBe(false);
    expect(canOpenPauseMenu({ ...idle, captureMode: true })).toBe(false);
  });
});
