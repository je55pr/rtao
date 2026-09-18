import { describe, expect, test } from "vitest";
import {
  classifyNativeSfxRequest,
  nativeSfxRequestForEvent,
  nativeSfxRoutes,
} from "./nativeSfx";

describe("native SFX routing", () => {
  test("preserves the recovered common event request identities", () => {
    expect(nativeSfxRequestForEvent("menu-confirm")).toBe(0x001a);
    expect(nativeSfxRequestForEvent("menu-cancel")).toBe(0x001b);
    expect(nativeSfxRequestForEvent("menu-navigate")).toBe(0x001d);
    expect(nativeSfxRequestForEvent("dialogue-open")).toBe(0x0025);
    expect(nativeSfxRequestForEvent("interaction-advance")).toBe(0x0026);
    expect(nativeSfxRequestForEvent("vehicle-contact")).toBe(0x0028);
    expect(nativeSfxRequestForEvent("equipment-fit")).toBe(0x0303);
    expect(nativeSfxRequestForEvent("race-countdown")).toBe(0x002d);
    expect(nativeSfxRequestForEvent("race-lap")).toBe(0x002e);
    expect(nativeSfxRequestForEvent("race-best-lap")).toBe(0x002f);
  });

  test("keeps packed cancellation distinct from playback", () => {
    expect(classifyNativeSfxRequest(0x8010)).toEqual({ kind: "cancel", request: 0x8010 });
    expect(classifyNativeSfxRequest(0x8011)).toEqual({ kind: "cancel", request: 0x8011 });
  });
  test("does not fake the unrecovered boost loop sequencer", () => {
    expect(classifyNativeSfxRequest(0x0010)).toMatchObject({
      kind: "unsupported-loop",
      request: 0x0010,
    });
    expect(classifyNativeSfxRequest(0x0011)).toMatchObject({
      kind: "unsupported-loop",
      request: 0x0011,
    });
  });

  test("classifies recovered one-shots by their packed bank and index", () => {
    for (const route of Object.values(nativeSfxRoutes)) {
      expect(classifyNativeSfxRequest(route.request)).toEqual({ kind: "one-shot", route });
      expect(route.request & 0xff).toBe(route.index);
      expect((route.request >>> 8) & 0x0f).toBe(route.bank);
      expect(route.priority).toBe(144);
      expect(route.sampleStart % 16).toBe(0);
      expect(route.sampleEnd % 16).toBe(0);
      expect(route.sampleEnd).toBeGreaterThan(route.sampleStart);
    }
  });

  test("leaves unknown requests unknown", () => {
    expect(classifyNativeSfxRequest(0x007f)).toEqual({ kind: "unknown", request: 0x007f });
  });
});
