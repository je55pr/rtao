import type { DialogueRuntimeState } from "../formats/dialogue";
import type { AuthoredAreaDescriptor } from "../formats/overworld";
import { resolveRegisteredWarpCityDestination } from "../game/warpTravel";

type WarpRegistrationState = Pick<DialogueRuntimeState, "hasWarpRegistration">;

export interface WarpMenuDestination {
  readonly areaIndex: number;
  readonly name: string;
}

export interface WarpMenuState {
  readonly destinations: readonly WarpMenuDestination[];
  readonly selectedIndex: number;
}

export function createWarpMenuState(
  state: WarpRegistrationState,
  catalogue: readonly AuthoredAreaDescriptor[],
): WarpMenuState {
  const destinations: WarpMenuDestination[] = [];
  for (let areaIndex = 1; areaIndex <= 9; areaIndex += 1) {
    if (!state.hasWarpRegistration(areaIndex)) continue;
    const destination = resolveRegisteredWarpCityDestination(areaIndex, state, catalogue);
    destinations.push({ areaIndex, name: destination.name });
  }
  return { destinations, selectedIndex: destinations.length ? 0 : -1 };
}

export function moveWarpMenuSelection(state: WarpMenuState, delta: number): WarpMenuState {
  const count = state.destinations.length;
  if (count === 0) return state;
  const current = state.selectedIndex >= 0 && state.selectedIndex < count ? state.selectedIndex : 0;
  const selectedIndex = ((current + delta) % count + count) % count;
  return selectedIndex === state.selectedIndex ? state : { ...state, selectedIndex };
}

export function selectedWarpMenuDestination(state: WarpMenuState): WarpMenuDestination | undefined {
  return state.selectedIndex >= 0 ? state.destinations[state.selectedIndex] : undefined;
}
