/**
 * Gating for the pause/settings layer. Races keep Escape for leaving the race,
 * and dialogue, interiors, imports and deterministic captures own their own
 * input, so pause must not compete with any of them.
 */

export interface PauseAvailability {
  readonly hasInstall: boolean;
  readonly raceActive: boolean;
  readonly dialogueActive: boolean;
  readonly interiorActive: boolean;
  readonly importActive: boolean;
  readonly captureMode: boolean;
}

export function canOpenPauseMenu(state: PauseAvailability): boolean {
  return state.hasInstall
    && !state.raceActive
    && !state.dialogueActive
    && !state.interiorActive
    && !state.importActive
    && !state.captureMode;
}
