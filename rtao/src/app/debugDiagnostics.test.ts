import { describe, expect, test } from "vitest";
import { diagnosticsReportText, FrameRateSampler, liveDiagnosticsRows, surfaceLabel } from "./debugDiagnostics";

const live = {
  mode: "driving",
  fps: 59.6,
  fieldNumber: 223,
  position: { x: 1582.5, y: 31.25, z: 40 },
  surface: "paved-road",
  loadedSectors: 9,
  installStage: "complete",
} as const;

describe("live diagnostics rows", () => {
  test("keeps raw reconstruction values out of the game HUD and in the overlay", () => {
    const rows = liveDiagnosticsRows(live);
    expect(rows.map((row) => row.label)).toEqual(["Mode", "FPS", "Cache", "Field", "Position", "Surface"]);
    expect(rows[1]!.value).toBe("60");
    expect(rows[3]!.value).toBe("FLD/223");
    expect(rows[4]!.value).toBe("1582.50, 31.25, 40.00");
    expect(rows[5]!.value).toBe("Paved road");
  });

  test("renders placeholders when nothing is being driven", () => {
    const rows = liveDiagnosticsRows({ ...live, mode: "overview", fps: undefined, fieldNumber: undefined, position: undefined, surface: undefined });
    expect(rows.map((row) => row.value)).toEqual(["overview", "—", "complete · 9 live", "—", "—", "—"]);
  });

  test("labels every native driving surface", () => {
    expect(surfaceLabel("dirt")).toBe("Dirt");
    expect(surfaceLabel("ice")).toBe("Ice");
  });
});

describe("copyable diagnostics report", () => {
  test("aligns labels and records the capture context", () => {
    const text = diagnosticsReportText(
      [{ label: "Mode", value: "driving" }, { label: "Position", value: "1, 2, 3" }],
      { capturedAt: "2026-09-11T10:00:00.000Z", userAgent: "TestBrowser/1.0" },
    );
    expect(text).toBe([
      "RTAO developer diagnostics",
      "Captured  2026-09-11T10:00:00.000Z",
      "Browser   TestBrowser/1.0",
      "",
      "Mode      driving",
      "Position  1, 2, 3",
    ].join("\n"));
  });
});

describe("frame rate sampler", () => {
  test("reports nothing until it has seen two frames", () => {
    const sampler = new FrameRateSampler();
    expect(sampler.fps).toBeUndefined();
    sampler.sample(0);
    expect(sampler.fps).toBeUndefined();
  });

  test("averages the recent frame interval", () => {
    const sampler = new FrameRateSampler();
    for (let frame = 0; frame <= 10; frame += 1) sampler.sample(frame * 20);
    expect(sampler.fps).toBeCloseTo(50);
  });

  test("drops samples outside the rolling window", () => {
    const sampler = new FrameRateSampler(2);
    sampler.sample(0);
    sampler.sample(100);
    sampler.sample(120);
    sampler.sample(140);
    expect(sampler.fps).toBeCloseTo(50);
  });

  test("ignores repeated timestamps and clears on reset", () => {
    const sampler = new FrameRateSampler();
    sampler.sample(10);
    sampler.sample(10);
    expect(sampler.fps).toBeUndefined();
    sampler.sample(30);
    expect(sampler.fps).toBeCloseTo(50);
    sampler.reset();
    expect(sampler.fps).toBeUndefined();
  });
});
