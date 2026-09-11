import { describe, expect, test } from "vitest";
import { fadeEnabled, SceneFade } from "./sceneTransition";

function harness(reducedMotion = false) {
  const calls: { covered: boolean; instant: boolean }[] = [];
  const pending: (() => void)[] = [];
  const fade = new SceneFade(
    { setCovered: (covered, instant) => { calls.push({ covered, instant }); } },
    (reveal) => { pending.push(reveal); },
    () => reducedMotion,
  );
  return { fade, calls, runScheduled: () => { for (const reveal of pending.splice(0)) reveal(); } };
}

describe("fade gating", () => {
  test("fades a normal transition", () => {
    expect(fadeEnabled({ enabled: true, reducedMotion: false })).toBe(true);
  });

  test("cuts straight through for reduced motion or a deterministic capture", () => {
    expect(fadeEnabled({ enabled: true, reducedMotion: true })).toBe(false);
    expect(fadeEnabled({ enabled: false, reducedMotion: false })).toBe(false);
  });
});

describe("scene fade", () => {
  test("covers on the current frame, then fades the cover away", () => {
    const { fade, calls, runScheduled } = harness();
    fade.flash();
    expect(calls).toEqual([{ covered: true, instant: true }]);
    runScheduled();
    expect(calls).toEqual([{ covered: true, instant: true }, { covered: false, instant: false }]);
  });

  test("never touches the surface while disabled for a capture", () => {
    const { fade, calls, runScheduled } = harness();
    fade.setEnabled(false);
    fade.flash();
    runScheduled();
    expect(calls).toEqual([]);
  });

  test("never touches the surface under reduced motion", () => {
    const { fade, calls, runScheduled } = harness(true);
    fade.flash();
    runScheduled();
    expect(calls).toEqual([]);
  });

  test("can be re-enabled after a capture", () => {
    const { fade, calls } = harness();
    fade.setEnabled(false);
    fade.flash();
    fade.setEnabled(true);
    fade.flash();
    expect(calls).toEqual([{ covered: true, instant: true }]);
  });
});
