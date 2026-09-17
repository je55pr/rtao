import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DialogueActionOpcode, type DialogueActionToken } from "../src/formats/dialogue";
import { readAuthoredAreaCatalogue } from "../src/formats/overworld";
import { dialogueAreaTransitionIntent } from "../src/game/areaTransition";

const executablePath = process.env.RTA_PAL_EXECUTABLE;

describe.skipIf(!executablePath)("PAL authored area-transition catalogue", () => {
  const executable = (): Uint8Array => new Uint8Array(readFileSync(executablePath!));

  test.each([
    [[1, 0], { kind: "standard-world", areaIndex: 1, name: "Peach Town", fieldNumber: 223, rawEntrySelector: 0 }],
    [[5, 0], { kind: "standard-world", areaIndex: 5, name: "Mushroom Road", fieldNumber: 210, rawEntrySelector: 0 }],
    [[8, 0], { kind: "special-outdoor", areaIndex: 8, name: "Cloud Hill", areaCode: 64, rawEntrySelector: 0 }],
    [[9, 20], { kind: "standard-world", areaIndex: 9, name: "My City", fieldNumber: 23, rawEntrySelector: 20 }],
    [[0, 0], { kind: "bootstrap-special", areaIndex: 0, name: "My Garage", rawEntrySelector: 0 }],
  ] as const)("maps executable action operands %j", (operands, expected) => {
    const bytes = executable();
    expect(dialogueAreaTransitionIntent(action(operands), readAuthoredAreaCatalogue(bytes))).toMatchObject(expected);
  });
});

function action(operands: readonly number[]): DialogueActionToken {
  return { kind: "action", offset: 0, opcode: DialogueActionOpcode.Transition, operands: new Uint8Array(operands) };
}
