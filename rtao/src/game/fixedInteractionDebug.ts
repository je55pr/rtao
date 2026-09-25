import type { FixedInteractionDefinition } from "../formats/overworld";
import { findNearestFixedInteraction } from "./fixedInteractionProximity";
import { fieldExtent } from "./worldTopology";

export interface FixedInteractionDebugPolygon {
  readonly interaction: FixedInteractionDefinition;
  readonly id: string;
  readonly label: string;
  readonly points: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  readonly returnEdge: readonly [readonly [number, number], readonly [number, number]];
  readonly nearest: boolean;
}

export interface FixedInteractionDebugState {
  readonly fieldNumber: number;
  readonly polygons: readonly FixedInteractionDebugPolygon[];
  readonly nearest?: FixedInteractionDefinition;
}

function isUsableInteraction(interaction: FixedInteractionDefinition): boolean {
  return interaction.corners.length === 4
    && interaction.corners.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z) && x !== -1 && z !== -1);
}
function renderPoint(corner: readonly [number, number]): readonly [number, number] {
  return [fieldExtent - corner[0], corner[1]];
}

export function fixedInteractionDebugState(
  interactions: readonly FixedInteractionDefinition[],
  fieldNumber: number,
  position?: { readonly x: number; readonly z: number },
): FixedInteractionDebugState {
  const fieldInteractions = interactions.filter(
    (interaction) => interaction.fieldNumber === fieldNumber && isUsableInteraction(interaction),
  );
  const nearest = position
    ? findNearestFixedInteraction(fieldInteractions, fieldNumber, position, Number.POSITIVE_INFINITY)?.interaction
    : undefined;
  const polygons = fieldInteractions.map((interaction): FixedInteractionDebugPolygon => {
    const points = [
      renderPoint(interaction.corners[0]!),
      renderPoint(interaction.corners[1]!),
      renderPoint(interaction.corners[2]!),
      renderPoint(interaction.corners[3]!),
    ] as const;
    return {
      interaction,
      id: `fixed-${interaction.areaIndex}-${interaction.localIndex}`,
      label: `A${interaction.areaIndex}/${String(interaction.localIndex).padStart(2, "0")} ${interaction.name}`,
      points,
      returnEdge: [points[2], points[3]],
      nearest: interaction === nearest,
    };
  });
  return { fieldNumber, polygons, ...(nearest ? { nearest } : {}) };
}
