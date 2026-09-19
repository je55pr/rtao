import type { SemanticAction } from "../input/semanticInput";

export type InputBindingConflictChoice = "keep" | "replace";
export type InputBindingConflictCommand = "previous" | "next" | "activate" | "cancel";

export function inputBindingConflictCommand(action: SemanticAction): InputBindingConflictCommand | undefined {
  if (action === "up" || action === "left") return "previous";
  if (action === "down" || action === "right") return "next";
  if (action === "confirm" || action === "interact") return "activate";
  if (action === "cancel") return "cancel";
  return undefined;
}

export function moveInputBindingConflictChoice(
  current: InputBindingConflictChoice,
  direction: number,
): InputBindingConflictChoice {
  if (direction === 0) return current;
  return current === "keep" ? "replace" : "keep";
}
