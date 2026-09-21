import type { DialogueRuntimeState } from "../formats/dialogue";
import type { AuthoredAreaDescriptor, FixedInteractionDefinition } from "../formats/overworld";
import { classifyAreaTransitionOperands, type AreaTransitionIntent } from "./areaTransition";
import { fixedInteractionReturnPose } from "./fixedInteractionReturn";

export interface NativeWarpCityDestination {
  readonly areaIndex: number;
  readonly name: string;
  readonly intent: AreaTransitionIntent;
}

export interface NativeWarpWorldEntry {
  readonly destination: NativeWarpCityDestination;
  readonly interaction: FixedInteractionDefinition;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
}

type WarpRegistrationState = Pick<DialogueRuntimeState, "hasWarpRegistration">;

/** Native Pause Warp maps city destinations 1..9 directly to selector zero. */
export function resolveRegisteredWarpCityDestination(
  areaIndex: number,
  state: WarpRegistrationState,
  catalogue: readonly AuthoredAreaDescriptor[],
): NativeWarpCityDestination {
  if (!Number.isInteger(areaIndex) || areaIndex < 1 || areaIndex > 9) {
    throw new RangeError(`Native city Warp destination must be an authored area from 1 through 9; received ${areaIndex}.`);
  }
  if (!state.hasWarpRegistration(areaIndex)) {
    throw new Error(`Warp destination area ${areaIndex} is not registered.`);
  }
  const intent = classifyAreaTransitionOperands([areaIndex, 0], catalogue);
  return { areaIndex, name: intent.name, intent };
}

/**
 * PAL 0x002191D0 places selector-based ordinary-world returns at the midpoint
 * of authored interaction-zone corners 2 and 3. Browser X is source-X reflected.
 */
export function resolveWarpWorldEntry(
  destination: NativeWarpCityDestination,
  interactions: readonly FixedInteractionDefinition[],
): NativeWarpWorldEntry {
  const { intent } = destination;
  if (intent.kind !== "standard-world") {
    throw new Error(`${intent.name} uses the native ${intent.kind} transition path; no standard-world entry exists.`);
  }
  const interaction = interactions.find(
    (candidate) => candidate.areaIndex === destination.areaIndex && candidate.localIndex === intent.rawEntrySelector,
  );
  if (!interaction || interaction.fieldNumber !== intent.fieldNumber) {
    throw new Error(`${intent.name} selector ${intent.rawEntrySelector} has no authored fixed-interaction world entry.`);
  }
  let pose;
  try {
    pose = fixedInteractionReturnPose(interaction);
  } catch {
    throw new Error(`${intent.name} selector ${intent.rawEntrySelector} has no usable authored return edge.`);
  }
  return {
    destination,
    interaction,
    position: pose.position,
    yaw: pose.yaw,
  };
}
export async function runRegisteredCityWarp(
  areaIndex: number,
  state: WarpRegistrationState,
  catalogue: readonly AuthoredAreaDescriptor[],
  enter: (destination: NativeWarpCityDestination) => void | Promise<void>,
): Promise<NativeWarpCityDestination> {
  const destination = resolveRegisteredWarpCityDestination(areaIndex, state, catalogue);
  await enter(destination);
  return destination;
}
