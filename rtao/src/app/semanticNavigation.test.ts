import { describe, expect, it, vi } from "vitest";
import {
  cycleOptionIndex,
  focusNavigationEntry,
  moveNavigationIndex,
} from "./semanticNavigation";

describe("semantic gameplay UI navigation", () => {
  it("skips disabled and hidden controls while wrapping", () => {
    const entries = [
      {},
      { disabled: true },
      { hidden: true },
      {},
    ];

    expect(moveNavigationIndex(entries, 0, 1)).toBe(3);
    expect(moveNavigationIndex(entries, 3, 1)).toBe(0);
    expect(moveNavigationIndex(entries, 0, -1)).toBe(3);
    expect(moveNavigationIndex(entries, -1, 1)).toBe(0);
    expect(moveNavigationIndex(entries, -1, -1)).toBe(3);
  });

  it("reports no target when every control is unavailable", () => {
    expect(moveNavigationIndex([{ disabled: true }, { hidden: true }], -1, 1)).toBe(-1);
  });
  it("focuses the preferred available target or the first available fallback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const entries = [
      { disabled: true, focus: first },
      { focus: second },
      { focus: third },
    ];

    expect(focusNavigationEntry(entries, 2)).toBe(2);
    expect(third).toHaveBeenCalledOnce();

    expect(focusNavigationEntry(entries, 0)).toBe(1);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("cycles select-style options in both directions", () => {
    expect(cycleOptionIndex(0, 3, -1)).toBe(2);
    expect(cycleOptionIndex(2, 3, 1)).toBe(0);
    expect(cycleOptionIndex(1, 3, 1)).toBe(2);
    expect(cycleOptionIndex(-1, 3, 1)).toBe(1);
  });

  it("preserves the current index for an empty option set", () => {
    expect(cycleOptionIndex(4, 0, 1)).toBe(4);
  });
});
