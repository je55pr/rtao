import { describe, expect, it } from "vitest";
import {
  inputBindingConflictCommand,
  moveInputBindingConflictChoice,
} from "./inputBindingConflict";

describe("input binding conflict semantic flow", () => {
  it("maps existing semantic menu actions to a controller-operable confirmation flow", () => {
    expect(inputBindingConflictCommand("up")).toBe("previous");
    expect(inputBindingConflictCommand("left")).toBe("previous");
    expect(inputBindingConflictCommand("down")).toBe("next");
    expect(inputBindingConflictCommand("right")).toBe("next");
    expect(inputBindingConflictCommand("confirm")).toBe("activate");
    expect(inputBindingConflictCommand("interact")).toBe("activate");
    expect(inputBindingConflictCommand("cancel")).toBe("cancel");
    expect(inputBindingConflictCommand("boost")).toBeUndefined();
  });

  it("moves between the safe keep default and replacement choice", () => {
    expect(moveInputBindingConflictChoice("keep", 1)).toBe("replace");
    expect(moveInputBindingConflictChoice("keep", -1)).toBe("replace");
    expect(moveInputBindingConflictChoice("replace", 1)).toBe("keep");
    expect(moveInputBindingConflictChoice("replace", 0)).toBe("replace");
  });
});
