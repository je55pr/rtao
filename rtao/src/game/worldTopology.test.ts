import { describe, expect, it } from "vitest";
import {
  addressFromFieldNumber,
  allWorldFieldNumbers,
  fieldNumberFromAddress,
  isNearField,
  normalizeRenderPosition,
  nearbyWorldFieldNumbers,
  relativeRenderTranslation,
  sourceBase,
} from "./worldTopology";

describe("HG2 outdoor world topology", () => {
  it("maps all 64 base-4 filenames to unique 8x8 addresses", () => {
    const fields = allWorldFieldNumbers();
    expect(fields).toHaveLength(64);
    expect(new Set(fields).size).toBe(64);
    expect(addressFromFieldNumber(223)).toEqual({ column: 5, row: 5 });
    expect(addressFromFieldNumber(113)).toEqual({ column: 3, row: 3 });
    expect(addressFromFieldNumber(220)).toEqual({ column: 4, row: 4 });
    expect(fieldNumberFromAddress(5, 5)).toBe(223);
  });

  it("preserves the authored odd-row half-field stagger", () => {
    expect(sourceBase(223)).toEqual({ x: 8800, y: 8000 });
    expect(sourceBase(221)).toEqual({ x: 8000, y: 6400 });
    expect(relativeRenderTranslation(223, 221)).toEqual({ x: 800, y: -1600 });
  });

  it("places the same-row 223/222 seam edge-to-edge in reflected render space", () => {
    expect(relativeRenderTranslation(223, 222)).toEqual({ x: 1600, y: 0 });
    expect(isNearField(223, 222)).toBe(true);
    expect(isNearField(223, 113)).toBe(false);
  });

  it("keeps the browser port's intentional two-axis torus while retaining the row stagger", () => {
    const northEdge = normalizeRenderPosition(223, { x: 960, y: -1 });
    expect(northEdge.fieldNumber).toBe(221);
    expect(northEdge.localPosition.y).toBe(1599);

    const topRow = fieldNumberFromAddress(5, 0);
    const wrappedNorth = normalizeRenderPosition(topRow, { x: 800, y: -1 });
    expect(addressFromFieldNumber(wrappedNorth.fieldNumber).row).toBe(7);
    expect(wrappedNorth.localPosition.y).toBe(1599);
    expect(Math.abs(relativeRenderTranslation(topRow, wrappedNorth.fieldNumber).y)).toBe(1600);

    const east = normalizeRenderPosition(223, { x: 1601, y: 800 });
    expect(east.fieldNumber).toBe(222);
    expect(east.localPosition.x).toBe(1);
  });
  it("returns a wrapped local field ring with the centre first", () => {
    const fields = nearbyWorldFieldNumbers(223);
    expect(fields).toHaveLength(9);
    expect(fields[0]).toBe(223);
    expect(new Set(fields).size).toBe(9);
    expect(fields).toContain(221);
  });

});
