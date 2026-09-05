import type { DialogueActionToken, DialogueEntity, DialogueFlowChoice } from "../formats/dialogue";

const selectTeamCar = 0x04;
const numericChoice = 0x05;
const grantIndexedFlag = 0x07;
const grantStamps = 0x0d;
const raceSelect = 0x08;
const saveData = 0x0e;
const startRace = 0x03;
const transition = 0x14;
const equipSelectedPart = 0x15;
const redeemAdvertisingCake = 0x16;
const exitGame = 0x0f;
const recordQuickPicPhoto = 0x11;
const shopOrService = 0x13;

export interface InteriorHostActionPresentation {
  readonly title: string;
  readonly detail: string;
  readonly returnSlot?: number;
  readonly leaveLabel?: string;
}

export function defaultChoiceIndex(choices: DialogueFlowChoice[]): number {
  const index = choices.findIndex((choice) => choice.isDefault);
  return index >= 0 ? index : 0;
}

/** Native callback 0x0023be00 starts at 1 and clamps the selector to 0..99. */
export const nativeNumericChoiceInitialValue = 1;

export function stepNativeNumericChoice(value: number, direction: -1 | 1): number {
  const current = Math.max(0, Math.min(99, Math.trunc(value)));
  return Math.max(0, Math.min(99, current + direction));
}

/**
 * Native callback 0x0023be00 compares the chosen number with operand zero,
 * then returns operand one for a match and operand two otherwise.
 */
export function nativeNumericChoiceTarget(action: DialogueActionToken, value: number): number {
  const expected = action.operands[0] ?? 0;
  return value === expected ? (action.operands[1] ?? 0) : (action.operands[2] ?? 0);
}

/** Q's Factory has a proven slot-04 entry; ordinary fixed entities enter at 01. */
export function fixedInteriorStartSlot(entity: DialogueEntity): number {
  if (/^Q's Factory$/i.test(entity.name) && entity.variants.some((variant) => variant.pointerTableSlot === 4)) return 4;
  if (entity.variants.some((variant) => variant.pointerTableSlot === 1)) return 1;
  const first = entity.variants.reduce((lowest, variant) => Math.min(lowest, variant.pointerTableSlot), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(first)) throw new Error(`Dialogue entity '${entity.name}' contains no variants.`);
  return first;
}

/** Some generic-room action bytes are host-contextual rather than global opcodes. */
export function describeFixedInteriorHostAction(entityName: string, action: DialogueActionToken): InteriorHostActionPresentation {
  if (/^Quick-Pic Shop No[.,]\s*\d+$/i.test(entityName) && action.opcode === 0x02 && (action.operands[0] ?? 0) === 0) {
    return {
      title: "Quick-Pic counter",
      detail: "Continue from the original welcome into this numbered photo booth.",
      returnSlot: 2,
    };
  }
  if (action.opcode === raceSelect && action.operands.length === 1 && (action.operands[0] ?? 0) === 0) {
    return {
      title: "Return to town",
      detail: "This original teammate conversation ends after its dialogue.",
      leaveLabel: "Return to town",
    };
  }
  if (/^Paint Shop(?: Staff)?$/i.test(entityName) && action.opcode === startRace && (action.operands[0] ?? 0) === 0) {
    return {
      title: "Paint selector",
      detail: "Primary and secondary body colours use the original RGB444 channels and wheels use the original 12-step palette. Body and wheel changes cost 100 Cake each, so changing both costs 200 Cake.",
      returnSlot: 4,
    };
  }
  if (/^Second-hand shop$/i.test(entityName) && action.opcode === shopOrService && (action.operands[0] ?? 0) === 3) {
    return {
      title: "Sell unwanted parts",
      detail: "The original host removes one owned copy and credits half of its base price, rounded down.",
      returnSlot: 3,
    };
  }
  return describeInteriorHostAction(action, null);
}

/** Keeps unfinished host systems explicit while preserving proven VM return edges. */
export function describeInteriorHostAction(action: DialogueActionToken, unknownReturnSlot: number | null = 4): InteriorHostActionPresentation {
  switch (action.opcode) {
    case selectTeamCar:
      return {
        title: "Change-parts selector",
        detail: "The browser host opens the development parts catalogue for the player Q62.",
        returnSlot: positive(action.operands[0]),
      };
    case raceSelect:
      return {
        title: "Race selector",
        detail: "Race listings and licence progression are the next host subsystem for this menu.",
        returnSlot: positive(action.operands[1]),
      };
    case saveData:
      return {
        title: "Save data",
        detail: "Browser save-state persistence is not connected to the original memory-card flow yet.",
        returnSlot: positive(action.operands[0]),
      };
    case startRace:
      if (unknownReturnSlot === null) {
        if ((action.operands[0] ?? 0) === 0) {
          return {
            title: "Return to town",
            detail: "This original fixed interaction ends after its dialogue.",
            leaveLabel: "Return to town",
          };
        }
        return {
          title: "Original activity screen",
          detail: "This room's original fixed-screen activity is not connected to the browser host yet.",
          returnSlot: positive(action.operands[0]),
        };
      }
      return {
        title: "Start race",
        detail: "The selected race is decoded, but the race runtime has not been ported yet.",
        returnSlot: 4,
      };
    case numericChoice: {
      const expected = action.operands[0] ?? 0;
      const success = action.operands[1] ?? 0;
      const failure = action.operands[2] ?? 0;
      return {
        title: expected > 0 ? "Numeric answer" : "Numeric selection",
        detail: success > 0 || failure > 0
          ? `The original 0–99 selector expects ${expected} and routes a match/mismatch to dialogue slots ${success}/${failure}.`
          : "The original 0–99 selector returns from this interaction after confirmation.",
      };
    }
    case grantIndexedFlag: {
      const namespace = action.operands[0] ?? 0;
      const index = action.operands[1] ?? 0;
      return {
        title: namespace === 15 ? "Receive quest item" : "Receive original reward",
        detail: `The original host records indexed progress [${namespace},${index}]. This recovered state is retained by the browser install.`,
        leaveLabel: "Return to town",
      };
    }
    case grantStamps: {
      const stamps = [...action.operands].filter((stampId) => stampId > 0);
      return {
        title: stamps.length === 1 ? "Receive stamp" : "Receive stamps",
        detail: `The original host awards stamp${stamps.length === 1 ? "" : "s"} ${stamps.join(", ") || "(none)"}. Recovered stamp progress is retained by the browser install.`,
        leaveLabel: "Return to town",
      };
    }
    case recordQuickPicPhoto:
      return {
        title: "Take Quick-Pic photo",
        detail: `Capture Quick-Pic No. ${action.operands[0] ?? 0}. Keeping it records the original photo-completion bit in the browser install.`,
        returnSlot: positive(action.operands[1]),
      };
    case shopOrService:
      return {
        title: "Shop / service screen",
        detail: "The original catalogue or service host is not reconstructed yet.",
        // Parts/Body and related service streams encode the post-host dialogue
        // target directly in their sole operand.
        returnSlot: positive(action.operands[0]),
      };
    case transition:
      return {
        title: "Area transition",
        detail: "This original dialogue edge leads to an area transition that is not connected yet.",
        returnSlot: 4,
      };
    case equipSelectedPart: {
      const category = action.operands[0] ?? 0;
      const item = action.operands[1] ?? 0;
      return {
        title: "Fit original equipment",
        detail: `The original host fits equipment category ${category}, item ${item}, and retains that selector in the browser install.`,
        returnSlot: positive(action.operands[2]),
      };
    }
    case redeemAdvertisingCake: {
      const sponsorIndex = action.operands[0] ?? 0;
      return {
        title: "Redeem advertising Cake",
        detail: `PAL sponsor ${sponsorIndex} converts each complete 1,000-unit fitted-sign distance block into ${10 * (sponsorIndex + 1)} Cake and retains the remaining distance.`,
        returnSlot: positive(action.operands[1]),
        leaveLabel: "Return to town",
      };
    }
    case exitGame:
      return {
        title: "Exit game",
        detail: "A browser page has no console power-off action. You can return to town instead.",
        leaveLabel: "Return to town",
      };
    default:
      return {
        title: `Original action 0x${action.opcode.toString(16).padStart(2, "0")}`,
        detail: "This executable action is preserved in the dialogue stream but has no browser host implementation yet.",
        returnSlot: unknownReturnSlot ?? undefined,
      };
  }
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}
