import { readFixedInteractionAtIndex, type FixedInteractionDefinition } from "../formats/overworld";
import type { NativeWarpCityDestination } from "./warpTravel";

export interface NativeSpecialOutdoorScene {
  readonly areaIndex: number;
  readonly areaCode: number;
  readonly actionSceneId: number;
  readonly sourcePath: string;
}

export interface NativeSpecialOutdoorEntry {
  readonly scene: NativeSpecialOutdoorScene;
  readonly interaction: FixedInteractionDefinition;
  readonly position: { readonly x: number; readonly z: number };
}

/**
 * PAL Cloud Hill is area 8 / area-code 64. It is hosted by ACTION/A16.BIN,
 * not a nonexistent FLD/064. See PAL_CLOUD_HILL_SPECIAL_OUTDOOR_2026-09-17.md.
 */
export const cloudHillSpecialOutdoorScene: NativeSpecialOutdoorScene = {
  areaIndex: 8,
  areaCode: 64,
  actionSceneId: 16,
  sourcePath: "ACTION/A16.BIN",
};

export function specialOutdoorSceneForAreaCode(areaCode: number): NativeSpecialOutdoorScene | undefined {
  return areaCode === cloudHillSpecialOutdoorScene.areaCode ? cloudHillSpecialOutdoorScene : undefined;
}

export function readSpecialOutdoorFixedInteractions(
  executable: Uint8Array,
  scene: NativeSpecialOutdoorScene,
  count: number,
): FixedInteractionDefinition[] {
  const interactions: FixedInteractionDefinition[] = [];
  for (let localIndex = 0; localIndex < count; localIndex += 1) {
    const interaction = readFixedInteractionAtIndex(executable, scene.areaIndex, localIndex);
    if (interaction) interactions.push(interaction);
  }
  return interactions;
}

export function resolveSpecialOutdoorWarpEntry(
  destination: NativeWarpCityDestination,
  executable: Uint8Array,
): NativeSpecialOutdoorEntry {
  const { intent } = destination;
  if (intent.kind !== "special-outdoor") throw new Error(`${destination.name} does not use the special-outdoor scene host.`);
  const scene = specialOutdoorSceneForAreaCode(intent.areaCode);
  if (!scene || scene.areaIndex !== destination.areaIndex) {
    throw new Error(`${destination.name} / area-code ${intent.areaCode} has no reconstructed special-outdoor scene host.`);
  }
  const interaction = readFixedInteractionAtIndex(executable, destination.areaIndex, intent.rawEntrySelector);
  if (!interaction || interaction.corners.length !== 4) {
    throw new Error(`${destination.name} selector ${intent.rawEntrySelector} has no authored fixed-interaction return edge.`);
  }
  return {
    scene,
    interaction,
    position: fixedInteractionReturnPosition(interaction),
  };
}

export function fixedInteractionReturnPosition(
  interaction: Pick<FixedInteractionDefinition, "corners">,
): { readonly x: number; readonly z: number } {
  const [a, b] = [interaction.corners[2], interaction.corners[3]];
  if (!a || !b) throw new Error("The authored fixed interaction has an incomplete return edge.");
  const sourceX = (a[0] + b[0]) * 0.5;
  const sourceZ = (a[1] + b[1]) * 0.5;
  return { x: 1600 - sourceX, z: sourceZ };
}
