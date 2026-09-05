import { describe, expect, test } from "vitest";
import { DialogueActionOpcode, type DialogueActionToken, type DialogueEntity } from "../formats/dialogue";
import {
  defaultChoiceIndex,
  describeFixedInteriorHostAction,
  describeInteriorHostAction,
  fixedInteriorStartSlot,
  nativeNumericChoiceInitialValue,
  nativeNumericChoiceTarget,
  stepNativeNumericChoice,
} from "./interiorFlow";

describe("interior host action boundary", () => {
  test("uses the executable's proven race-selector cancel target", () => {
    expect(describeInteriorHostAction(action(DialogueActionOpcode.RaceSelect, [0x0f, 0x04]))).toMatchObject({
      title: "Race selector",
      returnSlot: 4,
    });
  });

  test("keeps a missing change-parts selector explicit", () => {
    expect(describeInteriorHostAction(action(DialogueActionOpcode.SelectTeamCar, [0x04]))).toMatchObject({
      title: "Change-parts selector",
      returnSlot: 4,
    });
  });

  test("honours yes/no default selection", () => {
    expect(defaultChoiceIndex([
      { text: "Yes", targetSlot: 1, isDefault: false },
      { text: "No", targetSlot: 2, isDefault: true },
    ])).toBe(1);
  });

  test("starts ordinary fixed interiors at their first authored dialogue slot", () => {
    const entity = { name: "Bartender", variants: [{ pointerTableSlot: 1 }, { pointerTableSlot: 4 }] } as DialogueEntity;
    expect(fixedInteriorStartSlot(entity)).toBe(1);
  });

  test("preserves Q's Factory's proven slot-04 entry", () => {
    const entity = { name: "Q's Factory", variants: [{ pointerTableSlot: 1 }, { pointerTableSlot: 4 }] } as DialogueEntity;
    expect(fixedInteriorStartSlot(entity)).toBe(4);
  });

  test("can terminate an unreconstructed generic action instead of assuming Q's Factory slot 04", () => {
    expect(describeInteriorHostAction(action(DialogueActionOpcode.GrantIndexedFlag, [0, 0]), null).returnSlot).toBeUndefined();
  });

  test("preserves authored generic host return edges for shops and activities", () => {
    expect(describeInteriorHostAction(action(DialogueActionOpcode.Unknown13, [2]), null)).toMatchObject({
      title: "Shop / service screen",
      returnSlot: 2,
    });
    expect(describeInteriorHostAction(action(DialogueActionOpcode.StartRace, [3]), null)).toMatchObject({
      title: "Original activity screen",
      returnSlot: 3,
    });
    expect(describeInteriorHostAction(action(DialogueActionOpcode.RecordQuickPicPhoto, [1, 6]), null)).toMatchObject({
      title: "Take Quick-Pic photo",
      returnSlot: 6,
    });
  });

  test.each(["Quick-Pic Shop No.1", "Quick-Pic Shop No.2", "Quick-Pic Shop No,60"])(
    "bridges %s's bounded welcome into its proven question slot",
    (entityName) => {
      expect(describeFixedInteriorHostAction(entityName, action(DialogueActionOpcode.YesNoDefaultSecond, [0, 81]))).toMatchObject({
      title: "Quick-Pic counter",
      returnSlot: 2,
      });
    },
  );

  test("treats Bartender's zero-target action-03 as the authored conversation exit", () => {
    expect(describeInteriorHostAction(action(DialogueActionOpcode.StartRace, [0]), null)).toEqual({
      title: "Return to town",
      detail: "This original fixed interaction ends after its dialogue.",
      leaveLabel: "Return to town",
    });
  });

  test("keeps Paint Shop's contextual action-03 at its service boundary and authored farewell", () => {
    const paintAction = action(DialogueActionOpcode.StartRace, [0]);
    expect(describeFixedInteriorHostAction("Paint Shop", paintAction)).toMatchObject({
      title: "Paint selector",
      returnSlot: 4,
    });
    expect(describeFixedInteriorHostAction("Bartender", paintAction).leaveLabel).toBe("Return to town");
  });

  test("routes Cloud Hill's Second-hand shop to its native half-price sale host", () => {
    expect(describeFixedInteriorHostAction("Second-hand shop", action(DialogueActionOpcode.Unknown13, [3]))).toEqual({
      title: "Sell unwanted parts",
      detail: "The original host removes one owned copy and credits half of its base price, rounded down.",
      returnSlot: 3,
    });
  });

  test("treats the teammate conversation's one-byte zero race action as an authored exit", () => {
    const teammateExit = action(DialogueActionOpcode.RaceSelect, [0]);
    expect(describeFixedInteriorHostAction("Wolf", teammateExit)).toEqual({
      title: "Return to town",
      detail: "This original teammate conversation ends after its dialogue.",
      leaveLabel: "Return to town",
    });
    expect(describeFixedInteriorHostAction("Q's Factory", action(DialogueActionOpcode.RaceSelect, [0x0f, 0x04]))).toMatchObject({
      title: "Race selector",
      returnSlot: 4,
    });
  });

  test("describes the native action-05 numeric selector for answer and zero-target forms", () => {
    expect(describeFixedInteriorHostAction("Laz", action(DialogueActionOpcode.NumericChoice, [22, 9, 8]))).toEqual({
      title: "Numeric answer",
      detail: "The original 0–99 selector expects 22 and routes a match/mismatch to dialogue slots 9/8.",
    });
    expect(describeFixedInteriorHostAction("Peach FM Front Desk", action(DialogueActionOpcode.NumericChoice, [0, 0, 0]))).toEqual({
      title: "Numeric selection",
      detail: "The original 0–99 selector returns from this interaction after confirmation.",
    });
  });

  test("matches native action-05 initial value, clamping and result routing", () => {
    const numeric = action(DialogueActionOpcode.NumericChoice, [22, 9, 8]);
    expect(nativeNumericChoiceInitialValue).toBe(1);
    expect(stepNativeNumericChoice(0, -1)).toBe(0);
    expect(stepNativeNumericChoice(99, 1)).toBe(99);
    expect(stepNativeNumericChoice(21, 1)).toBe(22);
    expect(nativeNumericChoiceTarget(numeric, 22)).toBe(9);
    expect(nativeNumericChoiceTarget(numeric, 21)).toBe(8);
    expect(nativeNumericChoiceTarget(action(DialogueActionOpcode.NumericChoice, [0, 0, 0]), 17)).toBe(0);
  });

  test("describes the executable-proven indexed reward without inventing a dialogue return", () => {
    expect(describeFixedInteriorHostAction("Shop Manager", action(DialogueActionOpcode.GrantIndexedFlag, [15, 39]))).toEqual({
      title: "Receive quest item",
      detail: "The original host records indexed progress [15,39]. This recovered state is retained by the browser install.",
      leaveLabel: "Return to town",
    });
  });

  test("describes executable-proven single and paired stamp awards", () => {
    expect(describeFixedInteriorHostAction("Policeman", action(DialogueActionOpcode.GrantStamps, [5]))).toEqual({
      title: "Receive stamp",
      detail: "The original host awards stamp 5. Recovered stamp progress is retained by the browser install.",
      leaveLabel: "Return to town",
    });
    expect(describeFixedInteriorHostAction("Racer", action(DialogueActionOpcode.GrantStamps, [21, 22])).title).toBe("Receive stamps");
  });

  test("preserves the native equipment selector write and authored return edge", () => {
    expect(describeFixedInteriorHostAction("Peach Town Owner", action(DialogueActionOpcode.EquipSelectedPart, [11, 4, 9]))).toEqual({
      title: "Fit original equipment",
      detail: "The original host fits equipment category 11, item 4, and retains that selector in the browser install.",
      returnSlot: 9,
    });
  });

  test("describes the PAL advertising redemption rate and authored return edge", () => {
    expect(describeFixedInteriorHostAction("Chocolat", action(DialogueActionOpcode.RedeemAdvertisingCake, [2, 8, 0]))).toEqual({
      title: "Redeem advertising Cake",
      detail: "PAL sponsor 2 converts each complete 1,000-unit fitted-sign distance block into 30 Cake and retains the remaining distance.",
      returnSlot: 8,
      leaveLabel: "Return to town",
    });
    expect(describeFixedInteriorHostAction("Johnny", action(DialogueActionOpcode.RedeemAdvertisingCake, [0, 0, 0]))).toMatchObject({
      returnSlot: undefined,
      leaveLabel: "Return to town",
    });
  });
});

function action(opcode: DialogueActionOpcode, operands: number[]): DialogueActionToken {
  return { kind: "action", offset: 0, opcode, operands: new Uint8Array(operands) };
}
