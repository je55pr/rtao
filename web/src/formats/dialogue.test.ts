import { describe, expect, test } from "vitest";
import {
  decodeDialoguePages,
  DialogueActionOpcode,
  DialogueFlow,
  DialogueOpcode,
  DialogueRuntimeState,
  inspectDialogueEntity,
  tokenizeDialogue,
  type DialogueEntity,
  type DialogueVariant,
} from "./dialogue";

describe("PAL dialogue bytecode", () => {
  test("keeps pre-text operands separate from text and page formatting", () => {
    const bytes = new Uint8Array([DialogueOpcode.SetFlag, 0x2a, ...ascii("Hello"), DialogueOpcode.PageBreak, ...ascii("World"), DialogueActionOpcode.YesNoDefaultFirst, 2, 3]);
    const tokens = tokenizeDialogue(bytes);
    expect(tokens[0]).toMatchObject({ kind: "control", opcode: DialogueOpcode.SetFlag, operands: new Uint8Array([0x2a]) });
    expect(decodeDialoguePages(tokens)).toEqual(["Hello", "World"]);
    expect(tokens.at(-1)).toMatchObject({ kind: "action", opcode: DialogueActionOpcode.YesNoDefaultFirst, operands: new Uint8Array([2, 3]) });
  });

  test("decodes variable-length executable menu labels and targets", () => {
    const bytes = new Uint8Array([...ascii("Choose"), DialogueActionOpcode.Menu, ...ascii("Parts"), 0, ...ascii("Race"), 0, DialogueActionOpcode.Menu, 4, 8]);
    const menu = tokenizeDialogue(bytes).find((token) => token.kind === "menu");
    expect(menu?.options.map((option) => [option.text, option.targetSlot])).toEqual([["Parts", 4], ["Race", 8]]);
  });

  test("consumes the two-byte action-07 payload used by authored bartender streams", () => {
    const tokens = tokenizeDialogue(new Uint8Array([...ascii("OK then..."), DialogueOpcode.PageBreak, DialogueActionOpcode.GrantIndexedFlag, 0, 0]));
    expect(tokens.at(-1)).toMatchObject({
      kind: "action",
      opcode: DialogueActionOpcode.GrantIndexedFlag,
      operands: new Uint8Array([0, 0]),
    });
  });

  test("restores only zero operands omitted at a proven bounded stream edge", () => {
    const boundedYesNo = tokenizeDialogue(
      new Uint8Array([...ascii("Again?"), DialogueOpcode.PageBreak, DialogueActionOpcode.YesNoDefaultSecond, 0]),
      { restoreBoundedTrailingZeros: true },
    );
    expect(boundedYesNo.at(-1)).toMatchObject({
      kind: "action",
      opcode: DialogueActionOpcode.YesNoDefaultSecond,
      operands: new Uint8Array([0, 0]),
    });
    expect(() => tokenizeDialogue(
      new Uint8Array([...ascii("Again?"), DialogueActionOpcode.YesNoDefaultSecond, 0]),
    )).toThrow(/truncated/);
    expect(() => tokenizeDialogue(
      new Uint8Array([...ascii("Again?"), DialogueActionOpcode.YesNoDefaultSecond, 5]),
      { restoreBoundedTrailingZeros: true },
    )).toThrow(/truncated/);
  });

  test("executes proven flag branches without inventing host actions", () => {
    const entity: DialogueEntity = { areaIndex: 1, entityIndex: 0, name: "Test", entityAddress: 1, variants: [
      variant(1, [{ kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfFlagClear, operands: new Uint8Array([9, 2]), phase: "pre-text" }], ["hidden"]),
      variant(2, [{ kind: "control", offset: 0, opcode: DialogueOpcode.SetFlag, operands: new Uint8Array([9]), phase: "pre-text" }], ["first"]),
    ] };
    const state = new DialogueRuntimeState();
    const flow = new DialogueFlow(entity, state, 1);
    expect(flow.currentSlot).toBe(2);
    expect(flow.currentPage).toBe("first");
    expect(state.flags.has(9)).toBe(true);
  });

  test("branches on and consumes PAL indexed inventory flags", () => {
    const entity: DialogueEntity = { areaIndex: 1, entityIndex: 5, name: "Policeman", entityAddress: 1, variants: [
      variant(1, [{ kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfIndexedFlagSet, operands: new Uint8Array([15, 23, 2]), phase: "pre-text" }], ["No wallet"]),
      variant(2, [{ kind: "control", offset: 0, opcode: DialogueOpcode.ClearIndexedFlag, operands: new Uint8Array([15, 23]), phase: "pre-text" }], ["Tim's wallet!"]),
    ] };
    const state = new DialogueRuntimeState();
    state.setIndexedFlag(15, 23);
    const flow = new DialogueFlow(entity, state, 1);
    expect(flow.currentSlot).toBe(2);
    expect(flow.currentPage).toBe("Tim's wallet!");
    expect(state.hasIndexedFlag(15, 23)).toBe(false);
  });

  test("branches on an executable-proven stamp reward", () => {
    const entity: DialogueEntity = { areaIndex: 6, entityIndex: 9, name: "Lettar", entityAddress: 1, variants: [
      variant(1, [{ kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfStampSet, operands: new Uint8Array([65, 7]), phase: "pre-text" }], ["Still waiting"]),
      variant(7, [], ["Thank you for the delivery!"]),
    ] };
    const state = new DialogueRuntimeState();
    state.addStamp(65);
    const flow = new DialogueFlow(entity, state, 1);
    expect(flow.currentSlot).toBe(7);
    expect(flow.currentPage).toBe("Thank you for the delivery!");
    expect(state.hasStamp(65)).toBe(true);
  });

  test("uses and clears the native fixed-interaction first-meeting bit", () => {
    const entity: DialogueEntity = { areaIndex: 6, entityIndex: 16, name: "Emily", entityAddress: 1, variants: [
      variant(1, [{ kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfFirstInteraction, operands: new Uint8Array([6]), phase: "pre-text" }], ["Returning greeting"]),
      variant(6, [], ["First meeting"]),
    ] };
    const state = new DialogueRuntimeState();

    const first = new DialogueFlow(entity, state, 1);
    expect(first.currentSlot).toBe(6);
    expect(first.currentPage).toBe("First meeting");
    expect(state.metFixedInteractionEntries()).toEqual([[6, 16]]);

    const returning = new DialogueFlow(entity, state, 1);
    expect(returning.currentSlot).toBe(1);
    expect(returning.currentPage).toBe("Returning greeting");
  });

  test("does not expose a choice whose decoded target lies outside its entity", () => {
    const entity: DialogueEntity = { areaIndex: 1, entityIndex: 18, name: "Quick-Pic", entityAddress: 1, variants: [
      variant(1, [{ kind: "action", offset: 0, opcode: DialogueActionOpcode.YesNoDefaultSecond, operands: new Uint8Array([0, 81]) }], ["Welcome"]),
    ] };
    const flow = new DialogueFlow(entity, new DialogueRuntimeState(), 1);
    expect(flow.currentChoices).toEqual([]);
    expect(flow.currentExternalAction).toMatchObject({ opcode: DialogueActionOpcode.YesNoDefaultSecond });
  });

  test("ends a native zero-target yes/no action for either answer", () => {
    const entity: DialogueEntity = { areaIndex: 6, entityIndex: 16, name: "Emily", entityAddress: 1, variants: [
      variant(6, [{ kind: "action", offset: 0, opcode: DialogueActionOpcode.YesNoDefaultSecond, operands: new Uint8Array([0, 0]) }], ["Have you heard of the Papu flower?"]),
    ] };
    for (const answer of [0, 1]) {
      const flow = new DialogueFlow(entity, new DialogueRuntimeState(), 6);
      flow.choose(answer);
      expect(flow.ended).toBe(true);
      expect(flow.currentSlot).toBe(0);
    }
  });

  test("serializes same-valued condition and action opcodes without conflating their phases", () => {
    const entity: DialogueEntity = { areaIndex: 1, entityIndex: 5, name: "Quest", entityAddress: 0x1234, variants: [
      variant(1, [
        { kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfQuickPicTaken, operands: new Uint8Array([9, 2]), phase: "pre-text" },
        { kind: "text", offset: 3, text: "Item?" },
        { kind: "action", offset: 8, opcode: DialogueActionOpcode.NumericChoice, operands: new Uint8Array([0, 0, 0]) },
      ], ["Item?"]),
    ] };
    const trace = inspectDialogueEntity(entity);
    expect(trace.variants[0]?.tokens).toEqual([
      { kind: "control", offset: 0, opcode: 5, operands: [9, 2], phase: "pre-text" },
      { kind: "text", offset: 3, text: "Item?" },
      { kind: "action", offset: 8, opcode: 5, operands: [0, 0, 0] },
    ]);
  });

  test("branches to the authored retake prompt only after its Quick-Pic bit is recorded", () => {
    const entity: DialogueEntity = { areaIndex: 1, entityIndex: 18, name: "Quick-Pic Shop No.1", entityAddress: 1, variants: [
      variant(2, [{ kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfQuickPicTaken, operands: new Uint8Array([1, 3]), phase: "pre-text" }], ["Do you want to take a picture?"]),
      variant(3, [], ["Would you like to take it again?"]),
    ] };
    const state = new DialogueRuntimeState();
    expect(new DialogueFlow(entity, state, 2).currentSlot).toBe(2);
    state.addQuickPicPhoto(1);
    expect(new DialogueFlow(entity, state, 2).currentSlot).toBe(3);
  });
});

function ascii(value: string): number[] { return [...new TextEncoder().encode(value)]; }

function variant(pointerTableSlot: number, tokens: DialogueVariant["tokens"], pages: string[]): DialogueVariant {
  return { pointerTableSlot, textAddress: pointerTableSlot, bytes: new Uint8Array(), tokens, pages };
}
