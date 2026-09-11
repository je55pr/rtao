import { describe, expect, test } from "vitest";
import { raceStartSignalView } from "./raceStartPresentation";

describe("raceStartSignalView", () => {
  test("maps the PAL start-widget sequence without inventing numeric countdown glyphs", () => {
    expect([2, 3, 4, 5, 6].map((state) => raceStartSignalView(state).readyActive)).toEqual([
      [false, false, false, false],
      [true, false, false, false],
      [true, true, false, false],
      [true, true, true, false],
      [true, true, true, true],
    ]);
    expect(raceStartSignalView(5).releaseActive).toEqual([false, false, false, false]);
    expect(raceStartSignalView(6).releaseActive).toEqual([true, true, true, true]);
    expect(raceStartSignalView(6)).toMatchObject({ released: true, announcement: "Go" });
  });

  test("state zero removes the native widget after scheduler cleanup", () => {
    expect(raceStartSignalView(0)).toMatchObject({ visible: false, released: false, announcement: "" });
  });

  test("rejects UI states the recovered scheduler never presents", () => {
    expect(() => raceStartSignalView(1)).toThrow(/state 0 or 2\.\.6/);
    expect(() => raceStartSignalView(7)).toThrow(/state 0 or 2\.\.6/);
    expect(() => raceStartSignalView(2.5)).toThrow(/state 0 or 2\.\.6/);
  });
});
