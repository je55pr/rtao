import type { DialogueActionToken } from "../formats/dialogue";
import type { AuthoredAreaDescriptor } from "../formats/overworld";

const transitionActionOpcode = 0x14;

export type AreaTransitionDestinationKind = "standard-world" | "special-outdoor" | "bootstrap-special";

export interface AreaTransitionIntent {
  readonly kind: AreaTransitionDestinationKind;
  readonly areaIndex: number;
  readonly name: string;
  readonly areaCode: number;
  readonly fieldNumber?: number;
  readonly rawEntrySelector: number;
}

export function dialogueAreaTransitionIntent(
  action: DialogueActionToken,
  catalogue: readonly AuthoredAreaDescriptor[],
): AreaTransitionIntent | undefined {
  if (action.opcode !== transitionActionOpcode) return undefined;
  return classifyAreaTransitionOperands(action.operands, catalogue);
}

export function classifyAreaTransitionOperands(
  operands: ArrayLike<number>,
  catalogue: readonly AuthoredAreaDescriptor[],
): AreaTransitionIntent {
  if (operands.length !== 2) throw new Error(`Dialogue action 0x14 requires exactly two operands; received ${operands.length}.`);
  const areaIndex = operands[0] ?? -1;
  const rawEntrySelector = operands[1] ?? -1;
  const destination = catalogue.find((candidate) => candidate.areaIndex === areaIndex);
  if (!destination) throw new RangeError(`Dialogue action 0x14 targets unknown authored area ${areaIndex}.`);

  const common = {
    areaIndex: destination.areaIndex,
    name: destination.name,
    areaCode: destination.areaCode,
    rawEntrySelector,
  } as const;
  if (destination.areaIndex === 0) return { kind: "bootstrap-special", ...common };
  if (destination.fieldNumber !== undefined) {
    return { kind: "standard-world", ...common, fieldNumber: destination.fieldNumber };
  }
  return { kind: "special-outdoor", ...common };
}
